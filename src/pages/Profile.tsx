import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { UserProfile, InvitePass } from "../types";
import { isPassExpired } from "../eventUtils";
import { fetchMyQrPayload } from "../scannerQr";
import { authClient } from "../auth";
import { QRCodeSVG } from "qrcode.react";
import AnimatedButton from "../components/ui/animated-button";
import {
  CheckCircle,
  MapPin,
  Clock,
  ChevronRight,
  Plus,
  ShieldCheck,
  QrCode,
  History,
  IdCard,
  Fingerprint,
  LogOut,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  Smartphone,
  Copy,
  Check,
  RotateCw
} from "lucide-react";

interface IdentityCardProps {
  user: UserProfile;
  invitePasses: InvitePass[];
  onNavigateToRequest: () => void;
  onNavigateToWallet: (pass: InvitePass) => void;
  onLoginSuccess?: (credentialResponse: any) => void;
  onLoginError?: () => void;
  onLogout?: () => void;
  isAuthenticated: boolean;
  authEmail: string | null;
}

const SIMULATED_PASSES: InvitePass[] = [
  {
    id: "sim_chem_lab",
    title: "Chemistry Lab B",
    category: "PRE-APPROVED",
    subCategory: "Chemistry Lab",
    passIdCode: "GP-CHEM-LAB",
    status: "APPROVED",
    validityText: "Expires: Today, 2:00 PM",
    usageText: "TEMPORARY ACCESS",
    usageType: "limited",
    qrToken: "TOKEN_CHEM_LAB"
  },
  {
    id: "sim_library",
    title: "Library - 24hr Zone",
    category: "PRE-APPROVED",
    subCategory: "Library",
    passIdCode: "GP-LIB-24H",
    status: "APPROVED",
    validityText: "24/7 Gate Entry Allowed",
    usageText: "STANDARD ACCESS",
    usageType: "unlimited",
    qrToken: "TOKEN_LIBRARY"
  }
];

function getPassStatus(pass: InvitePass): "ACTIVE" | "EXPIRED" | "UPCOMING" {
  if (isPassExpired(pass)) {
    return "EXPIRED";
  }
  if (pass.status === "PENDING") {
    return "UPCOMING";
  }
  const text = pass.validityText.toLowerCase();
  if (text.includes("tomorrow")) {
    return "UPCOMING";
  }
  return "ACTIVE";
}

