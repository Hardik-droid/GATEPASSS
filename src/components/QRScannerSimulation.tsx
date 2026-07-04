import React, { useState, useEffect, useRef } from "react";
import { Ticket, EventItem, ScanLog, TicketStatus } from "../types";
import { 
  QrCode, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  MapPin, 
  Camera, 
  Smartphone, 
  ShieldAlert, 
  Calendar, 
  Sparkles, 
  Volume2, 
  Database,
  ArrowRight
} from "lucide-react";

interface QRScannerSimulationProps {
  tickets: Ticket[];
  events: EventItem[];
  scanLogs: ScanLog[];
  onLogScan: (ticket: Ticket, result: ScanLog["scanResult"], gate: string) => void;
}

export default function QRScannerSimulation({
  tickets,
  events,
  scanLogs,
  onLogScan
}: QRScannerSimulationProps) {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedGate, setSelectedGate] = useState("Main Gate");
  const [scanning, setScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: "success" | "warning" | "error" | "wrong_event";
    message: string;
    ticket?: Ticket;
    scannedLog?: ScanLog;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize selected event
  useEffect(() => {
    if (events.length > 0 && !selectedEventId) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn("Camera could not be accessed:", err);
      // Fail gracefully - camera is purely a simulation asset
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Process a ticket scan
  const handleScanTicket = (ticket: Ticket) => {
    setScanning(true);
    setScanResult(null);

    // Simulate scanning delay
    setTimeout(() => {
      setScanning(false);
      const ticketEvent = events.find(e => e.id === ticket.eventId);

      // 1. Check Event Match
      if (ticket.eventId !== selectedEventId) {
        setScanResult({
          status: "wrong_event",
          message: `WRONG EVENT: This ticket belongs to "${ticketEvent?.title || "another event"}"`,
          ticket
        });
        onLogScan(ticket, "WRONG_EVENT", selectedGate);
        return;
      }

      // 2. Check Refunded or Cancelled
      if (ticket.status === TicketStatus.REFUNDED) {
        setScanResult({
          status: "error",
          message: "REFUNDED: This ticket was refunded. DO NOT ALLOW ENTRY.",
          ticket
        });
        onLogScan(ticket, "REFUNDED", selectedGate);
        return;
      }

      if (ticket.status === TicketStatus.CANCELLED) {
        setScanResult({
          status: "error",
          message: "CANCELLED: This ticket has been cancelled or invalidated.",
          ticket
        });
        onLogScan(ticket, "CANCELLED", selectedGate);
        return;
      }

      // 3. Check Already Checked In
      if (ticket.status === TicketStatus.CHECKED_IN) {
        // Find previous scan log
        const prevLog = scanLogs.find(l => l.ticketId === ticket.id && l.scanResult === "VALID");
        setScanResult({
          status: "warning",
          message: "ALREADY USED: This ticket has already checked-in.",
          ticket,
          scannedLog: prevLog
        });
        onLogScan(ticket, "ALREADY_USED", selectedGate);
        return;
      }

      // 4. Success Case (VALID)
      setScanResult({
        status: "success",
        message: "VALID ENTRY: Ticket verified successfully. Welcome!",
        ticket
      });
      onLogScan(ticket, "VALID", selectedGate);
    }, 800);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-sans animate-fadeIn" id="scanner-sim-section">
      {/* Configuration Column */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
          <h2 className="text-lg font-bold text-charcoal-dark flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            <span>Gate Staff Scanner Config</span>
          </h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-outline uppercase tracking-wider">Select Assigned Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setScanResult(null);
              }}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2 text-sm text-charcoal-dark font-medium cursor-pointer"
            >
              {events.map(e => (
                <option key={e.id} value={e.id}>{e.title} ({e.eventType})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-outline uppercase tracking-wider">Gate Location ID</label>
            <select
              value={selectedGate}
              onChange={(e) => setSelectedGate(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2 text-sm text-charcoal-dark font-medium cursor-pointer"
            >
              <option value="Main Gate">Main Gate</option>
              <option value="VIP Backstage Gate">VIP Backstage Gate</option>
              <option value="South Registration Tent">South Registration Tent</option>
              <option value="Auditorium Front Door">Auditorium Front Door</option>
            </select>
          </div>
        </div>

        {/* Quick Testing Panel */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-charcoal-dark uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-status-warning" />
            <span>Simulated Ticket Roll</span>
          </h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Click any ticket category below to simulate a physical scan. Test duplicate detection, wrong events, and cancelled states directly!
          </p>

          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {tickets.map(t => {
              const evt = events.find(e => e.id === t.eventId);
              return (
                <button
                  key={t.id}
                  onClick={() => handleScanTicket(t)}
                  className="w-full text-left p-3 rounded-xl border border-outline-variant/20 bg-surface-container-low hover:bg-primary-fixed hover:border-primary/35 transition-all text-xs flex justify-between items-center cursor-pointer group"
                >
                  <div>
                    <p className="font-extrabold text-charcoal-dark">{t.attendeeName}</p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">
                      {evt?.title} • {t.categoryName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      t.status === TicketStatus.ISSUED 
                        ? "bg-primary-container text-white" 
                        : t.status === TicketStatus.CHECKED_IN
                        ? "bg-status-success text-white"
                        : "bg-status-danger text-white"
                    }`}>
                      {t.status}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-outline opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Mobile Web Scanner Screen */}
      <div className="lg:col-span-7 flex flex-col items-center">
        <div className="w-full max-w-[340px] aspect-[9/18] bg-black rounded-[40px] border-[8px] border-neutral-800 shadow-2xl relative overflow-hidden flex flex-col text-white p-4 justify-between select-none">
          {/* Phone Top Notch/Speaker */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-5 bg-neutral-800 rounded-full flex items-center justify-center z-50">
            <div className="w-12 h-1 bg-neutral-900 rounded-full mb-1"></div>
          </div>

          {/* Scanner Header */}
          <div className="pt-6 text-center z-10 flex flex-col gap-1">
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-400">GatePass Validator</h3>
            <p className="text-[10px] font-bold text-primary-fixed-dim flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3 text-status-warning" />
              {selectedGate}
            </p>
          </div>

          {/* Active Camera Backplate or Simulated QR Laser Screen */}
          <div className="absolute inset-0 z-0 bg-neutral-950 flex items-center justify-center">
            {cameraActive ? (
              <video 
                ref={videoRef}
                autoPlay 
                playsInline
                className="w-full h-full object-cover opacity-60"
              />
            ) : (
              /* Cyberpunk Laser Graphic backdrop */
              <div className="w-full h-full bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 flex flex-col items-center justify-center p-6 relative">
                <div className="w-48 h-48 border-2 border-primary/40 rounded-3xl relative flex items-center justify-center overflow-hidden">
                  <div className="w-full h-0.5 bg-red-500 shadow-lg absolute animate-bounce top-1/2"></div>
                  <QrCode className="w-24 h-24 text-neutral-800" />
                </div>
                <p className="text-[9px] text-neutral-500 uppercase font-mono tracking-widest mt-4">Awaiting QR scan token...</p>
              </div>
            )}
          </div>

          {/* Verification Screens Overlay (VALID / ALREADY USED / WRONG EVENT etc) */}
          {scanning && (
            <div className="absolute inset-0 bg-black/90 z-20 flex flex-col items-center justify-center gap-3">
              <Volume2 className="w-10 h-10 text-primary animate-pulse" />
              <p className="text-sm font-semibold tracking-wider uppercase animate-pulse">Decrypting Pass...</p>
            </div>
          )}

          {!scanning && scanResult && (
            <div className={`absolute inset-0 z-30 p-6 flex flex-col items-center justify-center text-center gap-4 ${
              scanResult.status === "success"
                ? "bg-status-success/95"
                : scanResult.status === "warning"
                ? "bg-status-warning/95"
                : scanResult.status === "wrong_event"
                ? "bg-amber-600/95"
                : "bg-status-danger/95"
            }`}>
              <div className="bg-white p-3 rounded-full text-black shadow-lg">
                {scanResult.status === "success" ? (
                  <CheckCircle className="w-10 h-10 text-status-success fill-status-success/5" />
                ) : scanResult.status === "warning" ? (
                  <AlertTriangle className="w-10 h-10 text-status-warning" />
                ) : (
                  <XCircle className="w-10 h-10 text-status-danger" />
                )}
              </div>

              <div className="flex flex-col gap-1.5 max-w-xs">
                <h4 className="text-xl font-black uppercase tracking-wider">{scanResult.status === "success" ? "Valid Entry" : scanResult.status.replace("_", " ")}</h4>
                <p className="text-xs font-medium text-white/95 leading-relaxed">{scanResult.message}</p>
              </div>

              {scanResult.ticket && (
                <div className="bg-black/30 p-3.5 rounded-xl border border-white/10 w-full text-left text-xs flex flex-col gap-1">
                  <p className="font-extrabold text-white">Attendee: {scanResult.ticket.attendeeName}</p>
                  <p className="text-white/80">Category: {scanResult.ticket.categoryName}</p>
                  <p className="font-mono text-white/70 text-[10px]">ID: {scanResult.ticket.qrToken}</p>
                  {scanResult.scannedLog && (
                    <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-white/90">
                      <p className="font-semibold text-amber-300 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        First Scanned:
                      </p>
                      <p>Time: {scanResult.scannedLog.scanTime}</p>
                      <p>Gate: {scanResult.scannedLog.gateName}</p>
                      <p>Staff: {scanResult.scannedLog.scannedBy}</p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setScanResult(null)}
                className="mt-2 px-6 py-2.5 bg-white text-black font-extrabold text-xs tracking-wider uppercase rounded-xl shadow cursor-pointer hover:bg-neutral-100"
              >
                Scan Next
              </button>
            </div>
          )}

          {/* Scanner Bottom Action bar */}
          <div className="z-10 bg-neutral-900/90 rounded-2xl p-2.5 flex justify-between items-center border border-neutral-800">
            <button
              onClick={() => {
                if (cameraActive) stopCamera();
                else startCamera();
              }}
              className="p-2.5 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 transition-colors flex items-center justify-center flex-1 cursor-pointer"
              title="Toggle Camera backdrop"
            >
              <Camera className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-neutral-800 mx-2"></div>
            <button
              onClick={() => setScanResult(null)}
              className="text-xs font-bold text-primary-fixed uppercase tracking-wider py-2 px-4 rounded-xl hover:bg-neutral-800 flex-2 text-center cursor-pointer"
            >
              Reset Scanner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
