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
    <div className="min-h-full bg-[#F3EEEB] -mx-6 -my-6 sm:-mx-6 sm:-my-6 xl:-mx-10 xl:-my-10 p-4 sm:p-6 lg:p-8 font-sans text-[#171719] animate-fadeIn" id="identity-card-section">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-6 md:gap-8">
        
        {/* Page Header Area */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#3F3632]/10">
          <div className="flex items-center gap-3.5">
            <Link 
              to="/" 
              className="p-2 rounded-xl bg-[#F8F5F2] hover:bg-[#E8E1DD] text-[#171719] border border-[#3F3632]/10 transition-colors flex items-center justify-center shadow-none active:scale-95"
              title="Return to Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight uppercase text-[#171719]">
                  Digital Identity
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#55765F]/15 text-[#55765F] border border-[#55765F]/20">
                  PRO VERIFIED
                </span>
              </div>
              <p className="text-xs text-[#746D68] font-medium mt-0.5">
                Verified Member Pass &amp; Campus Gate Credentials
              </p>
            </div>
          </div>

          {/* View Switcher Compact Segmented Control */}
          <div className="inline-flex p-1 bg-white/40 border border-[#3F3632]/10 rounded-[14px] backdrop-blur-md gap-1 self-start sm:self-auto shadow-none">
            <button
              id="toggle-badge-view"
              onClick={() => setViewMode("badge")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-xs font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                viewMode === "badge"
                  ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
                  : "bg-transparent text-[#625B57] hover:text-[#171719]"
              }`}
            >
              <IdCard className="w-4 h-4" />
              <span>Identity Badge</span>
            </button>
            <button
              id="toggle-access-view"
              onClick={() => setViewMode("access")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-xs font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                viewMode === "access"
                  ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
                  : "bg-transparent text-[#625B57] hover:text-[#171719]"
              }`}
            >
              <Fingerprint className="w-4 h-4" />
              <span>Access Overview</span>
            </button>
          </div>
        </div>

        {viewMode === "badge" ? (
          /* SCREEN 2: DIGITAL ID HERO VIEW */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start" id="badge-view-container">
            {/* Left Column: Secure Identity Card & Wallet */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              
              {/* Refined Dark Anchor Identity Card */}
              <div className="bg-[#1B1B1D] text-white rounded-[18px] p-6 shadow-[0_14px_34px_rgba(20,18,17,0.10)] border border-white/10 flex flex-col items-center text-center relative overflow-hidden">
                
                {/* Header Tag */}
                <div className="w-full flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#55765F]" />
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#938C87]">
                      VERIFIED MEMBER
                    </span>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-[#55765F]" />
                </div>

                {/* Avatar with Mineral Blue Ring */}
                <div className="relative mb-3">
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-20 h-20 md:w-22 md:h-22 rounded-full object-cover border-2 border-[#42566E] p-0.5 bg-[#1B1B1D] shadow-md"
                  />
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#55765F] border-2 border-[#1B1B1D] rounded-full" title="Active Clearance" />
                </div>

                <h2 className="text-xl md:text-2xl font-extrabold uppercase tracking-tight text-white mb-0.5">
                  {user.name}
                </h2>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#938C87] mb-4">
                  Student • ID: {user.studentId}
                </p>

                {/* Authentication Status Info */}
                {isAuthenticated && authEmail ? (
                  <div className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 mb-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-white/90 font-medium truncate">
                      <span className="w-2 h-2 rounded-full bg-[#55765F] flex-shrink-0" />
                      <span className="truncate" title={authEmail}>{authEmail}</span>
                    </div>
                    {onLogout && (
                      <button
                        onClick={onLogout}
                        className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#938C87] hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg transition-colors border border-white/10 cursor-pointer"
                      >
                        <LogOut className="w-3 h-3" />
                        <span>Sign Out</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="w-full mb-4">
                    <button
                      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: `${window.location.origin}/identity` })}
                      className="w-full py-2 px-3 rounded-xl bg-white text-[#171719] font-bold text-xs uppercase tracking-wider hover:bg-[#F8F5F2] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                      <span>Sign in with Google</span>
                    </button>
                  </div>
                )}

                {/* Permanent QR Code Container */}
                <div className="bg-white p-3.5 rounded-[12px] shadow-sm mb-3 flex flex-col items-center gap-2.5 border border-white/20 w-full max-w-[210px]">
                  <div className="w-40 h-40 bg-white flex items-center justify-center rounded-lg overflow-hidden p-1">
                    {permanentQr ? (
                      <QRCodeSVG
                        value={permanentQr}
                        size={148}
                        level="H"
                        includeMargin={false}
                      />
                    ) : qrError ? (
                      <div className="text-xs text-[#A34F4C] font-bold uppercase tracking-wider flex flex-col items-center gap-1.5 px-2 text-center">
                        <AlertTriangle className="w-6 h-6 text-[#A34F4C]" />
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
                      <div className="text-xs text-[#938C87] font-bold uppercase tracking-wider flex flex-col items-center gap-2">
                        <QrCode className="w-7 h-7 text-[#938C87] animate-pulse" />
                        <span>{qrLoading ? "Loading QR..." : ""}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-widest text-[#171719]">
                    <span className="w-2 h-2 rounded-full bg-[#55765F]" />
                    <span>PERMANENT CLEARANCE QR</span>
                  </div>
                </div>

                {/* Copy QR Payload Action */}
                <button
                  onClick={() => handleCopyCode(permanentQr || "")}
                  disabled={!permanentQr}
                  className="w-full h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 text-xs font-bold text-[#F8F5F2] transition-all flex items-center justify-center gap-2 cursor-pointer mb-4"
                  title="Click to copy QR payload"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-4 h-4 text-[#55765F]" />
                      <span className="text-[#55765F] uppercase tracking-wider font-extrabold">PAYLOAD COPIED!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-[#938C87]" />
                      <span className="uppercase tracking-wider font-extrabold">{permanentQr ? "COPY QR PAYLOAD" : "SECURE PASS LOAD"}</span>
                    </>
                  )}
                </button>

                {/* Split Footer Actions */}
                <div className="w-full pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs font-bold">
                  <button
                    id="action-show-id"
                    className="h-10 rounded-lg hover:bg-white/5 text-[#938C87] hover:text-white flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider text-[11px] cursor-pointer"
                  >
                    <IdCard className="w-4 h-4" />
                    <span>Show Badge</span>
                  </button>
                  <button
                    id="action-view-logs"
                    className="h-10 rounded-lg hover:bg-white/5 text-[#938C87] hover:text-white flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider text-[11px] cursor-pointer"
                  >
                    <History className="w-4 h-4" />
                    <span>Audit Logs</span>
                  </button>
                </div>
              </div>

              {/* Light Compact Phone Wallet Utility Card */}
              <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-4 flex items-center justify-between shadow-[0_6px_18px_rgba(32,27,24,0.04)]">
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-[#42566E]/10 border border-[#42566E]/20 text-[#42566E] flex items-center justify-center flex-shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">
                      SYNC TO APPLE / GOOGLE WALLET
                    </h4>
                    <p className="text-[11px] text-[#746D68] mt-0.5">
                      Export pass directly to your phone wallet
                    </p>
                  </div>
                </div>
                <Link 
                  to="/wallet" 
                  className="w-8 h-8 rounded-lg bg-[#E8E1DD]/60 hover:bg-[#E8E1DD] text-[#171719] flex items-center justify-center transition-colors flex-shrink-0"
                  title="Wallet Settings"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Right Column: Access Overview & Active Passes */}
            <div className="lg:col-span-7 flex flex-col gap-6 md:gap-7">
              
              {/* Today's Access Metric Cards */}
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#171719] flex items-center gap-2">
                  <span>TODAY'S ACCESS OVERVIEW</span>
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Metric 1: Current Location */}
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-4 sm:p-5 shadow-[0_6px_18px_rgba(32,27,24,0.04)] flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-[#938C87] uppercase tracking-wider">
                        Current Location
                      </span>
                      <div className="p-1.5 rounded-lg bg-[#42566E]/10 text-[#42566E] border border-[#42566E]/20">
                        <MapPin className="w-4 h-4" />
                      </div>
                    </div>
                    <span className="text-xl sm:text-2xl font-extrabold text-[#171719] uppercase tracking-tight mt-2 mb-1">
                      {user.currentZone}
                    </span>
                    <span className="text-xs text-[#55765F] font-semibold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Logged Entry • 08:32 AM
                    </span>
                  </div>

                  {/* Metric 2: Clearance Level */}
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-4 sm:p-5 shadow-[0_6px_18px_rgba(32,27,24,0.04)] flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-[#938C87] uppercase tracking-wider">
                        Clearance Level
                      </span>
                      <div className="p-1.5 rounded-lg bg-[#42566E]/10 text-[#42566E] border border-[#42566E]/20">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                    </div>
                    <span className="text-xl sm:text-2xl font-extrabold text-[#171719] uppercase tracking-tight mt-2 mb-1">
                      {user.clearanceLevel || "Level 2"}
                    </span>
                    <span className="text-xs text-[#746D68] font-medium">
                      Standard Academic &amp; Event Clearance
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Passes Section */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#171719] flex items-center gap-2">
                    <span>ACTIVE PASSES ({activePasses.length})</span>
                  </h3>
                  <button
                    onClick={() => setViewMode("access")}
                    className="text-xs font-extrabold text-[#42566E] hover:underline uppercase tracking-wider cursor-pointer flex items-center gap-1"
                  >
                    <span>View all</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-col gap-2.5">
                  {activePasses.length === 0 ? (
                    <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-6 text-center flex flex-col items-center gap-2 shadow-none">
                      <QrCode className="w-8 h-8 text-[#938C87]" />
                      <p className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">No Active Passes Today</p>
                      <p className="text-[11px] text-[#746D68]">Request temporary access below to obtain gate passes.</p>
                    </div>
                  ) : (
                    activePasses.map((pass) => (
                      <div
                        key={pass.id}
                        onClick={() => onNavigateToWallet(pass)}
                        className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[12px] p-3.5 sm:p-4 min-h-[64px] sm:min-h-[72px] shadow-[0_4px_12px_rgba(32,27,24,0.02)] flex items-center justify-between gap-3 hover:border-[#42566E]/30 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#55765F]/10 border border-[#55765F]/20 text-[#55765F] flex items-center justify-center flex-shrink-0">
                            <CheckCircle className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="bg-[#55765F]/10 border border-[#55765F]/20 text-[#55765F] px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider">
                                {pass.category}
                              </span>
                              <span className="text-xs font-medium text-[#746D68] truncate">{pass.subCategory}</span>
                            </div>
                            <h4 className="font-extrabold text-sm text-[#171719] uppercase tracking-tight truncate">{pass.title}</h4>
                            <p className="text-xs text-[#938C87] font-medium mt-0.5 truncate">{pass.validityText}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="hidden sm:inline-block text-[10px] font-extrabold uppercase tracking-wider text-[#55765F] bg-[#55765F]/10 px-2.5 py-1 rounded-lg border border-[#55765F]/20">
                            {pass.usageText}
                          </span>
                          <ChevronRight className="w-4 h-4 text-[#938C87] group-hover:text-[#171719] transition-colors" />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Primary Action Button: Request Temporary Access */}
                <AnimatedButton
                  id="btn-trigger-request-access"
                  onClick={onNavigateToRequest}
                  className="!mt-1 !w-full !bg-[#171719] hover:!bg-[#292725] !text-[#F8F5F2] !h-[44px] !rounded-[12px] !font-extrabold !text-xs !uppercase !tracking-wider !shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>REQUEST TEMPORARY ACCESS</span>
                </AnimatedButton>
              </div>
            </div>
          </div>
        ) : (
          /* SCREEN 1: ACCESS PASSES OVERVIEW VIEW */
          <div className="flex flex-col gap-6 md:gap-8" id="access-view-container">
            
            {/* Default Access Cards Row */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-extrabold text-[#746D68] uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#42566E]" />
                <span>DEFAULT CAMPUS ACCESS PERMISSIONS</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Card 1: Main Gate */}
                <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-4 shadow-[0_4px_12px_rgba(32,27,24,0.02)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#42566E]/10 border border-[#42566E]/20 flex items-center justify-center text-[#42566E]">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-extrabold text-[#171719] text-sm uppercase tracking-tight">Main Gate</p>
                      <p className="text-xs text-[#746D68] font-medium">24/7 Gate Entry Allowed</p>
                    </div>
                  </div>
                  <CheckCircle className="w-5 h-5 text-[#55765F]" />
                </div>

                {/* Card 2: Library */}
                <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-4 shadow-[0_4px_12px_rgba(32,27,24,0.02)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#42566E]/10 border border-[#42566E]/20 flex items-center justify-center text-[#42566E]">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-extrabold text-[#171719] text-sm uppercase tracking-tight">Library Complex</p>
                      <p className="text-xs text-[#746D68] font-medium">Standard Operating Hours</p>
                    </div>
                  </div>
                  <CheckCircle className="w-5 h-5 text-[#55765F]" />
                </div>

                {/* Card 3: Academic Block */}
                <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-4 shadow-[0_4px_12px_rgba(32,27,24,0.02)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#42566E]/10 border border-[#42566E]/20 flex items-center justify-center text-[#42566E]">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-extrabold text-[#171719] text-sm uppercase tracking-tight">Academic Block A/B</p>
                      <p className="text-xs text-[#746D68] font-medium">Authorized Student Zones</p>
                    </div>
                  </div>
                  <CheckCircle className="w-5 h-5 text-[#55765F]" />
                </div>
              </div>
            </section>

            {/* Active Temporary Passes List */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-extrabold text-[#746D68] uppercase tracking-wider flex items-center gap-2">
                <QrCode className="w-4 h-4 text-[#55765F]" />
                <span>ACTIVE TEMPORARY &amp; GUEST PASSES ({activePasses.length})</span>
              </h2>

              <div className="flex flex-col gap-3">
                {activePasses.length === 0 ? (
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-6 text-center flex flex-col items-center gap-2 shadow-none">
                    <QrCode className="w-8 h-8 text-[#938C87]" />
                    <p className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">No Active Passes</p>
                  </div>
                ) : (
                  activePasses.map((pass) => (
                    <div
                      key={pass.id}
                      onClick={() => onNavigateToWallet(pass)}
                      className="bg-[#F8F5F2] border border-[#3F3632]/10 border-l-4 border-l-[#55765F] rounded-[12px] p-4 shadow-[0_4px_12px_rgba(32,27,24,0.02)] transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#55765F]/10 text-[#55765F] border border-[#55765F]/20 uppercase tracking-wider">
                            {pass.category}
                          </span>
                          <p className="text-xs text-[#746D68] font-medium">{pass.subCategory}</p>
                        </div>
                        <h3 className="text-base font-extrabold text-[#171719] uppercase tracking-tight">{pass.title}</h3>
                        <p className="text-xs font-mono text-[#42566E] font-semibold">ID: {pass.passIdCode}</p>
                      </div>

                      <div className="flex flex-col gap-1.5 sm:items-end">
                        <div className="flex items-center gap-1.5 font-extrabold text-xs text-[#55765F]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{pass.validityText}</span>
                        </div>

                        <div className="bg-[#E8E1DD]/60 border border-[#3F3632]/10 px-2.5 py-0.5 rounded-lg text-[9.5px] font-extrabold text-[#171719] tracking-wider uppercase w-max">
                          {pass.usageText}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Upcoming Temporary Passes List */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-extrabold text-[#746D68] uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#766052]" />
                <span>UPCOMING PASSES ({upcomingPasses.length})</span>
              </h2>

              <div className="flex flex-col gap-3">
                {upcomingPasses.length === 0 ? (
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-6 text-center flex flex-col items-center gap-2 shadow-none">
                    <Clock className="w-8 h-8 text-[#938C87]" />
                    <p className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">No Upcoming Passes</p>
                  </div>
                ) : (
                  upcomingPasses.map((pass) => (
                    <div
                      key={pass.id}
                      onClick={() => onNavigateToWallet(pass)}
                      className="bg-[#F8F5F2] border border-[#3F3632]/10 border-l-4 border-l-[#766052] rounded-[12px] p-4 shadow-[0_4px_12px_rgba(32,27,24,0.02)] transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#766052]/10 text-[#766052] border border-[#766052]/20 uppercase tracking-wider">
                            {pass.category}
                          </span>
                          <p className="text-xs text-[#746D68] font-medium">{pass.subCategory}</p>
                        </div>
                        <h3 className="text-base font-extrabold text-[#171719] uppercase tracking-tight">{pass.title}</h3>
                        <p className="text-xs font-mono text-[#766052] font-semibold">ID: {pass.passIdCode}</p>
                      </div>

                      <div className="flex flex-col gap-1.5 sm:items-end">
                        <div className="flex items-center gap-1.5 font-extrabold text-xs text-[#766052]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{pass.validityText}</span>
                        </div>

                        <div className="bg-[#E8E1DD]/60 border border-[#3F3632]/10 px-2.5 py-0.5 rounded-lg text-[9.5px] font-extrabold text-[#171719] tracking-wider uppercase w-max">
                          {pass.usageText}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Expired / Revoked Passes List */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-extrabold text-[#746D68] uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#A34F4C]" />
                <span>EXPIRED &amp; REVOKED PASSES ({expiredPasses.length})</span>
              </h2>

              <div className="flex flex-col gap-3">
                {expiredPasses.length === 0 ? (
                  <div className="bg-[#F8F5F2] border border-[#3F3632]/10 rounded-[14px] p-6 text-center flex flex-col items-center gap-2 shadow-none">
                    <AlertTriangle className="w-8 h-8 text-[#938C87]" />
                    <p className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">No Expired Passes</p>
                  </div>
                ) : (
                  expiredPasses.map((pass) => (
                    <div
                      key={pass.id}
                      className="bg-[#F8F5F2]/60 opacity-70 border border-[#3F3632]/10 border-l-4 border-l-[#A34F4C] rounded-[12px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#A34F4C]/10 text-[#A34F4C] border border-[#A34F4C]/20 uppercase tracking-wider">
                            {pass.category}
                          </span>
                          <p className="text-xs text-[#746D68] font-medium">{pass.subCategory}</p>
                        </div>
                        <h3 className="text-base font-extrabold text-[#171719] line-through uppercase tracking-tight">{pass.title}</h3>
                        <p className="text-xs font-mono text-[#938C87] font-semibold">ID: {pass.passIdCode}</p>
                      </div>

                      <div className="flex flex-col gap-1.5 sm:items-end">
                        <div className="flex items-center gap-1.5 font-extrabold text-xs text-[#A34F4C]">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{pass.validityText}</span>
                        </div>

                        <div className="bg-[#E8E1DD]/40 border border-[#3F3632]/10 px-2.5 py-0.5 rounded-lg text-[9.5px] font-extrabold text-[#746D68] tracking-wider uppercase w-max">
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
