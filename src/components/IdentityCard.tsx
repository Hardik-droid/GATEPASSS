import React, { useState } from "react";
import { UserProfile, InvitePass, TicketStatus } from "../types";
import { 
  CheckCircle, 
  MapPin, 
  Clock, 
  ChevronRight, 
  Plus, 
  ShieldCheck, 
  User, 
  QrCode, 
  History, 
  IdCard,
  Bell,
  Fingerprint
} from "lucide-react";

interface IdentityCardProps {
  user: UserProfile;
  invitePasses: InvitePass[];
  onNavigateToRequest: () => void;
  onNavigateToWallet: (pass: InvitePass) => void;
}

export default function IdentityCard({ 
  user, 
  invitePasses, 
  onNavigateToRequest,
  onNavigateToWallet
}: IdentityCardProps) {
  const [viewMode, setViewMode] = useState<"access" | "badge">("badge");
  const [copiedText, setCopiedText] = useState(false);

  const activePasses = invitePasses.filter(p => p.status === "APPROVED");

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
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
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
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
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
                <span className="text-xs font-bold uppercase tracking-wider">Verified</span>
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
                <p className="text-sm text-primary-fixed opacity-90 mb-5">
                  Student • ID: {user.studentId}
                </p>

                {/* QR Code Container */}
                <div className="bg-white p-3 rounded-2xl shadow-sm mb-3 relative group">
                  <div className="w-40 h-40 bg-surface-container-lowest flex flex-col items-center justify-center border border-outline-variant rounded-xl overflow-hidden">
                    {/* Simulated elegant vector styled QR block with central lock icon */}
                    <svg className="w-full h-full p-2 text-charcoal-dark" viewBox="0 0 100 100" fill="currentColor">
                      <path d="M5,5 h30 v30 h-30 z M15,15 h10 v10 h-10 z" />
                      <path d="M65,5 h30 v30 h-30 z M75,15 h10 v10 h-10 z" />
                      <path d="M5,65 h30 v30 h-30 z M15,75 h10 v10 h-10 z" />
                      <path d="M45,5 h10 v10 h-10 z M55,20 h10 v10 h-10 z" />
                      <path d="M40,40 h20 v20 h-20 z" fill="#1D8947" opacity="0.1" />
                      <path d="M45,45 h10 v10 h-10 z" fill="#1D8947" />
                      <path d="M85,45 h10 v20 h-10 z" />
                      <path d="M65,65 h10 v10 h-10 z M75,80 h20 v15 h-20 z" />
                      <path d="M45,75 h15 v15 h-15 z" />
                    </svg>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-white/95 rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer text-charcoal-dark font-mono text-xs p-4 text-center">
                    Rotating secure token. Generates new signature every 30s.
                  </div>
                </div>

                <button 
                  onClick={() => handleCopyCode("9A4F-2B19")}
                  className="font-mono text-sm tracking-widest text-white/80 hover:text-white transition-colors cursor-pointer"
                  title="Click to copy security code"
                >
                  {copiedText ? "COPIED!" : "9A4F - 2B19"}
                </button>
              </div>

              {/* Card Footer Quick Actions */}
              <div className="bg-charcoal-dark/20 grid grid-cols-2 divide-x divide-white/15 border-t border-white/10 text-white/90">
                <button 
                  id="action-show-id"
                  className="py-3 flex flex-col items-center justify-center gap-1 hover:bg-white/5 active:bg-white/10 transition-all text-xs font-semibold tracking-wider uppercase"
                >
                  <IdCard className="w-4 h-4 text-white" />
                  <span>Show ID</span>
                </button>
                <button 
                  id="action-view-logs"
                  className="py-3 flex flex-col items-center justify-center gap-1 hover:bg-white/5 active:bg-white/10 transition-all text-xs font-semibold tracking-wider uppercase"
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
                  className="text-xs font-bold text-primary hover:underline tracking-wider uppercase"
                >
                  View All ({activePasses.length})
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {/* Simulated Pass Item 1: Chemistry Lab B */}
                <div 
                  onClick={() => onNavigateToRequest()}
                  className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between group cursor-pointer hover:bg-surface-container-low transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-pass-temporary flex items-center justify-center text-primary flex-shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-charcoal-dark">Chemistry Lab B</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="bg-pass-temporary border border-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                          TEMPORARY
                        </span>
                        <span className="font-mono text-[11px] text-on-surface-variant">EXP: 14:00</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-outline-variant group-hover:text-primary transition-colors" />
                </div>

                {/* Simulated Pass Item 2: Library - 24hr Zone */}
                <div 
                  onClick={() => onNavigateToRequest()}
                  className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between group cursor-pointer hover:bg-surface-container-low transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant flex-shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-charcoal-dark">Library - 24hr Zone</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="bg-status-success text-white px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                          ALLOWED
                        </span>
                        <span className="font-mono text-[11px] text-on-surface-variant">STANDARD</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-outline-variant group-hover:text-primary transition-colors" />
                </div>

                {/* Dynamic list items from approved invitePasses */}
                {activePasses.slice(0, 2).map((pass) => (
                  <div
                    key={pass.id}
                    onClick={() => onNavigateToWallet(pass)}
                    className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between group cursor-pointer hover:bg-surface-container-low transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-status-warning/10 flex items-center justify-center text-status-warning flex-shrink-0">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-charcoal-dark">{pass.title} ({pass.subCategory})</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="bg-status-warning/10 text-status-warning px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                            {pass.category}
                          </span>
                          <span className="font-mono text-[11px] text-on-surface-variant">{pass.validityText}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-outline-variant group-hover:text-status-warning transition-colors" />
                  </div>
                ))}
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
              <span>Active Temporary &amp; Guest Passes</span>
            </h2>

            <div className="flex flex-col gap-4">
              {invitePasses.map((pass) => (
                <div
                  key={pass.id}
                  onClick={() => onNavigateToWallet(pass)}
                  className={`bg-white rounded-xl p-5 shadow-sm border-l-4 transition-all hover:scale-[1.01] cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden ${
                    pass.category === "INVITE" ? "border-l-status-warning" : 
                    pass.category === "PRE-APPROVED" ? "border-l-primary" : "border-l-outline"
                  }`}
                >
                  {/* Subtle background glow effect */}
                  <div className="absolute right-0 top-0 w-24 h-24 bg-primary/5 rounded-full blur-xl -mr-8 -mt-8 pointer-events-none"></div>

                  <div className="flex flex-col gap-1 z-10">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                        pass.category === "INVITE" ? "bg-status-warning/10 text-status-warning" :
                        pass.category === "PRE-APPROVED" ? "bg-pass-temporary text-primary border border-primary/15" :
                        "bg-surface-container-high text-on-surface-variant"
                      }`}>
                        {pass.category}
                      </span>
                      <p className="text-xs text-on-surface-variant font-medium">{pass.subCategory}</p>
                    </div>
                    <h3 className="text-lg font-bold text-charcoal-dark">{pass.title}</h3>
                    <p className="text-xs font-mono text-primary font-semibold">ID: {pass.passIdCode}</p>
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end z-10">
                    <div className={`flex items-center gap-1.5 font-semibold text-sm ${
                      pass.category === "INVITE" ? "text-status-warning" : "text-primary"
                    }`}>
                      <Clock className="w-4 h-4" />
                      <span>{pass.validityText}</span>
                    </div>

                    <div className="bg-surface-container-low px-2.5 py-1 rounded-lg text-[10px] font-bold text-on-surface-variant tracking-wider uppercase w-max">
                      {pass.usageText}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