export default function IdentityCard({
  user,
  invitePasses,
  onNavigateToRequest,
  onNavigateToWallet,
  onLoginSuccess,
  onLoginError,
  onLogout,
  isAuthenticated,
  authEmail
}: IdentityCardProps) {
  const [viewMode, setViewMode] = useState<"access" | "badge">("badge");
  const [copiedText, setCopiedText] = useState(false);
  const [permanentQr, setPermanentQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);

  const loadQr = () => {
    setQrLoading(true);
    setQrError(null);
    fetchMyQrPayload()
      .then(setPermanentQr)
      .catch((err) => {
        console.error("Failed to load permanent QR code:", err);
        setQrError(err instanceof Error ? err.message.replace(/^[A-Z_]+:\s*/, "") : "Couldn't load your QR code.");
      })
      .finally(() => setQrLoading(false));
  };

  useEffect(() => {
    loadQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPasses = [...SIMULATED_PASSES, ...invitePasses];
  const activePasses = allPasses.filter(p => getPassStatus(p) === "ACTIVE");
  const upcomingPasses = allPasses.filter(p => getPassStatus(p) === "UPCOMING");
  const expiredPasses = allPasses.filter(p => getPassStatus(p) === "EXPIRED");

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div 
      className="min-h-full bg-[#F3EEEB] -mx-6 -my-6 sm:-mx-6 sm:-my-6 xl:-mx-10 xl:-my-10 px-4 py-6 sm:px-6 sm:py-8 font-sans text-[#171719] animate-fadeIn" 
      id="identity-card-section"
    >
      <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
        
        {/* Simple Unboxed Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          <div className="flex items-center gap-3">
            <Link 
              to="/" 
              className="p-2 rounded-xl bg-[#F8F5F2] hover:bg-[#E8E1DD] text-[#171719] border border-[#3F3632]/10 transition-colors flex items-center justify-center active:scale-95"
              title="Return Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight uppercase text-[#171719]">
                  DIGITAL IDENTITY
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#55765F]/15 text-[#55765F] border border-[#55765F]/20">
                  PRO VERIFIED
                </span>
              </div>
              <p className="text-xs text-[#746D68] font-medium mt-0.5">
                Verified Member Pass &amp; Campus Credentials
              </p>
            </div>
          </div>

          {/* Compact 36px Segmented Control Switch */}
          <div className="inline-flex items-center p-0.5 bg-white/40 border border-[#3F3632]/10 rounded-[12px] gap-1 self-start sm:self-auto h-[36px]">
            <button
              id="toggle-badge-view"
              onClick={() => setViewMode("badge")}
              className={`px-3 h-[30px] rounded-[9px] text-[11px] font-extrabold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                viewMode === "badge"
                  ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
                  : "bg-transparent text-[#625B57] hover:text-[#171719]"
              }`}
            >
              <IdCard className="w-3.5 h-3.5" />
              <span>Identity Badge</span>
            </button>
            <button
              id="toggle-access-view"
              onClick={() => setViewMode("access")}
              className={`px-3 h-[30px] rounded-[9px] text-[11px] font-extrabold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                viewMode === "access"
                  ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
                  : "bg-transparent text-[#625B57] hover:text-[#171719]"
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>Access Overview</span>
            </button>
          </div>
        </div>

        {viewMode === "badge" ? (
          /* BADGE VIEW: 330px LEFT COLUMN + FLEXIBLE RIGHT COLUMN */
          <div className="grid grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)] gap-8 items-start" id="badge-view-container">
            
            {/* Left Column: Identity Card & Wallet Utility */}
            <div className="w-full flex flex-col gap-5">
              
              {/* THE ONLY MAJOR DARK SURFACE ON THE ENTIRE PAGE */}
              <div className="bg-[#171719] text-white rounded-[18px] p-5 shadow-[0_14px_34px_rgba(20,18,17,0.10)] border border-white/10 flex flex-col items-center text-center relative overflow-hidden w-full max-w-[340px] mx-auto lg:mx-0">
                
                {/* Minimal Top Strip */}
                <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#55765F]" />
                    <span className="text-[10px] font-bold text-white/65 uppercase tracking-widest">
                      VERIFIED MEMBER
                    </span>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-[#55765F]" />
                </div>

                {/* 76px Theme Avatar */}
                <div className="relative mb-2">
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-[76px] h-[76px] rounded-full object-cover border-2 border-[#42566E] p-0.5 bg-[#171719] shadow-sm"
                  />
                </div>

                <h2 className="text-[22px] font-extrabold uppercase tracking-tight text-white mt-1 mb-0.5">
                  {user.name}
                </h2>
                <p className="text-[11px] font-medium text-[#42566E] uppercase tracking-wider mb-3">
                  Student • ID: {user.studentId}
                </p>

                {/* Auth Row */}
                {isAuthenticated && authEmail ? (
                  <div className="w-full flex items-center justify-between text-xs text-[#938C87] mb-3 px-1">
                    <span className="truncate max-w-[200px]" title={authEmail}>{authEmail}</span>
                    {onLogout && (
                      <button
                        onClick={onLogout}
                        className="text-[10px] font-bold text-[#938C87] hover:text-white uppercase underline cursor-pointer ml-2 flex-shrink-0"
                      >
                        Sign out
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="w-full mb-3">
                    <button
                      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: `${window.location.origin}/identity` })}
                      className="w-full py-1.5 px-3 rounded-lg bg-white text-[#171719] font-bold text-xs uppercase hover:bg-[#F8F5F2] transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                      <span>Sign in with Google</span>
                    </button>
                  </div>
                )}

                {/* 155px Compact QR Surface */}
                <div className="bg-white p-2.5 rounded-[10px] mb-2.5 flex flex-col items-center gap-2 border border-white/20 w-full max-w-[190px]">
                  <div className="w-[155px] h-[155px] bg-white flex items-center justify-center rounded overflow-hidden">
                    {permanentQr ? (
                      <QRCodeSVG
                        value={permanentQr}
                        size={155}
                        level="H"
                        includeMargin={false}
                      />
                    ) : qrError ? (
                      <div className="text-[11px] text-[#A34F4C] font-bold uppercase tracking-wider flex flex-col items-center gap-1 px-2 text-center">
                        <AlertTriangle className="w-5 h-5 text-[#A34F4C]" />
                        <span>{qrError}</span>
                        <button
                          onClick={loadQr}
                          className="flex items-center gap-1 text-[10px] text-[#42566E] hover:underline normal-case font-bold cursor-pointer mt-1"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#938C87] font-bold uppercase tracking-wider flex flex-col items-center gap-2">
                        <QrCode className="w-6 h-6 text-[#938C87] animate-pulse" />
                        <span>{qrLoading ? "Loading QR..." : ""}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-widest text-[#171719]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#55765F]" />
                    <span>Permanent Clearance QR</span>
                  </div>
                </div>

                {/* Secondary 35px Copy Action */}
                <button
                  onClick={() => handleCopyCode(permanentQr || "")}
                  disabled={!permanentQr}
                  className="w-full h-[35px] rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-bold text-[#F8F5F2] transition-all flex items-center justify-center gap-2 cursor-pointer mb-3"
                  title="Click to copy QR payload"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#55765F]" />
                      <span className="text-[#55765F] uppercase tracking-wider font-extrabold text-[11px]">Payload Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#938C87]" />
                      <span className="uppercase tracking-wider font-extrabold text-[11px]">{permanentQr ? "Copy QR Payload" : "Secure Pass Load"}</span>
                    </>
                  )}
                </button>

                {/* Split Action Footer */}
                <div className="w-full pt-2.5 border-t border-white/10 grid grid-cols-2 gap-2 text-[11px] font-bold text-[#938C87]">
                  <button
                    id="action-show-id"
                    className="h-9 rounded-lg hover:bg-white/5 text-[#938C87] hover:text-white flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    <IdCard className="w-3.5 h-3.5" />
                    <span>Show Badge</span>
                  </button>
                  <button
                    id="action-view-logs"
                    className="h-9 rounded-lg hover:bg-white/5 text-[#938C87] hover:text-white flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Audit Logs</span>
                  </button>
                </div>
              </div>

              {/* Light Phone Wallet Utility Row */}
              <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-3.5 flex items-center justify-between min-h-[66px] shadow-none">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#42566E]/10 text-[#42566E] flex items-center justify-center flex-shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">
                      Add to Apple / Google Wallet
                    </h4>
                    <p className="text-[11px] text-[#746D68]">
                      Save your GatePass to your phone
                    </p>
                  </div>
                </div>
                <Link 
                  to="/wallet" 
                  className="w-7 h-7 rounded-lg bg-[#E8E1DD]/50 hover:bg-[#E8E1DD] text-[#171719] flex items-center justify-center transition-colors flex-shrink-0"
                  title="Wallet Settings"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Right Column: Access Overview & Active Passes */}
            <div className="flex flex-col gap-6">
              
              {/* Today's Access Section */}
              <div className="flex flex-col">
                <h3 className="text-[13px] font-extrabold uppercase tracking-wider text-[#171719] mb-3">
                  TODAY'S ACCESS
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Metric Card 1: Current Location */}
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-4 min-h-[95px] flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-[#938C87] uppercase tracking-wider">
                        CURRENT LOCATION
                      </span>
                      <MapPin className="w-3.5 h-3.5 text-[#42566E]" />
                    </div>
                    <span className="text-xl font-extrabold text-[#171719] uppercase tracking-tight mt-1 mb-1">
                      {user.currentZone}
                    </span>
                    <span className="text-[11px] text-[#55765F] font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Logged entry · 08:32 AM
                    </span>
                  </div>

                  {/* Metric Card 2: Clearance */}
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-4 min-h-[95px] flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-[#938C87] uppercase tracking-wider">
                        CLEARANCE
                      </span>
                      <ShieldCheck className="w-3.5 h-3.5 text-[#42566E]" />
                    </div>
                    <span className="text-xl font-extrabold text-[#171719] uppercase tracking-tight mt-1 mb-1">
                      {user.clearanceLevel || "Level 2"}
                    </span>
                    <span className="text-[11px] text-[#746D68] font-medium">
                      Standard Academic &amp; Event Clearance
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Passes Section */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-extrabold uppercase tracking-wider text-[#171719]">
                    ACTIVE PASSES ({activePasses.length})
                  </h3>
                  <button
                    onClick={() => setViewMode("access")}
                    className="text-xs font-bold text-[#42566E] hover:underline uppercase tracking-wider cursor-pointer"
                  >
                    View all →
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {activePasses.length === 0 ? (
                    <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-5 text-center flex flex-col items-center gap-1 shadow-none">
                      <QrCode className="w-7 h-7 text-[#938C87]" />
                      <p className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">No Active Passes Today</p>
                      <p className="text-[11px] text-[#746D68]">Request temporary access below for gate passes.</p>
                    </div>
                  ) : (
                    activePasses.map((pass) => (
                      <div
                        key={pass.id}
                        onClick={() => onNavigateToWallet(pass)}
                        className="bg-[#F8F5F2] border border-[#3F3632]/7 rounded-[10px] px-4 py-3 min-h-[60px] flex items-center justify-between gap-3 hover:border-[#42566E]/20 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-[#55765F]/10 text-[#55765F] flex items-center justify-center flex-shrink-0">
                            <CheckCircle className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-[13.5px] text-[#171719] uppercase tracking-tight truncate">
                              {pass.title}
                            </h4>
                            <p className="text-[11px] text-[#938C87] font-medium truncate">
                              {pass.subCategory} · {pass.validityText}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#55765F] bg-[#55765F]/10 px-2 py-0.5 rounded border border-[#55765F]/20 hidden sm:inline-block">
                            {pass.usageText}
                          </span>
                          <ChevronRight className="w-4 h-4 text-[#938C87] group-hover:text-[#171719] transition-colors" />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Primary CTA: Charcoal Request Button */}
                <div className="mt-3">
                  <AnimatedButton
                    id="btn-trigger-request-access"
                    onClick={onNavigateToRequest}
                    className="!w-full !bg-[#171719] hover:!bg-[#292725] !text-[#F8F5F2] !h-[42px] !rounded-[10px] !font-extrabold !text-xs !uppercase !tracking-wider !shadow-none flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>REQUEST TEMPORARY ACCESS</span>
                  </AnimatedButton>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ACCESS OVERVIEW SCREEN */
          <div className="flex flex-col gap-6" id="access-view-container">
            
            {/* Default Access Permissions */}
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[12px] font-extrabold text-[#746D68] uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[#42566E]" />
                <span>DEFAULT CAMPUS ACCESS PERMISSIONS</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#42566E]/10 text-[#42566E] flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-extrabold text-[#171719] text-xs uppercase tracking-tight">Main Gate</p>
                      <p className="text-[11px] text-[#746D68] font-medium">24/7 Gate Entry</p>
                    </div>
                  </div>
                  <CheckCircle className="w-4 h-4 text-[#55765F]" />
                </div>

                <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#42566E]/10 text-[#42566E] flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-extrabold text-[#171719] text-xs uppercase tracking-tight">Library Complex</p>
                      <p className="text-[11px] text-[#746D68] font-medium">Standard Hours</p>
                    </div>
                  </div>
                  <CheckCircle className="w-4 h-4 text-[#55765F]" />
                </div>

                <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#42566E]/10 text-[#42566E] flex items-center justify-center">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-extrabold text-[#171719] text-xs uppercase tracking-tight">Academic Block A/B</p>
                      <p className="text-[11px] text-[#746D68] font-medium">Student Zones</p>
                    </div>
                  </div>
                  <CheckCircle className="w-4 h-4 text-[#55765F]" />
                </div>
              </div>
            </section>

            {/* Active Temporary Passes List */}
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[12px] font-extrabold text-[#746D68] uppercase tracking-wider flex items-center gap-2">
                <QrCode className="w-3.5 h-3.5 text-[#55765F]" />
                <span>ACTIVE TEMPORARY &amp; GUEST PASSES ({activePasses.length})</span>
              </h2>

              <div className="flex flex-col gap-2">
                {activePasses.length === 0 ? (
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-5 text-center flex flex-col items-center gap-1">
                    <QrCode className="w-7 h-7 text-[#938C87]" />
                    <p className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">No Active Passes</p>
                  </div>
                ) : (
                  activePasses.map((pass) => (
                    <div
                      key={pass.id}
                      onClick={() => onNavigateToWallet(pass)}
                      className="bg-[#F8F5F2] border border-[#3F3632]/8 border-l-4 border-l-[#55765F] rounded-[10px] p-3.5 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-[#55765F]/10 text-[#55765F] border border-[#55765F]/20 uppercase tracking-wider">
                            {pass.category}
                          </span>
                          <p className="text-xs text-[#746D68] font-medium">{pass.subCategory}</p>
                        </div>
                        <h3 className="text-sm font-extrabold text-[#171719] uppercase tracking-tight">{pass.title}</h3>
                        <p className="text-[11px] font-mono text-[#42566E] font-semibold">ID: {pass.passIdCode}</p>
                      </div>

                      <div className="flex flex-col gap-1 sm:items-end">
                        <div className="flex items-center gap-1 font-extrabold text-xs text-[#55765F]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{pass.validityText}</span>
                        </div>

                        <div className="bg-[#E8E1DD]/60 border border-[#3F3632]/10 px-2 py-0.5 rounded text-[9.5px] font-extrabold text-[#171719] tracking-wider uppercase w-max">
                          {pass.usageText}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Upcoming Passes List */}
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[12px] font-extrabold text-[#746D68] uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#766052]" />
                <span>UPCOMING PASSES ({upcomingPasses.length})</span>
              </h2>

              <div className="flex flex-col gap-2">
                {upcomingPasses.length === 0 ? (
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-5 text-center flex flex-col items-center gap-1">
                    <Clock className="w-7 h-7 text-[#938C87]" />
                    <p className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">No Upcoming Passes</p>
                  </div>
                ) : (
                  upcomingPasses.map((pass) => (
                    <div
                      key={pass.id}
                      onClick={() => onNavigateToWallet(pass)}
                      className="bg-[#F8F5F2] border border-[#3F3632]/8 border-l-4 border-l-[#766052] rounded-[10px] p-3.5 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-[#766052]/10 text-[#766052] border border-[#766052]/20 uppercase tracking-wider">
                            {pass.category}
                          </span>
                          <p className="text-xs text-[#746D68] font-medium">{pass.subCategory}</p>
                        </div>
                        <h3 className="text-sm font-extrabold text-[#171719] uppercase tracking-tight">{pass.title}</h3>
                        <p className="text-[11px] font-mono text-[#766052] font-semibold">ID: {pass.passIdCode}</p>
                      </div>

                      <div className="flex flex-col gap-1 sm:items-end">
                        <div className="flex items-center gap-1 font-extrabold text-xs text-[#766052]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{pass.validityText}</span>
                        </div>

                        <div className="bg-[#E8E1DD]/60 border border-[#3F3632]/10 px-2 py-0.5 rounded text-[9.5px] font-extrabold text-[#171719] tracking-wider uppercase w-max">
                          {pass.usageText}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Expired / Revoked Passes List */}
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[12px] font-extrabold text-[#746D68] uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[#A34F4C]" />
                <span>EXPIRED &amp; REVOKED PASSES ({expiredPasses.length})</span>
              </h2>

              <div className="flex flex-col gap-2">
                {expiredPasses.length === 0 ? (
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/8 rounded-[12px] p-5 text-center flex flex-col items-center gap-1">
                    <AlertTriangle className="w-7 h-7 text-[#938C87]" />
                    <p className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">No Expired Passes</p>
                  </div>
                ) : (
                  expiredPasses.map((pass) => (
                    <div
                      key={pass.id}
                      className="bg-[#F8F5F2]/60 opacity-70 border border-[#3F3632]/8 border-l-4 border-l-[#A34F4C] rounded-[10px] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-[#A34F4C]/10 text-[#A34F4C] border border-[#A34F4C]/20 uppercase tracking-wider">
                            {pass.category}
                          </span>
                          <p className="text-xs text-[#746D68] font-medium">{pass.subCategory}</p>
                        </div>
                        <h3 className="text-sm font-extrabold text-[#171719] line-through uppercase tracking-tight">{pass.title}</h3>
                        <p className="text-[11px] font-mono text-[#938C87] font-semibold">ID: {pass.passIdCode}</p>
                      </div>

                      <div className="flex flex-col gap-1 sm:items-end">
                        <div className="flex items-center gap-1 font-extrabold text-xs text-[#A34F4C]">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{pass.validityText}</span>
                        </div>

                        <div className="bg-[#E8E1DD]/40 border border-[#3F3632]/10 px-2 py-0.5 rounded text-[9.5px] font-extrabold text-[#746D68] tracking-wider uppercase w-max">
                          {pass.usageText}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
