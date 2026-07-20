import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { 
  Smartphone, 
  Camera, 
  Volume2, 
  MapPin, 
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  QrCode,
  Lock
} from "lucide-react";

// Generate a quick RFC4122 v4 UUID for idempotency keys
function generateUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function QRScannerSimulation() {
  const [pairingCode, setPairingCode] = useState("123456");
  const [paired, setPaired] = useState(false);
  const [scannerInfo, setScannerInfo] = useState<{
    scanner_id: string;
    name: string;
    purpose: string;
    gate: string;
  } | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [scanResult, setScanResult] = useState<{
    status: "APPROVED" | "REJECTED";
    message: string;
    ticket?: {
      attendeeName: string;
      categoryName: string;
      qrToken: string;
    };
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  // Auto-pair using the singleton backend code "123456"
  const handlePairScanner = async () => {
    try {
      setError(null);
      const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
      const response = await fetch(`${API_BASE_URL}/api/scanner/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairing_code: pairingCode })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Failed to pair scanner.");
      }

      // Load paired info
      const meResponse = await fetch(`${API_BASE_URL}/api/scanner/me`);
      if (!meResponse.ok) {
        throw new Error("Failed to fetch scanner configuration.");
      }

      const meData = await meResponse.json();
      setScannerInfo(meData);
      setPaired(true);
    } catch (err: any) {
      setError(err.message || "Error pairing scanner.");
    }
  };

  useEffect(() => {
    // Attempt auto-pairing on load
    handlePairScanner();
  }, []);

  const startCamera = async () => {
    if (!paired) return;
    try {
      setErrorMessage(null);
      setScanResult(null);
      
      const reader = new BrowserQRCodeReader();
      codeReaderRef.current = reader;
      setCameraActive(true);

      const controls = await reader.decodeFromVideoDevice(
        undefined, // default camera device
        videoRef.current!,
        (result, error) => {
          if (result) {
            const text = result.getText();
            handleScanPayload(text);
          }
        }
      );
      controlsRef.current = controls;
    } catch (err: any) {
      console.warn("Camera access failed:", err);
      setErrorMessage("CAMERA_PERMISSION_DENIED: Unable to access video devices.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    setCameraActive(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (controlsRef.current) {
        controlsRef.current.stop();
      }
    };
  }, []);

  const handleScanPayload = async (payload: string) => {
    if (scanning) return; // Prevent duplicate requests
    setScanning(true);
    setErrorMessage(null);

    // Fast client-side rejection checks
    if (!payload.startsWith("gp:v1:")) {
      setScanResult({
        status: "REJECTED",
        message: "INVALID_QR_FORMAT: Payload does not conform to gp:v1: protocol."
      });
      setScanning(false);
      return;
    }

    try {
      const idempotencyKey = generateUuid();
      const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
      
      const response = await fetch(`${API_BASE_URL}/api/scanner/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({
          payload,
          gate: scannerInfo?.gate || "MAIN_GATE"
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        setScanResult({
          status: "REJECTED",
          message: errData.message || "Entry Denied."
        });
        return;
      }

      const data = await response.json();
      setScanResult({
        status: "APPROVED",
        message: data.message,
        ticket: data.ticket
      });

      // Auto-reset after a successful validation
      setTimeout(() => {
        setScanResult(null);
      }, 5000);

    } catch (err: any) {
      setErrorMessage("NETWORK_ERROR: Unable to communicate with security servers.");
    } finally {
      setScanning(false);
    }
  };

  const setError = (msg: string | null) => {
    setErrorMessage(msg);
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn" id="scanner-sim-section">
      {/* Page Header with Back Icon */}
      <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-outline-variant/30 shadow-sm">
        <Link to="/" className="p-2 rounded-xl bg-neutral-50 hover:bg-neutral-100 text-charcoal-dark border border-outline-variant/30 transition-all flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h2 className="text-base font-black text-charcoal-dark uppercase tracking-tight">Gate Checkout Scanner</h2>
          <p className="text-[10px] text-outline uppercase font-semibold">Simulate entry validation gates with QR scanner</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-sans">
        {/* Configuration Column */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
            <h2 className="text-lg font-bold text-charcoal-dark flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              <span>Scanner Connection</span>
            </h2>

            {!paired ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Enter your physical scanner pairing code to securely provision this terminal.
                </p>
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  placeholder="Pairing Code (e.g. 123456)"
                  className="bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-medium"
                />
                <button
                  onClick={handlePairScanner}
                  className="w-full py-2.5 bg-primary text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-primary-container"
                >
                  Pair Scanner
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between border-b border-surface-container py-2">
                  <span className="text-outline">Terminal ID</span>
                  <span className="font-mono font-bold text-charcoal-dark">{scannerInfo?.scanner_id}</span>
                </div>
                <div className="flex justify-between border-b border-surface-container py-2">
                  <span className="text-outline">Scanner Name</span>
                  <span className="font-bold text-charcoal-dark">{scannerInfo?.name}</span>
                </div>
                <div className="flex justify-between border-b border-surface-container py-2">
                  <span className="text-outline">Active Gate</span>
                  <span className="font-bold text-status-success flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-status-success inline-block"></span>
                    {scannerInfo?.gate}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-outline">Purpose</span>
                  <span className="font-mono font-bold text-primary">{scannerInfo?.purpose}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Web Scanner Screen */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full max-w-[340px] aspect-[9/18] bg-black rounded-[40px] border-[8px] border-neutral-800 shadow-2xl relative overflow-hidden flex flex-col text-white p-4 justify-between select-none">
            {/* Phone Top Notch */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-5 bg-neutral-800 rounded-full flex items-center justify-center z-50">
              <div className="w-12 h-1 bg-neutral-900 rounded-full mb-1"></div>
            </div>

            {/* Scanner Header */}
            <div className="pt-6 text-center z-10 flex flex-col gap-1">
              <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-400">GatePass Validator</h3>
              <p className="text-[10px] font-bold text-primary-fixed-dim flex items-center justify-center gap-1">
                <MapPin className="w-3 h-3 text-[#ff2bd6]" />
                {scannerInfo?.gate || "Awaiting Pairing..."}
              </p>
            </div>

            {/* Active Camera Backplate or Simulated QR Laser Screen */}
            <div className="absolute inset-0 z-0 bg-neutral-950 flex items-center justify-center">
              <video 
                ref={videoRef}
                autoPlay 
                playsInline
                className={`w-full h-full object-cover opacity-80 ${cameraActive ? 'block' : 'hidden'}`}
              />
              {!cameraActive && (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 flex flex-col items-center justify-center p-6">
                  <div className="w-48 h-48 border-2 border-dashed border-neutral-800 rounded-3xl relative flex items-center justify-center overflow-hidden">
                    <QrCode className="w-20 h-20 text-neutral-800" />
                  </div>
                  <p className="text-[9px] text-neutral-500 uppercase font-mono tracking-widest mt-4">Camera inactive</p>
                </div>
              )}
            </div>

            {/* Scanning Overlay */}
            {scanning && (
              <div className="absolute inset-0 bg-black/95 z-20 flex flex-col items-center justify-center gap-3">
                <Volume2 className="w-10 h-10 text-primary animate-pulse" />
                <p className="text-sm font-semibold tracking-wider uppercase animate-pulse">Checking credentials...</p>
              </div>
            )}

            {/* Error or Result Display Overlay */}
            {errorMessage && (
              <div className="absolute inset-0 bg-status-danger/95 z-30 p-6 flex flex-col items-center justify-center text-center gap-4">
                <div className="bg-white p-3 rounded-full text-black shadow-lg">
                  <AlertTriangle className="w-10 h-10 text-status-danger" />
                </div>
                <div className="flex flex-col gap-1.5 max-w-xs">
                  <h4 className="text-lg font-black uppercase tracking-wider">Scanner Error</h4>
                  <p className="text-xs font-medium text-white/95 leading-relaxed">{errorMessage}</p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="mt-2 px-6 py-2.5 bg-white text-black font-extrabold text-xs tracking-wider uppercase rounded-xl shadow cursor-pointer hover:bg-neutral-100"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* ScanResult Banner */}
            {!scanning && scanResult && (
              <div className={`absolute inset-0 z-30 p-6 flex flex-col items-center justify-center text-center gap-4 ${
                scanResult.status === "APPROVED" ? "bg-status-success/95" : "bg-status-danger/95"
              }`}>
                <div className="bg-white p-3 rounded-full text-black shadow-lg">
                  {scanResult.status === "APPROVED" ? (
                    <CheckCircle className="w-10 h-10 text-status-success fill-status-success/5" />
                  ) : (
                    <XCircle className="w-10 h-10 text-status-danger" />
                  )}
                </div>

                <div className="flex flex-col gap-1.5 max-w-xs">
                  <h4 className="text-xl font-black uppercase tracking-wider">{scanResult.status}</h4>
                  <p className="text-xs font-medium text-white/95 leading-relaxed">{scanResult.message}</p>
                </div>

                {scanResult.ticket && (
                  <div className="bg-black/30 p-3.5 rounded-xl border border-white/10 w-full text-left text-xs flex flex-col gap-1">
                    <p className="font-extrabold text-white">Attendee: {scanResult.ticket.attendeeName}</p>
                    <p className="text-white/80">Category: {scanResult.ticket.categoryName}</p>
                    <p className="font-mono text-white/70 text-[10px]">Token: {scanResult.ticket.qrToken}</p>
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
            <div className="z-10 bg-neutral-900/95 rounded-2xl p-2.5 flex justify-between items-center border border-neutral-800">
              <button
                onClick={() => {
                  if (cameraActive) stopCamera();
                  else startCamera();
                }}
                className="p-2.5 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 transition-colors flex items-center justify-center flex-1 cursor-pointer"
                title="Toggle Camera"
              >
                <Camera className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-neutral-800 mx-2"></div>
              <button
                onClick={() => {
                  setScanResult(null);
                  setErrorMessage(null);
                }}
                className="text-xs font-bold text-primary-fixed uppercase tracking-wider py-2 px-4 rounded-xl hover:bg-neutral-800 flex-2 text-center cursor-pointer"
              >
                Reset Scanner
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
