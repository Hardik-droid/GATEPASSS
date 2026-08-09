import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Flashlight,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import {
  fetchScannerAccess,
  type ScanResult,
  type ScannerAccess,
  type ScannerGrant,
  updateScannerAccess,
  validateScannerQr,
} from "../scannerApi";
import KineticHeading from "../components/ui/KineticHeading";

import { isEventExpired } from "../eventUtils";

function cameraErrorMessage(error: unknown): string {
  if (!window.isSecureContext) {
    return "Camera access requires HTTPS. Open the secure GatePass URL.";
  }
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission is blocked. Allow it in your browser settings, then try again.";
    }
    if (error.name === "NotFoundError") {
      return "No camera was found on this device.";
    }
    if (error.name === "NotReadableError") {
      return "The camera is being used by another app. Close it there and retry.";
    }
  }
  return "The camera could not start. Check permission and try again.";
}

function entryWindow(start: string, end: string): string {
  const format = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${format.format(new Date(start))} – ${format.format(new Date(end))}`;
}

interface ScannerProps {
  onToast?: (type: "success" | "error" | "warning" | "info", text: string) => void;
}

export default function Scanner({ onToast }: ScannerProps) {
  const [access, setAccess] = useState<ScannerAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [torchActive, setTorchActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantEventId, setGrantEventId] = useState("");
  const [grantGate, setGrantGate] = useState("Main Gate");
  const [grantBusy, setGrantBusy] = useState(false);
  const [_nowTick, setNowTick] = useState(Date.now());

  // 30-second interval re-evaluation so events reaching end_time auto-hide from scanner selector.
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const cameraStartInFlightRef = useRef(false);
  const scanInFlightRef = useRef(false);
  const cameraSessionRef = useRef(0);

  const visibleAssignments = (access?.assignments ?? []).filter(
    (assignment) => !isEventExpired(assignment.end_time),
  );

  const selectedAssignment = visibleAssignments.find(
    (assignment) => assignment.event_id === selectedEventId,
  );

  const stopCamera = () => {
    cameraSessionRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setTorchActive(false);
    setCameraActive(false);
  };

  const loadAccess = async () => {
    stopCamera();
    setScanResult(null);
    setCameraError(null);
    setAccessLoading(true);
    setAccessError(null);
    try {
      const next = await fetchScannerAccess();
      setAccess(next);
      const activeAssignments = next.assignments.filter(
        (assignment) => !isEventExpired(assignment.end_time),
      );
      setSelectedEventId((current) => {
        const selected = activeAssignments.find(
          (assignment) => assignment.event_id === current,
        );
        return selected?.accepting_entries
          ? current
          : activeAssignments.find((assignment) => assignment.accepting_entries)?.event_id
            ?? selected?.event_id
            ?? activeAssignments[0]?.event_id
            ?? "";
      });
      setGrantEventId((current) =>
        next.assignments.some((assignment) => assignment.event_id === current)
          ? current
          : next.assignments[0]?.event_id ?? "",
      );
    } catch (error) {
      setAccessError(
        error instanceof Error ? error.message : "Could not load scanner access.",
      );
    } finally {
      setAccessLoading(false);
    }
  };

  useEffect(() => {
    void loadAccess();
  }, []);

  useEffect(() => stopCamera, []);

  const submitQr = async (payload: string) => {
    if (!selectedAssignment) {
      scanInFlightRef.current = false;
      setCameraError("Choose an event before scanning.");
      return;
    }
    setScanning(true);
    setCameraError(null);
    setScanResult(null);
    try {
      const result = await validateScannerQr(selectedAssignment.event_id, payload);
      setScanResult(result);
      const approved = result.decision === "APPROVED";
      onToast?.(
        approved ? "success" : "error",
        approved
          ? `Scan successful — ${result.attendee?.name ?? "attendee"} approved at ${selectedAssignment.gate}`
          : result.message,
      );
      if ("vibrate" in navigator) {
        // Distinct haptics so an operator can tell approved from denied
        // without looking up from the queue.
        navigator.vibrate(approved ? 120 : [90, 70, 90]);
      }
    } catch (error) {
      setCameraError(
        error instanceof Error ? error.message : "The scanner service is unavailable.",
      );
    } finally {
      scanInFlightRef.current = false;
      setScanning(false);
    }
  };

  const startCamera = async () => {
    if (
      !selectedAssignment ||
      !videoRef.current ||
      cameraStartInFlightRef.current ||
      scanInFlightRef.current
    ) {
      return;
    }
    if (!selectedAssignment.accepting_entries) {
      setCameraError(
        `Entry is closed for this event. Window: ${entryWindow(selectedAssignment.start_time, selectedAssignment.end_time)}.`,
      );
      return;
    }
    cameraStartInFlightRef.current = true;
    setCameraStarting(true);
    stopCamera();
    const cameraSession = cameraSessionRef.current;
    setScanResult(null);
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not support camera scanning.");
      cameraStartInFlightRef.current = false;
      setCameraStarting(false);
      return;
    }

    try {
      // Use zxing's decodeFromConstraints which handles camera setup internally
      // and works reliably across mobile browsers (iOS Safari, Android Chrome).
      // Avoid specific width/height — many mobile cameras fail with ideal constraints.
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 800,
      });
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        },
        videoRef.current,
        (result, _error, callbackControls) => {
          if (
            !result ||
            scanInFlightRef.current ||
            cameraSession !== cameraSessionRef.current
          ) return;
          scanInFlightRef.current = true;
          callbackControls.stop();
          controlsRef.current = null;
          setCameraActive(false);
          void submitQr(result.getText());
        },
      );
      if (cameraSession !== cameraSessionRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setCameraActive(true);
    } catch (error) {
      stopCamera();
      setCameraError(cameraErrorMessage(error));
    } finally {
      cameraStartInFlightRef.current = false;
      setCameraStarting(false);
    }
  };

  const toggleTorch = async () => {
    const controls = controlsRef.current;
    if (!controls?.switchTorch) return;
    try {
      await controls.switchTorch(!torchActive);
      setTorchActive((active) => !active);
    } catch {
      setCameraError("Torch control is not supported by this camera.");
    }
  };

  const saveGrant = async (allowed: boolean, grant?: ScannerGrant) => {
    const email = grant?.email ?? grantEmail.trim();
    const eventId = grant?.event_id ?? grantEventId;
    const gate = grant?.gate ?? grantGate.trim();
    if (!email || !eventId || !gate) return;
    setGrantBusy(true);
    setAccessError(null);
    try {
      await updateScannerAccess({
        email,
        event_id: eventId,
        gate,
        allowed,
      });
      setGrantEmail("");
      await loadAccess();
    } catch (error) {
      setAccessError(
        error instanceof Error ? error.message : "Could not update scanner access.",
      );
    } finally {
      setGrantBusy(false);
    }
  };

  if (accessLoading) {
    return (
      <div className="min-h-[60dvh] grid place-items-center">
        <div className="flex items-center gap-3 text-charcoal-dark font-bold">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" />
          Checking scanner access…
        </div>
      </div>
    );
  }

  if (accessError && !access) {
    return (
      <div className="min-h-[60dvh] grid place-items-center px-4">
        <div className="max-w-md w-full bg-white border border-red-200 p-6 text-center shadow-sm">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-xl font-black text-charcoal-dark">Scanner unavailable</h1>
          <p className="mt-2 text-sm text-neutral-600">{accessError}</p>
          <button
            onClick={() => void loadAccess()}
            className="mt-5 min-h-12 w-full bg-black text-white font-black"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!access?.can_scan) {
    return (
      <div className="min-h-[60dvh] grid place-items-center px-4">
        <div className="max-w-md w-full bg-white border border-neutral-200 p-7 text-center shadow-sm">
          <LockKeyhole className="w-11 h-11 text-neutral-400 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-charcoal-dark">Scanner access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Ask the Owner to grant your signed-in email access to an event gate.
          </p>
          <Link
            to="/"
            className="mt-6 min-h-12 flex items-center justify-center bg-black text-white font-black"
          >
            Back to GatePass
          </Link>
        </div>
      </div>
    );
  }

  if (visibleAssignments.length === 0) {
    return (
      <div className="grid min-h-[60dvh] place-items-center px-4">
        <div className="w-full max-w-md border border-neutral-200 bg-white p-7 text-center shadow-sm">
          <MapPin className="mx-auto mb-4 size-11 text-neutral-400" />
          <h1 className="text-2xl font-black text-charcoal-dark">
            No scan location available
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            {access.is_owner
              ? "No active event is synced to the scanner yet. Open the Control Room to create or restore an event, then refresh."
              : "Ask the owner to assign your signed-in email to an event gate."}
          </p>
          <div className={`mt-6 grid gap-3 ${access.is_owner ? "sm:grid-cols-2" : ""}`}>
            {access.is_owner && (
              <Link
                to="/organizer"
                className="flex min-h-12 items-center justify-center bg-black px-4 text-sm font-black text-white"
              >
                Open Control Room
              </Link>
            )}
            <button
              onClick={() => void loadAccess()}
              className="flex min-h-12 items-center justify-center gap-2 border border-neutral-300 bg-white px-4 text-sm font-black text-charcoal-dark"
            >
              <RefreshCw className="size-4" />
              Refresh events
            </button>
          </div>
        </div>
      </div>
    );
  }

  const approved = scanResult?.decision === "APPROVED";
  const ownership = scanResult?.ownership;
  const acceptingEntries = selectedAssignment?.accepting_entries === true;

  return (
    <div className="mx-auto w-full max-w-6xl pb-4 xl:pb-8">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to GatePass"
          className="grid size-11 shrink-0 place-items-center border border-neutral-200 bg-white text-charcoal-dark"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <KineticHeading
            accent="Ready for entry."
            primary="Mobile Scanner"
            size="md"
            lightMode={true}
          />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="order-1 overflow-hidden bg-neutral-950 text-white shadow-xl lg:order-1">
          <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                {selectedAssignment?.event_name ?? "Choose an event"}
              </p>
              <p className="flex items-center gap-1 text-xs text-white/60">
                <MapPin className="size-3" />
                {selectedAssignment?.gate ?? "No gate selected"}
              </p>
            </div>
            <div className={`flex items-center gap-2 text-xs font-bold ${
              acceptingEntries ? "text-emerald-300" : "text-amber-300"
            }`}>
              <span className={`size-2 rounded-full ${
                acceptingEntries ? "bg-emerald-400" : "bg-amber-400"
              }`} />
              {acceptingEntries ? "ENTRY OPEN" : "ENTRY CLOSED"}
            </div>
          </div>

          <div className="relative h-[min(68dvh,640px)] min-h-[320px] bg-black sm:min-h-[420px]">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover ${cameraActive ? "block" : "hidden"}`}
            />

            {!cameraActive && !scanResult && !scanning && (
              <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,#202020_0,#050505_68%)] p-6 text-center">
                <div>
                  <div className="mx-auto grid size-24 place-items-center border border-white/15 bg-white/5">
                    <Camera className="size-11 text-white/80" />
                  </div>
                  <h2 className="mt-5 text-2xl font-black">
                    {acceptingEntries ? "Ready to scan" : "Entry is closed"}
                  </h2>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-white/60">
                    {acceptingEntries
                      ? "Point the rear camera at the attendee’s GatePass QR."
                      : selectedAssignment
                        ? entryWindow(selectedAssignment.start_time, selectedAssignment.end_time)
                        : "Choose an event before scanning."}
                  </p>
                  <button
                    onClick={() => void startCamera()}
                    disabled={!selectedAssignment || !acceptingEntries || cameraStarting}
                    className="mt-6 min-h-14 min-w-52 bg-[#ff2bd6] px-6 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {cameraStarting ? "Starting camera…" : acceptingEntries ? "Open camera" : "Entry closed"}
                  </button>
                </div>
              </div>
            )}

            {cameraActive && (
              <>
                <div className="pointer-events-none absolute inset-0 grid place-items-center p-8">
                  <div className="relative aspect-square w-full max-w-sm border border-white/60">
                    <span className="absolute -left-1 -top-1 size-10 border-l-4 border-t-4 border-[#ff2bd6]" />
                    <span className="absolute -right-1 -top-1 size-10 border-r-4 border-t-4 border-[#ff2bd6]" />
                    <span className="absolute -bottom-1 -left-1 size-10 border-b-4 border-l-4 border-[#ff2bd6]" />
                    <span className="absolute -bottom-1 -right-1 size-10 border-b-4 border-r-4 border-[#ff2bd6]" />
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/90 to-transparent p-5 pt-16">
                  <button
                    onClick={() => void toggleTorch()}
                    className={`grid size-12 place-items-center border border-white/20 ${
                      torchActive ? "bg-white text-black" : "bg-black/55 text-white"
                    }`}
                    aria-label="Toggle camera torch"
                  >
                    <Flashlight className="size-5" />
                  </button>
                  <button
                    onClick={stopCamera}
                    className="min-h-12 border border-white/20 bg-black/55 px-5 text-sm font-black"
                  >
                    Close camera
                  </button>
                </div>
              </>
            )}

            {scanning && (
              <div className="absolute inset-0 grid place-items-center bg-black/90 p-6 text-center">
                <div>
                  <RefreshCw className="mx-auto size-12 animate-spin text-[#ff2bd6]" />
                  <p className="mt-4 text-lg font-black">Checking ticket…</p>
                  <p className="mt-1 text-sm text-white/60">Server validation in progress</p>
                </div>
              </div>
            )}

            {scanResult && (
              <div
                className={`absolute inset-0 overflow-y-auto p-5 ${
                  approved ? "bg-emerald-600" : "bg-red-600"
                }`}
                role="status"
              >
                <div className="mx-auto flex min-h-full max-w-md flex-col justify-center">
                  {approved ? (
                    <CheckCircle2 className="size-14 text-white" />
                  ) : (
                    <XCircle className="size-14 text-white" />
                  )}
                  <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-white/75">
                    {approved ? "Entry approved" : "Entry denied"}
                  </p>
                  <h2 className="mt-1 text-4xl font-black leading-none">
                    {scanResult.attendee?.name ?? scanResult.message}
                  </h2>
                  {scanResult.attendee && (
                    <p className="mt-3 text-base font-bold text-white/85">
                      {scanResult.message}
                    </p>
                  )}

                  {scanResult.ticket && (
                    <div className="mt-6 border border-white/20 bg-black/20 p-4">
                      <p className="flex items-center gap-2 text-sm font-black">
                        <Ticket className="size-4" />
                        {scanResult.ticket.ticket_type}
                      </p>
                      <p className="mt-1 text-sm text-white/75">
                        {scanResult.ticket.event_name}
                      </p>
                      <div className="mt-4 border-t border-white/15 pt-4">
                        {ownership?.is_transferred ? (
                          <>
                            <p className="text-sm font-black">Transferred ticket</p>
                            <p className="mt-1 text-sm text-white/80">
                              From {ownership.transferred_from_name ?? "previous owner"} ·{" "}
                              {ownership.owner_count} owners
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-black">Original ticket</p>
                            <p className="mt-1 text-sm text-white/80">1 owner</p>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => void startCamera()}
                    disabled={!acceptingEntries}
                    className="mt-6 min-h-14 w-full bg-white px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {acceptingEntries ? "Scan next ticket" : "Entry closed"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {cameraError && (
            <div
              className="border-t border-red-400/30 bg-red-950 px-4 py-3 text-sm font-bold text-red-100"
              role="alert"
            >
              {cameraError}
            </div>
          )}
        </section>

        <aside className="order-2 space-y-5 lg:order-2">
          <section className="border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <h2 className="font-black text-charcoal-dark">Scan location</h2>
            </div>
            <label
              htmlFor="scanner-event"
              className="mt-4 block text-xs font-black uppercase tracking-wider text-neutral-500"
            >
              Event and gate
            </label>
            <select
              id="scanner-event"
              value={selectedEventId}
              onChange={(event) => {
                stopCamera();
                setScanResult(null);
                setSelectedEventId(event.target.value);
              }}
              className="mt-2 min-h-12 w-full border border-neutral-300 bg-white px-3 font-bold text-charcoal-dark"
            >
              {visibleAssignments.map((assignment) => (
                <option key={assignment.id} value={assignment.event_id}>
                  {assignment.event_name} · {assignment.accepting_entries ? "Open now" : "Closed"}
                </option>
              ))}
            </select>
            {selectedAssignment && (
              <div className="mt-4 space-y-2 text-sm text-neutral-600">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  {selectedAssignment.venue} · {selectedAssignment.gate}
                </p>
                <p className="flex items-start gap-2">
                  <Ticket className="mt-0.5 size-4 shrink-0 text-primary" />
                  Server-validated tickets only
                </p>
                <p className={selectedAssignment.accepting_entries ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>
                  {selectedAssignment.accepting_entries ? "Entry open now" : "Entry closed"} · {entryWindow(selectedAssignment.start_time, selectedAssignment.end_time)}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => void loadAccess()}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 border border-neutral-300 px-3 text-sm font-black text-charcoal-dark"
            >
              <RefreshCw className="size-4" />
              Refresh entry status
            </button>
          </section>

          {access.is_owner && (
            <section className="border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Users className="size-5 text-primary" />
                <div>
                  <h2 className="font-black text-charcoal-dark">Scanner access</h2>
                  <p className="text-xs text-neutral-500">Grant by signed-in email</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  type="email"
                  aria-label="Scanner email"
                  value={grantEmail}
                  onChange={(event) => setGrantEmail(event.target.value)}
                  placeholder="staff@example.com"
                  className="min-h-12 w-full border border-neutral-300 px-3 text-sm font-bold"
                />
                <select
                  aria-label="Scanner event"
                  value={grantEventId}
                  onChange={(event) => setGrantEventId(event.target.value)}
                  className="min-h-12 w-full border border-neutral-300 bg-white px-3 text-sm font-bold"
                >
                  {access.assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.event_id}>
                      {assignment.event_name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Scanner gate"
                  value={grantGate}
                  onChange={(event) => setGrantGate(event.target.value)}
                  placeholder="Main Gate"
                  className="min-h-12 w-full border border-neutral-300 px-3 text-sm font-bold"
                />
                <button
                  onClick={() => void saveGrant(true)}
                  disabled={grantBusy || !grantEmail.trim() || !grantEventId}
                  className="flex min-h-12 w-full items-center justify-center gap-2 bg-black px-4 text-sm font-black text-white disabled:opacity-40"
                >
                  <UserPlus className="size-4" />
                  Grant scanner access
                </button>
              </div>

              <div className="mt-5 space-y-2">
                {access.grants.length === 0 ? (
                  <p className="text-sm text-neutral-500">No delegated scanners yet.</p>
                ) : (
                  access.grants.map((grant) => (
                    <div
                      key={grant.id}
                      className="flex items-center gap-3 border border-neutral-200 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-charcoal-dark">
                          {grant.name}
                        </p>
                        <p className="truncate text-xs text-neutral-500">{grant.email}</p>
                        <p className="truncate text-xs text-primary">
                          {grant.event_name} · {grant.gate}
                        </p>
                      </div>
                      <button
                        onClick={() => void saveGrant(false, grant)}
                        disabled={grantBusy}
                        aria-label={`Revoke scanner access for ${grant.email}`}
                        className="grid size-10 shrink-0 place-items-center border border-red-200 text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {accessError && (
            <p
              className="border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
              role="alert"
            >
              {accessError}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
