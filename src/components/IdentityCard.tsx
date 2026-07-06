import React, { useState, useEffect } from "react";
import { UserProfile, InvitePass } from "../types";
import { GoogleLogin } from "@react-oauth/google";
import { QRCodeSVG } from "qrcode.react";
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
  XCircle
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
    // Check for "expires: today, 2:00 pm" or similar
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

    // Check for "valid: today, 2:00 pm - 6:00 pm"
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

  // 24/7 gate entry
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

  // Dynamic rotating token state
  const [timeRemaining, setTimeRemaining] = useState(30 - (Math.floor(Date.now() / 1000) % 30));
  const [rotatingToken, setRotatingToken] = useState("");

  useEffect(() => {
    const updateToken = () => {
      const epochSlot = Math.floor(Date.now() / 30000);
      const hashSeed = `${user.studentId || "GUEST"}-${epochSlot}`;
      let hash = 0;
      for (let i = 0; i < hashSeed.length; i++) {
        hash = (hash << 5) - hash + hashSeed.charCodeAt(i);
        hash |= 0;
      }
      const tokenVal = "GP-" + Math.abs(hash).toString(16).toUpperCase().slice(0, 8).padEnd(8, "X");
      setRotatingToken(tokenVal);
    };

    updateToken();

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = 30 - (Math.floor(now / 1000) % 30);
      setTimeRemaining(remaining);
      if (remaining === 30) {
        updateToken();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [user.studentId]);

  // Combine hardcoded and dynamic passes
  const allPasses = [...SIMULATED_PASSES, ...invitePasses];

  const activePasses = allPasses.filter(p => getPassStatus(p) === "ACTIVE");
  const upcomingPasses = allPasses.filter(p => getPassStatus(p) === "UPCOMING");
  const expiredPasses = allPasses.filter(p => getPassStatus(p) === "EXPIRED");

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6" id="identity-card-section">
      {/* View Switcher Bar */}
      <div className="flex justify-between items-center bg-surface-container-high/60 p-1 rounded-xl">
        <button
          id="toggle-badge-view"
          onClick={() => setViewMode("badge")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            viewMode === "badge"
              ? "bg-white text-primary shadow-sm font-bold"
              : "text-on-secondary-fixed-variant hover:text-charcoal-dark"
          }`}
        >
          <IdCard className="w-4 h-4" />
          <span>Digital Identity Card</span>
        </button>
        <button
          id="toggle-access-view"
          onClick={() => setViewMode("access")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            viewMode === "access"
              ? "bg-white text-primary shadow-sm font-bold"
              : "text-on-secondary-fixed-variant hover:text-charcoal-dark"
          }`}
        >
          <Fingerprint className="w-4 h-4" />
          <span>Access Overview</span>
        </button>
      </div>

      {viewMode === "badge" ? (
        /* SCREEN 2: DIGITAL ID HERO VIEW */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="badge-view-container">
          {/* Left Column: Digital Identity Hero */}
          <div className="md:col-span-5 lg:col-span-5">
            <div className="bg-primary text-on-primary rounded-2xl overflow-hidden shadow-lg border border-white/10 flex flex-col">
              {/* Verified Ribbon */}
              <div className="bg-status-success px-4 py-2 flex justify-between items-center text-white">
                <span className="text-xs font-bold uppercase tracking-wider">Verified Member</span>
                <ShieldCheck className="w-4 h-4" />
              </div>

              {/* Card Body */}
              <div className="p-6 flex flex-col items-center text-center">
                <div className="relative group mb-4">
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-24 h-24 rounded-full object-cover border-4 border-surface-container-low shadow-md"
                  />
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <span className="text-[10px] text-white font-medium uppercase tracking-wider">In Office</span>
                  </div>
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-white mb-1">{user.name}</h2>
                <p className="text-sm text-primary-fixed opacity-90 mb-3">
                  Student • ID: {user.studentId}
                </p>

                {/* Google login state conditional display */}
                {isAuthenticated && authEmail ? (
                  <div className="mb-4 flex flex-col items-center gap-2 bg-white/10 px-4 py-2.5 rounded-xl border border-white/15 backdrop-blur-sm w-full max-w-[220px]">
                    <div className="flex items-center gap-1.5 text-xs text-white/95 w-full justify-center">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="font-semibold truncate max-w-[170px]" title={authEmail}>{authEmail}</span>
                    </div>
                    {onLogout && (
                      <button
                        onClick={onLogout}
                        className="flex items-center justify-center gap-1 text-[9px] uppercase font-black tracking-wider text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-all w-full cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    )}
                  </div>
                ) : (
                  onLoginSuccess && (
                    <div className="mb-4 flex justify-center scale-90">
                      <GoogleLogin
                        onSuccess={onLoginSuccess}
                        onError={onLoginError || (() => console.error("Google Login failed"))}
                      />
                    </div>
                  )
                )}

                {/* Dynamic QR Code Container */}
                <div className="bg-white p-3.5 rounded-2xl shadow-sm mb-3 relative group w-48 flex flex-col items-center gap-2.5">
                  <div className="w-40 h-40 bg-white flex items-center justify-center border border-outline-variant/30 rounded-xl overflow-hidden p-1 relative">
                    <QRCodeSVG
                      value={rotatingToken}
                      size={144}
                      level="H"
                      includeMargin={false}
                    />
                  </div>
                  
                  {/* Countdown progress bar */}
                  <div className="w-full flex flex-col gap-1 px-1">
                    <div className="flex justify-between items-center text-[9px] font-extrabold tracking-wider uppercase text-charcoal-dark/70">
                      <span>Token Expires</span>
                      <span>{timeRemaining}s</span>
                    </div>
                    <div className="w-full h-1 bg-charcoal-dark/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-status-success transition-all duration-1000 ease-linear"
                        style={{ width: `${(timeRemaining / 30) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center bg-white/95 rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer text-charcoal-dark font-mono text-xs p-4 text-center">
                    <div>
                      <p className="font-extrabold uppercase mb-1">Rotating Token</p>
                      <p className="text-[10px] text-on-surface-variant font-mono">{rotatingToken}</p>
                      <p className="text-[9px] text-primary mt-2">Generates new signature every 30s.</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => handleCopyCode(rotatingToken)}
                  className="font-mono text-sm tracking-widest text-white/80 hover:text-white transition-colors cursor-pointer"
                  title="Click to copy security code"
                >
                  {copiedText ? "COPIED!" : rotatingToken.replace(/(.{4})/, "$1 - ")}
                </button>
              </div>

              {/* Card Footer Quick Actions */}
              <div className="bg-charcoal-dark/20 grid grid-cols-2 divide-x divide-white/15 border-t border-white/10 text-white/90">
                <button 
                  id="action-show-id"
                  className="py-3 flex flex-col items-center justify-center gap-1 hover:bg-white/5 active:bg-white/10 transition-all text-xs font-semibold tracking-wider uppercase cursor-pointer"
                >
                  <IdCard className="w-4 h-4 text-white" />
                  <span>Show ID</span>
                </button>
                <button 
                  id="action-view-logs"
                  className="py-3 flex flex-col items-center justify-center gap-1 hover:bg-white/5 active:bg-white/10 transition-all text-xs font-semibold tracking-wider uppercase cursor-pointer"
                >
                  <History className="w-4 h-4 text-white" />
                  <span>Logs</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Today's Access Metrics & Active Pass Items */}
          <div className="md:col-span-7 lg:col-span-7 flex flex-col gap-6">
            {/* Today's Access Bento Bento Boxes */}
            <div>
              <h3 className="text-lg font-bold text-charcoal-dark mb-3">Today's Access</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Metric 1: Current Zone */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Current Zone</span>
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-xl font-extrabold text-charcoal-dark">{user.currentZone}</span>
                  <span className="text-xs text-status-success font-medium mt-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Since 08:32 AM
                  </span>
                </div>

                {/* Metric 2: Clearance Level */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Clearance Level</span>
                    <ShieldCheck className="w-4 h-4 text-status-warning" />
                  </div>
                  <span className="text-xl font-extrabold text-charcoal-dark">{user.clearanceLevel || "Level 2"}</span>
                  <span className="text-xs text-on-surface-variant mt-2 font-medium">Standard Academic</span>
                </div>
              </div>
            </div>

            {/* Active Passes Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-charcoal-dark">Active Passes</h3>
                <button 
                  onClick={() => setViewMode("access")}
                  className="text-xs font-bold text-primary hover:underline tracking-wider uppercase cursor-pointer"
                >
                  View All ({activePasses.length})
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {activePasses.length === 0 ? (
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-outline-variant/30 text-center flex flex-col items-center gap-2">
                    <QrCode className="w-8 h-8 text-outline-variant" />
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">No Active Passes Today</p>
                    <p className="text-[11px] text-outline">Request temporary access below to get started.</p>
                  </div>
                ) : (
                  activePasses.map((pass) => (
                    <div
                      key={pass.id}
                      onClick={() => onNavigateToWallet(pass)}
                      className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between group cursor-pointer hover:bg-surface-container-low transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-status-success/10 flex items-center justify-center text-status-success flex-shrink-0">
                          <CheckCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-charcoal-dark">{pass.title} ({pass.subCategory})</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="bg-emerald-50 border border-emerald-100 text-status-success px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                              {pass.category}
                            </span>
                            <span className="font-mono text-[11px] text-on-surface-variant">{pass.validityText}</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-outline-variant group-hover:text-status-success transition-colors" />
                    </div>
                  ))
                )}
              </div>

              {/* Request Access Button */}
              <button
                id="btn-trigger-request-access"
                onClick={onNavigateToRequest}
                className="mt-5 w-full bg-charcoal-dark hover:bg-opacity-95 text-white py-3.5 px-6 rounded-xl font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Request Temporary Access</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* SCREEN 1: ACCESS PASSS OVERVIEW VIEW */
        <div className="flex flex-col gap-6 animate-fadeIn" id="access-view-container">
          {/* Default Access Cards Row */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Default Campus Access Permissions</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Main Gate */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-charcoal-dark text-sm">Main Gate</p>
                    <p className="text-xs text-on-surface-variant">24/7 Gate Entry Allowed</p>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-status-success" />
              </div>

              {/* Card 2: Library */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-charcoal-dark text-sm">Library Complex</p>
                    <p className="text-xs text-on-surface-variant">Standard Operating Hours</p>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-status-success" />
              </div>

              {/* Card 3: Academic Block */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-charcoal-dark text-sm">Academic Block A/B</p>
                    <p className="text-xs text-on-surface-variant">Authorized Student Zones</p>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-status-success" />
              </div>
            </div>
          </section>

          {/* Active Temporary Passes List */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
              <QrCode className="w-4 h-4 text-status-warning" />
              <span>Active Temporary &amp; Guest Passes ({activePasses.length})</span>
            </h2>

            <div className="flex flex-col gap-4">
              {activePasses.length === 0 ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-outline-variant/20 text-center flex flex-col items-center gap-2">
                  <QrCode className="w-10 h-10 text-outline-variant" />
                  <p className="text-sm font-bold text-on-surface-variant uppercase tracking-wide">No Active Passes</p>
                </div>
              ) : (
                activePasses.map((pass) => (
                  <div
                    key={pass.id}
                    onClick={() => onNavigateToWallet(pass)}
                    className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-l-status-success transition-all hover:scale-[1.01] cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden"
                  >
                    <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl -mr-8 -mt-8 pointer-events-none"></div>

                    <div className="flex flex-col gap-1 z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-emerald-50 text-status-success border border-emerald-100">
                          {pass.category}
                        </span>
                        <p className="text-xs text-on-surface-variant font-medium">{pass.subCategory}</p>
                      </div>
                      <h3 className="text-lg font-bold text-charcoal-dark">{pass.title}</h3>
                      <p className="text-xs font-mono text-primary font-semibold">ID: {pass.passIdCode}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end z-10">
                      <div className="flex items-center gap-1.5 font-semibold text-sm text-status-success">
                        <Clock className="w-4 h-4" />
                        <span>{pass.validityText}</span>
                      </div>

                      <div className="bg-surface-container-low px-2.5 py-1 rounded-lg text-[10px] font-bold text-on-surface-variant tracking-wider uppercase w-max">
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
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <span>Upcoming Passes ({upcomingPasses.length})</span>
            </h2>

            <div className="flex flex-col gap-4">
              {upcomingPasses.length === 0 ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-outline-variant/20 text-center flex flex-col items-center gap-2">
                  <Clock className="w-10 h-10 text-outline-variant" />
                  <p className="text-sm font-bold text-on-surface-variant uppercase tracking-wide">No Upcoming Passes</p>
                </div>
              ) : (
                upcomingPasses.map((pass) => (
                  <div
                    key={pass.id}
                    onClick={() => onNavigateToWallet(pass)}
                    className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-l-primary transition-all hover:scale-[1.01] cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden"
                  >
                    <div className="absolute right-0 top-0 w-24 h-24 bg-primary/5 rounded-full blur-xl -mr-8 -mt-8 pointer-events-none"></div>

                    <div className="flex flex-col gap-1 z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-primary/5 text-primary border border-primary/10">
                          {pass.category}
                        </span>
                        <p className="text-xs text-on-surface-variant font-medium">{pass.subCategory}</p>
                      </div>
                      <h3 className="text-lg font-bold text-charcoal-dark">{pass.title}</h3>
                      <p className="text-xs font-mono text-primary font-semibold">ID: {pass.passIdCode}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end z-10">
                      <div className="flex items-center gap-1.5 font-semibold text-sm text-primary">
                        <Clock className="w-4 h-4" />
                        <span>{pass.validityText}</span>
                      </div>

                      <div className="bg-surface-container-low px-2.5 py-1 rounded-lg text-[10px] font-bold text-on-surface-variant tracking-wider uppercase w-max">
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
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-status-danger" />
              <span>Expired &amp; Revoked Passes ({expiredPasses.length})</span>
            </h2>

            <div className="flex flex-col gap-4 font-sans">
              {expiredPasses.length === 0 ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-outline-variant/20 text-center flex flex-col items-center gap-2">
                  <AlertTriangle className="w-10 h-10 text-outline-variant" />
                  <p className="text-sm font-bold text-on-surface-variant uppercase tracking-wide">No Expired Passes</p>
                </div>
              ) : (
                expiredPasses.map((pass) => (
                  <div
                    key={pass.id}
                    className="bg-white opacity-60 rounded-xl p-5 shadow-sm border-l-4 border-l-status-danger flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden"
                  >
                    <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/5 rounded-full blur-xl -mr-8 -mt-8 pointer-events-none"></div>

                    <div className="flex flex-col gap-1 z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-red-50 text-status-danger border border-red-100">
                          {pass.category}
                        </span>
                        <p className="text-xs text-on-surface-variant font-medium">{pass.subCategory}</p>
                      </div>
                      <h3 className="text-lg font-bold text-charcoal-dark line-through">{pass.title}</h3>
                      <p className="text-xs font-mono text-outline font-semibold">ID: {pass.passIdCode}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end z-10">
                      <div className="flex items-center gap-1.5 font-semibold text-sm text-status-danger">
                        <XCircle className="w-4 h-4" />
                        <span>{pass.validityText}</span>
                      </div>

                      <div className="bg-surface-container-low px-2.5 py-1 rounded-lg text-[10px] font-bold text-outline tracking-wider uppercase w-max">
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
