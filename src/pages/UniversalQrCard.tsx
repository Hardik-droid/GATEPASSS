import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { RefreshCw, AlertTriangle, ShieldCheck, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchMyQrPayload } from "../scannerQr";

interface UniversalQrCardProps {
  userName: string;
}

const GATEPASS_QR_LOGO_MARK = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
  <rect width="40" height="40" rx="9" fill="#171719"/>
  <path d="M20 8L11 12v7.5c0 5.6 3.8 10.8 9 12.2 5.2-1.4 9-6.6 9-12.2V12L20 8z" fill="none" stroke="#F8F5F2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17 19.5l2.5 2.5 4.5-4.5" fill="none" stroke="#55765F" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`)}`;

export default function UniversalQrCard({ userName }: UniversalQrCardProps) {
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQrCode = async () => {
    setLoading(true);
    setError(null);
    try {
      setQrPayload(await fetchMyQrPayload());
    } catch (err: any) {
      setError(err.message || "Failed to load QR code.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQrCode();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-outline-variant/35 shadow-xl max-w-sm mx-auto text-center font-sans">
      <div className="flex items-center gap-2 mb-4 bg-primary/10 text-primary px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider">
        <ShieldCheck className="w-4 h-4" />
        <span>Permanent GatePass QR</span>
      </div>

      <h3 className="text-lg font-black text-charcoal-dark uppercase tracking-tight mb-1">
        {userName || "Verified User"}
      </h3>
      <p className="text-[11px] text-outline uppercase font-semibold mb-6">
        Student Entry &amp; Access Token
      </p>

      {loading ? (
        <div className="w-48 h-48 flex items-center justify-center bg-neutral-50 rounded-2xl border border-dashed border-outline-variant/50">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : error ? (
        <div className="w-48 h-48 flex flex-col items-center justify-center bg-red-50 text-status-danger rounded-2xl p-4 border border-status-danger/20 gap-2">
          <AlertTriangle className="w-8 h-8" />
          <p className="text-[10px] font-bold uppercase leading-tight">{error}</p>
          <button
            onClick={fetchQrCode}
            className="mt-2 text-[10px] font-bold underline uppercase hover:text-red-700 cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      ) : (
        <div className="bg-white p-4 rounded-2xl border border-outline-variant/40 shadow-inner mb-4 relative group">
          {qrPayload && (
            <QRCodeSVG
              value={qrPayload}
              size={180}
              level="H"
              includeMargin={false}
              fgColor="#000000"
              bgColor="#FFFFFF"
              imageSettings={{
                src: GATEPASS_QR_LOGO_MARK,
                height: 29,
                width: 29,
                excavate: true,
              }}
            />
          )}
        </div>
      )}

      <p className="text-[11px] text-on-surface-variant font-medium leading-relaxed max-w-xs mt-2">
        This QR is your permanent pass. Use it across campus gates, event registration booths, and authorized entry zones.
      </p>
    </div>
  );
}
