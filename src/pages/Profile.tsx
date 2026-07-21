import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { UserProfile, InvitePass } from "../types";
import { fetchMyQrPayload } from "../scannerQr";
import { GoogleLogin } from "@react-oauth/google";
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
  Sparkles
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
  if (pass.status === "EXPIRED" || pass.status === "REVOKED") {
    return "EXPIRED";
  }
  if (pass.status === "PENDING") {
    return "UPCOMING";
  }

  const text = pass.validityText.toLowerCase();

  if (text.includes("tomorrow")) {
    return "UPCOMING";
  }

  if (text.includes("expired")) {
    return "EXPIRED";
  }

  if (text.includes("today")) {
    const expMatch = text.match(/expires:\s*today,\s*(\d{1,2}):(\d{2})\s*(am|pm)/) || text.match(/exp:\s*(\d{1,2}):(\d{2})/);
    if (expMatch) {
      const [_, h, m, ap] = expMatch;
      let hour = parseInt(h);
      if (ap && ap.toLowerCase() === "pm" && hour < 12) hour += 12;
      if (ap && ap.toLowerCase() === "am" && hour === 12) hour = 0;
      const min = parseInt(m);

      const now = new Date();
      const curHour = now.getHours();
      const curMin = now.getMinutes();

      if (curHour > hour || (curHour === hour && curMin > min)) {
        return "EXPIRED";
      }
      return "ACTIVE";
    }

    const rangeMatch = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)/);
    if (rangeMatch) {
      const [_, sh, sm, sap, eh, em, eap] = rangeMatch;
      const parseHour = (hourStr: string, apStr: string) => {
        let hr = parseInt(hourStr);
        if (apStr.toLowerCase() === "pm" && hr < 12) hr += 12;
        if (apStr.toLowerCase() === "am" && hr === 12) hr = 0;
        return hr;
      };
      const startHour = parseHour(sh, sap);
      const startMin = parseInt(sm);
      const endHour = parseHour(eh, eap);
      const endMin = parseInt(em);

      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();

      const currentMinutes = currentHour * 60 + currentMin;
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (currentMinutes < startMinutes) {
        return "UPCOMING";
      } else if (currentMinutes > endMinutes) {
        return "EXPIRED";
      } else {
        return "ACTIVE";
      }
    }
  }

  if (text.includes("expires in")) {
    return "ACTIVE";
  }

  if (text.includes("24/7") || text.includes("allowed") || text.includes("standard")) {
    return "ACTIVE";
  }

  return pass.status === "APPROVED" ? "ACTIVE" : "EXPIRED";
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

  useEffect(() => {
    fetchMyQrPayload()
      .then(setPermanentQr)
      .catch((err) => console.error("Failed to load permanent QR code:", err));
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
    <div className="flex flex-col gap-6 animate-fadeIn max-w-7xl mx-auto" id="identity-card-section">
      {/* Page Header */}
      <div className="flex items-center justify-between bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-4 md:p-5 rounded-3xl border border-neutral-200/60 dark:border-white/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <Link 
            to="/" 
            className="p-2.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-white border border-neutral-200/50 dark:border-white/10 transition-all flex items-center justify-center shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-neutral-900 dark:text-white">
                Digital Identity
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                PRO VERIFIED
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-0.5">
              Verified Member Pass &amp; Campus Gate Credentials
            </p>
          </div>
        </div>
      </div>

      {/* View Switcher Segmented Control */}
      <div className="bg-neutral-200/70 dark:bg-neutral-900/80 p-1.5 rounded-2xl border border-neutral-300/50 dark:border-white/10 backdrop-blur-lg flex gap-2 shadow-inner">
        <button
          id="toggle-badge-view"
          onClick={() => setViewMode("badge")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 cursor-pointer ${
            viewMode === "badge"
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 scale-[1.01]"
              : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          }`}
        >
          <IdCard className="w-4 h-4" />
          <span>Identity Badge</span>
        </button>
        <button
          id="toggle-access-view"
          onClick={() => setViewMode("access")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs md:text-sm font-black uppercase tracking-wider transition-all duration-300 cursor-pointer ${
            viewMode === "access"
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 scale-[1.01]"
              : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          }`}
        >
          <Fingerprint className="w-4 h-4" />
          <span>Access Overview</span>
        </button>
      </div>

      {viewMode === "badge" ? (
        /* SCREEN 2: DIGITAL ID HERO VIEW */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="badge-view-container">
          {/* Left Column: Digital Identity Hero Pass */}
          <div className="md:col-span-5 flex flex-col gap-5">
            <div className="bg-gradient-to-b from-neutral-900 via-neutral-950 to-black text-white rounded-3xl overflow-hidden shadow-2xl border border-white/15 flex flex-col relative group">
              {/* Decorative Holographic Glow Orbs */}
              <div className="absolute top-[-20%] left-[-20%] w-60 h-60 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/30 transition-all duration-700" />
              <div className="absolute bottom-[-20%] right-[-20%] w-60 h-60 bg-[#ff2bd6]/15 rounded-full blur-3xl pointer-events-none group-hover:bg-[#ff2bd6]/25 transition-all duration-700" />

              {/* Holographic Top Banner */}
              <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-2.5 flex justify-between items-center text-black font-black text-xs uppercase tracking-widest shadow-md">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                  <span>Verified Member Pass</span>
                </div>
                <ShieldCheck className="w-4 h-4 text-black" />
              </div>

              {/* Card Main Body */}
              <div className="p-6 md:p-8 flex flex-col items-center text-center relative z-10">
                {/* Profile Avatar with Neon Ring */}
                <div className="relative mb-4 group/avatar">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-400 via-purple-500 to-[#ff2bd6] blur-md opacity-70 group-hover/avatar:opacity-100 transition-opacity" />
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-24 h-24 md:w-28 md:h-28 rounded-full object-cover border-4 border-black relative z-10 shadow-2xl"
                  />
                  <span className="absolute bottom-1 right-1 z-20 w-4 h-4 bg-emerald-400 border-2 border-black rounded-full shadow" title="Active Clearance" />
                </div>

                <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white mb-1">
                  {user.name}
                </h2>
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-4 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
                  Student • ID: {user.studentId}
                </p>

                {/* Google Sign In status info */}
                {isAuthenticated && authEmail ? (
                  <div className="mb-5 flex flex-col items-center gap-2 bg-white/5 px-4 py-2.5 rounded-2xl border border-white/10 backdrop-blur-md w-full max-w-[240px]">
                    <div className="flex items-center gap-2 text-xs text-white/90 w-full justify-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                      <span className="font-semibold truncate max-w-[170px]" title={authEmail}>{authEmail}</span>
                    </div>
                    {onLogout && (
                      <button
                        onClick={onLogout}
                        className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1 rounded-xl transition-all w-full cursor-pointer border border-white/10"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    )}
                  </div>
                ) : (
                  onLoginSuccess ? (
                    <div className="mb-5 flex justify-center scale-95">
                      <GoogleLogin
                        onSuccess={onLoginSuccess}
                        onError={onLoginError || (() => console.error("Google Login failed"))}
                      />
                    </div>
                  ) : null
                )}

                {/* Permanent QR Code Container */}
                <div className="bg-white p-4 rounded-3xl shadow-2xl mb-4 relative group/qr flex flex-col items-center gap-3 border-4 border-white/20 transition-transform duration-300 hover:scale-[1.02]">
                  <div className="w-44 h-44 bg-white flex items-center justify-center border border-neutral-200 rounded-2xl overflow-hidden p-2 relative shadow-inner">
                    {permanentQr ? (
                      <QRCodeSVG
                        value={permanentQr}
                        size={160}
                        level="H"
                        includeMargin={false}
                      />
                    ) : (
                      <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider animate-pulse flex flex-col items-center gap-2">
                        <QrCode className="w-8 h-8 text-neutral-300" />
                        <span>Loading QR...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-800">
                      Permanent Clearance QR
                    </span>
                  </div>
                </div>

                {/* Copy QR payload button */}
                <button
                  onClick={() => handleCopyCode(permanentQr || "")}
                  disabled={!permanentQr}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-xs font-black uppercase tracking-widest text-cyan-400 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                  title="Click to copy QR payload"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">PAYLOAD COPIED!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-cyan-400" />
                      <span>{permanentQr ? "COPY QR PAYLOAD" : "SECURE PASS LOAD"}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Action Footer */}
              <div className="bg-neutral-900/80 grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 text-white">
                <button
                  id="action-show-id"
                  className="py-3.5 flex items-center justify-center gap-2 hover:bg-white/5 active:bg-white/10 transition-all text-xs font-black tracking-widest uppercase cursor-pointer text-neutral-300 hover:text-white"
                >
                  <IdCard className="w-4 h-4 text-cyan-400" />
                  <span>Show Badge</span>
                </button>
                <button
                  id="action-view-logs"
                  className="py-3.5 flex items-center justify-center gap-2 hover:bg-white/5 active:bg-white/10 transition-all text-xs font-black tracking-widest uppercase cursor-pointer text-neutral-300 hover:text-white"
                >
                  <History className="w-4 h-4 text-[#ff2bd6]" />
                  <span>Audit Logs</span>
                </button>
              </div>
            </div>

            {/* Apple & Google Wallet Banner */}
            <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-950 rounded-2xl p-4 border border-white/10 shadow-lg flex items-center justify-between hover:border-cyan-500/30 transition-all">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl text-white shadow-md shadow-cyan-500/20">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">Sync To Apple &amp; Google Wallet</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Export passes directly to your phone wallet</p>
                </div>
              </div>
              <Link 
                to="/wallet" 
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all flex items-center justify-center cursor-pointer hover:border-cyan-400"
                title="Wallet Settings"
              >
                <ChevronRight className="w-4 h-4 text-cyan-400" />
              </Link>
            </div>
          </div>

          {/* Right Column: Access Metrics & Active Passes */}
          <div className="md:col-span-7 flex flex-col gap-6">
            {/* Today's Access Metrics Bento Grid */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Today's Access Overview</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Metric 1: Current Zone */}
                <div className="bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl rounded-2xl p-5 border border-neutral-200/60 dark:border-white/10 shadow-xl flex flex-col justify-between hover:border-cyan-500/30 transition-all group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-neutral-500 uppercase tracking-widest">Current Location</span>
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                      <MapPin className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">
                    {user.currentZone}
                  </span>
                  <span className="text-xs text-emerald-500 font-bold mt-3 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Logged Entry • 08:32 AM
                  </span>
                </div>

                {/* Metric 2: Clearance Level */}
                <div className="bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl rounded-2xl p-5 border border-neutral-200/60 dark:border-white/10 shadow-xl flex flex-col justify-between hover:border-[#ff2bd6]/30 transition-all group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-neutral-500 uppercase tracking-widest">Clearance Level</span>
                    <div className="p-2 rounded-xl bg-[#ff2bd6]/10 text-[#ff2bd6] border border-[#ff2bd6]/20 group-hover:scale-110 transition-transform">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">
                    {user.clearanceLevel || "Level 2"}
                  </span>
                  <span className="text-xs text-neutral-400 font-bold mt-3">
                    Standard Academic &amp; Event Clearance
                  </span>
                </div>
              </div>
            </div>

            {/* Active Passes Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <span>Active Passes ({activePasses.length})</span>
                </h3>
                <button
                  onClick={() => setViewMode("access")}
                  className="text-xs font-black text-cyan-400 hover:text-cyan-300 uppercase tracking-widest cursor-pointer flex items-center gap-1"
                >
                  <span>View All</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-3.5">
                {activePasses.length === 0 ? (
                  <div className="bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl rounded-2xl p-8 border border-neutral-200/60 dark:border-white/10 text-center flex flex-col items-center gap-3 shadow-lg">
                    <QrCode className="w-10 h-10 text-neutral-400" />
                    <p className="text-xs font-black text-neutral-400 uppercase tracking-wider">No Active Passes Today</p>
                    <p className="text-[11px] text-neutral-500">Request temporary access below to obtain gate passes.</p>
                  </div>
                ) : (
                  activePasses.map((pass) => (
                    <div
                      key={pass.id}
                      onClick={() => onNavigateToWallet(pass)}
                      className="bg-white/90 dark:bg-neutral-900/80 backdrop-blur-xl rounded-2xl p-5 border border-neutral-200/60 dark:border-white/10 shadow-lg flex items-center justify-between group cursor-pointer hover:border-emerald-500/50 hover:shadow-emerald-500/5 transition-all duration-300 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-emerald-500 rounded-l-2xl" />

                      <div className="flex items-center gap-4 pl-2">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                              {pass.category}
                            </span>
                            <span className="text-xs font-bold text-neutral-500">{pass.subCategory}</span>
                          </div>
                          <h4 className="font-black text-base text-neutral-900 dark:text-white uppercase tracking-tight">{pass.title}</h4>
                          <p className="font-mono text-xs text-neutral-400 mt-0.5">{pass.validityText}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="hidden sm:inline-block text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                          {pass.usageText}
                        </span>
                        <ChevronRight className="w-5 h-5 text-neutral-400 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Request Access Button */}
              <AnimatedButton
                id="btn-trigger-request-access"
                onClick={onNavigateToRequest}
                className="!mt-2 !w-full !bg-gradient-to-r !from-cyan-500 !to-blue-600 !text-white !py-4 !px-6 !rounded-2xl !font-black !text-xs !uppercase !tracking-widest !shadow-xl !shadow-cyan-500/20 hover:!opacity-95 active:!scale-[0.99] transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Request Temporary Access</span>
              </AnimatedButton>
            </div>
          </div>
        </div>
      ) : (
        /* SCREEN 1: ACCESS PASSES OVERVIEW VIEW */
        <div className="flex flex-col gap-8 animate-fadeIn" id="access-view-container">
          {/* Default Access Cards Row */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Default Campus Access Permissions</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Main Gate */}
              <div className="bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl rounded-2xl p-5 border border-neutral-200/60 dark:border-white/10 shadow-lg flex items-center justify-between hover:border-cyan-500/30 transition-all">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-black text-neutral-900 dark:text-white text-sm uppercase tracking-tight">Main Gate</p>
                    <p className="text-xs text-neutral-400 font-medium">24/7 Gate Entry Allowed</p>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>

              {/* Card 2: Library */}
              <div className="bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl rounded-2xl p-5 border border-neutral-200/60 dark:border-white/10 shadow-lg flex items-center justify-between hover:border-cyan-500/30 transition-all">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-black text-neutral-900 dark:text-white text-sm uppercase tracking-tight">Library Complex</p>
                    <p className="text-xs text-neutral-400 font-medium">Standard Operating Hours</p>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>

              {/* Card 3: Academic Block */}
              <div className="bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl rounded-2xl p-5 border border-neutral-200/60 dark:border-white/10 shadow-lg flex items-center justify-between hover:border-cyan-500/30 transition-all">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-black text-neutral-900 dark:text-white text-sm uppercase tracking-tight">Academic Block A/B</p>
                    <p className="text-xs text-neutral-400 font-medium">Authorized Student Zones</p>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </section>

          {/* Active Temporary Passes List */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span>Active Temporary &amp; Guest Passes ({activePasses.length})</span>
            </h2>

            <div className="flex flex-col gap-4">
              {activePasses.length === 0 ? (
                <div className="bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl rounded-2xl p-8 border border-neutral-200/60 dark:border-white/10 text-center flex flex-col items-center gap-3 shadow-lg">
                  <QrCode className="w-10 h-10 text-neutral-400" />
                  <p className="text-xs font-black text-neutral-400 uppercase tracking-wider">No Active Passes</p>
                </div>
              ) : (
                activePasses.map((pass) => (
                  <div
                    key={pass.id}
                    onClick={() => onNavigateToWallet(pass)}
                    className="bg-white/90 dark:bg-neutral-900/80 backdrop-blur-xl rounded-2xl p-5 border-l-4 border-l-emerald-500 border border-neutral-200/60 dark:border-white/10 shadow-xl transition-all hover:scale-[1.01] cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden group"
                  >
                    <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:bg-emerald-500/20 transition-all"></div>

                    <div className="flex flex-col gap-1 z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                          {pass.category}
                        </span>
                        <p className="text-xs text-neutral-400 font-bold">{pass.subCategory}</p>
                      </div>
                      <h3 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">{pass.title}</h3>
                      <p className="text-xs font-mono text-cyan-400 font-bold">ID: {pass.passIdCode}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end z-10">
                      <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                        <Clock className="w-4 h-4" />
                        <span>{pass.validityText}</span>
                      </div>

                      <div className="bg-white/5 border border-white/10 px-3 py-1 rounded-xl text-[10px] font-black text-neutral-300 tracking-widest uppercase w-max">
                        {pass.usageText}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Upcoming Temporary Passes List */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Upcoming Passes ({upcomingPasses.length})</span>
            </h2>

            <div className="flex flex-col gap-4">
              {upcomingPasses.length === 0 ? (
                <div className="bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl rounded-2xl p-8 border border-neutral-200/60 dark:border-white/10 text-center flex flex-col items-center gap-3 shadow-lg">
                  <Clock className="w-10 h-10 text-neutral-400" />
                  <p className="text-xs font-black text-neutral-400 uppercase tracking-wider">No Upcoming Passes</p>
                </div>
              ) : (
                upcomingPasses.map((pass) => (
                  <div
                    key={pass.id}
                    onClick={() => onNavigateToWallet(pass)}
                    className="bg-white/90 dark:bg-neutral-900/80 backdrop-blur-xl rounded-2xl p-5 border-l-4 border-l-cyan-500 border border-neutral-200/60 dark:border-white/10 shadow-xl transition-all hover:scale-[1.01] cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden group"
                  >
                    <div className="absolute right-0 top-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:bg-cyan-500/20 transition-all"></div>

                    <div className="flex flex-col gap-1 z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-wider">
                          {pass.category}
                        </span>
                        <p className="text-xs text-neutral-400 font-bold">{pass.subCategory}</p>
                      </div>
                      <h3 className="text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">{pass.title}</h3>
                      <p className="text-xs font-mono text-cyan-400 font-bold">ID: {pass.passIdCode}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end z-10">
                      <div className="flex items-center gap-2 font-bold text-sm text-cyan-400">
                        <Clock className="w-4 h-4" />
                        <span>{pass.validityText}</span>
                      </div>

                      <div className="bg-white/5 border border-white/10 px-3 py-1 rounded-xl text-[10px] font-black text-neutral-300 tracking-widest uppercase w-max">
                        {pass.usageText}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Expired / Revoked Passes List */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <span>Expired &amp; Revoked Passes ({expiredPasses.length})</span>
            </h2>

            <div className="flex flex-col gap-4 font-sans">
              {expiredPasses.length === 0 ? (
                <div className="bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl rounded-2xl p-8 border border-neutral-200/60 dark:border-white/10 text-center flex flex-col items-center gap-3 shadow-lg">
                  <AlertTriangle className="w-10 h-10 text-neutral-400" />
                  <p className="text-xs font-black text-neutral-400 uppercase tracking-wider">No Expired Passes</p>
                </div>
              ) : (
                expiredPasses.map((pass) => (
                  <div
                    key={pass.id}
                    className="bg-white/50 dark:bg-neutral-900/40 opacity-70 rounded-2xl p-5 border-l-4 border-l-rose-500/60 border border-neutral-200/40 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden"
                  >
                    <div className="flex flex-col gap-1 z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider">
                          {pass.category}
                        </span>
                        <p className="text-xs text-neutral-500 font-bold">{pass.subCategory}</p>
                      </div>
                      <h3 className="text-xl font-black text-neutral-900 dark:text-white line-through uppercase tracking-tight">{pass.title}</h3>
                      <p className="text-xs font-mono text-neutral-500 font-bold">ID: {pass.passIdCode}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end z-10">
                      <div className="flex items-center gap-2 font-bold text-sm text-rose-400">
                        <XCircle className="w-4 h-4" />
                        <span>{pass.validityText}</span>
                      </div>

                      <div className="bg-white/5 border border-white/5 px-3 py-1 rounded-xl text-[10px] font-black text-neutral-500 tracking-widest uppercase w-max">
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
  );
}
