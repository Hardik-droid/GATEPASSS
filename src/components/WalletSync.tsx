import React, { useState } from "react";
import { UserProfile, InvitePass } from "../types";
import { 
  QrCode, 
  Settings, 
  Smartphone, 
  Download, 
  Mail, 
  Lock, 
  Check, 
  Sparkles, 
  Chrome, 
  Apple, 
  HelpCircle,
  BookOpen,
  Music,
  Activity,
  Briefcase,
  Share2
} from "lucide-react";

interface WalletSyncProps {
  user: UserProfile;
  selectedPass?: InvitePass;
}

export default function WalletSync({ user, selectedPass }: WalletSyncProps) {
  const [activePane, setActivePane] = useState<"sync" | "admin">("sync");
  
  // Prefer selected pass or fallback to default
  const pass = selectedPass || {
    id: "p2",
    title: "Visitor Pass",
    category: "PRE-APPROVED",
    subCategory: "Main Campus",
    passIdCode: "MC-VIS-991",
    status: "APPROVED",
    validityText: "Valid Tomorrow",
    usageText: "UNLIMITED ENTRIES (24H)",
    usageType: "unlimited",
    qrToken: "TOKEN_MC_VIS_991"
  };

  // Preference state
  const [walletPreference, setWalletPreference] = useState<string>("google");
  const [walletStatus, setWalletStatus] = useState<string>("Link Generated");
  const [passBranding, setPassBranding] = useState<"premium" | "concert" | "sports" | "enterprise">("premium");
  const [testResult, setTestResult] = useState<string | null>(null);

  // Function to handle mock test generation
  const handleTestGeneration = (type: "Apple" | "Google") => {
    setTestResult(`Generating secure PKPASS bundle for ${type} Wallet...`);
    setTimeout(() => {
      setTestResult(`Success! Verified signed JSON payload pushed to ${type} push servers. Pass template matches the selected branding.`);
      setTimeout(() => setTestResult(null), 4000);
    }, 1500);
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn" id="wallet-sync-section">
      {/* Pane Toggles */}
      <div className="flex justify-between items-center bg-surface-container-high/60 p-1 rounded-xl">
        <button
          onClick={() => setActivePane("sync")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activePane === "sync"
              ? "bg-white text-primary shadow-sm font-bold"
              : "text-on-secondary-fixed-variant hover:text-charcoal-dark"
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Pass Details &amp; Sync</span>
        </button>
        <button
          onClick={() => setActivePane("admin")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activePane === "admin"
              ? "bg-white text-primary shadow-sm font-bold"
              : "text-on-secondary-fixed-variant hover:text-charcoal-dark"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Wallet Admin Panel</span>
        </button>
      </div>

      {activePane === "sync" ? (
        /* SCREEN 5 & 6: DIGTAL PASS DETAILS & WALLET SYNC */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="wallet-sync-layout">
          {/* Left Column: Mobile Ticket Stub Mockup */}
          <div className="md:col-span-5 lg:col-span-5 flex flex-col gap-4">
            {/* Screen 5: Ticket Issued Pass Design */}
            <div className="bg-white rounded-3xl p-6 shadow-md border border-outline-variant/30 flex flex-col relative overflow-hidden">
              {/* Card border trim decoration */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-background rounded-r-full border-r border-outline-variant/30"></div>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-background rounded-l-full border-l border-outline-variant/30"></div>

              <div className="text-center pb-5 border-b-2 border-dashed border-outline-variant/40">
                <h3 className="text-base font-extrabold text-charcoal-dark uppercase tracking-wide">
                  Booking Confirmation
                </h3>
                <p className="text-xs text-on-surface-variant font-medium mt-1">Ticket Issued &amp; Secured</p>
              </div>

              {/* QR Block with Green Lock Overlay */}
              <div className="py-6 flex flex-col items-center">
                <div className="relative p-4 bg-white border border-outline-variant/40 rounded-2xl shadow-sm mb-4">
                  {/* Base QR simulation */}
                  <svg className="w-32 h-32 text-charcoal-dark" viewBox="0 0 100 100" fill="currentColor">
                    <path d="M5,5 h25 v25 h-25 z M12,12 h11 v11 h-11 z" />
                    <path d="M70,5 h25 v25 h-25 z M77,12 h11 v11 h-11 z" />
                    <path d="M5,70 h25 v25 h-25 z M12,77 h11 v11 h-11 z" />
                    <path d="M40,10 h10 v10 h-10 z M50,25 h15 v15 h-15 z" />
                    <path d="M40,75 h15 v15 h-15 z M80,45 h15 v25 h-15 z" />
                    <circle cx="50" cy="50" r="10" fill="white" />
                  </svg>
                  {/* Central Lock Graphic */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-status-success text-white p-1.5 rounded-full shadow">
                      <Lock className="w-4 h-4 fill-white" />
                    </div>
                  </div>
                </div>

                <span className="bg-status-success/10 text-status-success px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wide">
                  Ticket Issued
                </span>
              </div>

              {/* Pass details summary */}
              <div className="bg-surface-container-low rounded-xl p-4 text-center">
                <h4 className="font-extrabold text-charcoal-dark text-sm">
                  {pass.title} - {pass.subCategory}
                </h4>
                <p className="font-mono text-xs text-primary font-bold mt-1">ID: {pass.passIdCode}</p>
                <p className="text-xs text-on-surface-variant font-semibold mt-2">{pass.validityText}</p>
              </div>
            </div>

            {/* Quick Actions Strip */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => alert("Digital PDF pass successfully generated and downloaded to device.")}
                  className="py-3 bg-white hover:bg-surface-container text-charcoal-dark border border-outline-variant rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </button>
                <button 
                  onClick={() => alert(`Email containing raw invitation metadata successfully queued for delivery to attendee.`)}
                  className="py-3 bg-white hover:bg-surface-container text-charcoal-dark border border-outline-variant rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Mail className="w-4 h-4" />
                  <span>Resend Email</span>
                </button>
              </div>

              <button 
                onClick={() => {
                  const shareText = `🎟️ *Delhi Technological University GatePass*\nHello! Here is your official entry pass for:\n*${pass.title} - ${pass.subCategory}*\n🎫 Code: *${pass.passIdCode}*\n🗓️ Validity: *${pass.validityText}*\n⚡ Check-in link: _https://gatepass.io/pass/${pass.passIdCode}_\nPlease keep this QR or ID ready at the Gate!`;
                  navigator.clipboard.writeText(shareText);
                  alert("WhatsApp share template successfully copied to clipboard! Share it with your attendee or friends.");
                }}
                className="w-full py-3 bg-[#25D366] hover:bg-opacity-90 text-white border-none rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp Pass Share</span>
              </button>
            </div>
          </div>

          {/* Right Column: Preferences Selector & Status Sync */}
          <div className="md:col-span-7 lg:col-span-7 flex flex-col gap-6">
            {/* Wallet Preference Selector */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30">
              <h3 className="text-lg font-bold text-charcoal-dark mb-1">One-Time Wallet Preference</h3>
              <p className="text-xs text-on-surface-variant mb-5">
                Automatically synchronize and cache access passes directly to native systems.
              </p>

              <div className="flex flex-col gap-3 mb-6">
                <label className="flex items-center gap-3.5 p-3 rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer border border-outline-variant/10">
                  <input
                    type="radio"
                    name="wallet"
                    value="apple"
                    checked={walletPreference === "apple"}
                    onChange={() => {
                      setWalletPreference("apple");
                      setWalletStatus("Pending Connection");
                    }}
                    className="w-4 h-4 text-primary focus:ring-primary border-outline-variant"
                  />
                  <div>
                    <p className="text-sm font-bold text-charcoal-dark">Apple Wallet</p>
                    <p className="text-xs text-on-surface-variant">Recommended for iOS, WatchOS devices.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3.5 p-3 rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer border border-outline-variant/10">
                  <input
                    type="radio"
                    name="wallet"
                    value="google"
                    checked={walletPreference === "google"}
                    onChange={() => {
                      setWalletPreference("google");
                      setWalletStatus("Link Generated");
                    }}
                    className="w-4 h-4 text-primary focus:ring-primary border-outline-variant"
                  />
                  <div>
                    <p className="text-sm font-bold text-charcoal-dark">Google Wallet</p>
                    <p className="text-xs text-on-surface-variant">Recommended for Android &amp; Chrome companion apps.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3.5 p-3 rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer border border-outline-variant/10">
                  <input
                    type="radio"
                    name="wallet"
                    value="ask"
                    checked={walletPreference === "ask"}
                    onChange={() => {
                      setWalletPreference("ask");
                      setWalletStatus("Prompting User");
                    }}
                    className="w-4 h-4 text-primary focus:ring-primary border-outline-variant"
                  />
                  <div>
                    <p className="text-sm font-bold text-charcoal-dark">Ask every time</p>
                    <p className="text-xs text-on-surface-variant">Ask before committing credentials.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3.5 p-3 rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer border border-outline-variant/10">
                  <input
                    type="radio"
                    name="wallet"
                    value="no"
                    checked={walletPreference === "no"}
                    onChange={() => {
                      setWalletPreference("no");
                      setWalletStatus("Local Web Cache Only");
                    }}
                    className="w-4 h-4 text-primary focus:ring-primary border-outline-variant"
                  />
                  <div>
                    <p className="text-sm font-bold text-charcoal-dark">No, keep on website</p>
                    <p className="text-xs text-on-surface-variant">Store solely inside browser localStorage.</p>
                  </div>
                </label>
              </div>

              {/* Status Row */}
              <div className="flex justify-between items-center bg-surface-container px-4 py-3 rounded-xl mb-6">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Wallet Status</span>
                <span className="text-xs font-bold text-status-success flex items-center gap-1">
                  <Check className="w-4 h-4" /> {walletStatus}
                </span>
              </div>

              {/* Install Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => handleTestGeneration("Apple")}
                  className="bg-black hover:bg-neutral-900 text-white p-3 rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer"
                >
                  <Apple className="w-5 h-5 fill-white text-white" />
                  <div className="text-left">
                    <p className="text-[9px] uppercase tracking-wide text-white/70">Add to</p>
                    <p className="text-xs font-bold -mt-0.5 leading-tight">Apple Wallet</p>
                  </div>
                </button>
                <button
                  onClick={() => handleTestGeneration("Google")}
                  className="bg-black hover:bg-neutral-900 text-white p-3 rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer"
                >
                  <Chrome className="w-5 h-5 text-white" />
                  <div className="text-left">
                    <p className="text-[9px] uppercase tracking-wide text-white/70">Add to</p>
                    <p className="text-xs font-bold -mt-0.5 leading-tight">Google Wallet</p>
                  </div>
                </button>
              </div>

              {testResult && (
                <div className="mt-4 bg-primary-fixed text-primary p-3 rounded-xl border border-primary/20 text-xs font-medium leading-relaxed">
                  {testResult}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* SCREEN 7: ADMIN CONFIGURATION & BRANDING PREVIEW PANEL */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="wallet-admin-layout">
          {/* Apple/Google Settings */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* Apple Wallet */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-outline-variant/30">
              <div className="flex items-center gap-2 text-charcoal-dark mb-4">
                <Apple className="w-5 h-5 text-black fill-black" />
                <h3 className="text-base font-bold">Apple PassKit Settings</h3>
              </div>
              <div className="flex flex-col gap-3 text-xs mb-5">
                <div className="flex justify-between border-b border-surface-container py-2">
                  <span className="text-outline">Certificates Status</span>
                  <span className="font-bold text-status-success flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-status-success inline-block"></span>
                    Active (Expiry: 12/2026)
                  </span>
                </div>
                <div className="flex justify-between border-b border-surface-container py-2">
                  <span className="text-outline">Team ID</span>
                  <span className="font-mono font-bold text-charcoal-dark">A1B2C3D4E5</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-outline">Pass Type ID</span>
                  <span className="font-mono font-bold text-charcoal-dark text-right">pass.com.gatepass.access</span>
                </div>
              </div>
              <button
                onClick={() => handleTestGeneration("Apple")}
                className="w-full py-2.5 bg-primary text-white hover:bg-opacity-95 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
              >
                Test Certificate Generation
              </button>
            </div>

            {/* Google Wallet */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-outline-variant/30">
              <div className="flex items-center gap-2 text-charcoal-dark mb-4">
                <Chrome className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold">Google Wallet REST API Settings</h3>
              </div>
              <div className="flex flex-col gap-3 text-xs mb-5">
                <div className="flex justify-between border-b border-surface-container py-2">
                  <span className="text-outline">Issuer ID</span>
                  <span className="font-mono font-bold text-charcoal-dark">1234567890</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-outline">Service Account JSON</span>
                  <span className="font-bold text-status-success flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-status-success inline-block"></span>
                    Connected &amp; Verified
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleTestGeneration("Google")}
                className="w-full py-2.5 bg-primary text-white hover:bg-opacity-95 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
              >
                Test REST API Handshake
              </button>
            </div>
          </div>

          {/* Right side: Interactive Pass Branding Preview */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-outline-variant/30">
              <h3 className="text-base font-bold text-charcoal-dark mb-1">Pass Design Customizer</h3>
              <p className="text-xs text-on-surface-variant mb-4">
                Toggle pass styles dynamically to simulate visual design variations.
              </p>

              {/* Branding Selector Pills */}
              <div className="flex gap-2 mb-6 flex-wrap">
                <button
                  onClick={() => setPassBranding("premium")}
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    passBranding === "premium"
                      ? "bg-black text-white border-black"
                      : "bg-white text-on-surface-variant border-outline-variant/30 hover:bg-surface-container"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Premium</span>
                </button>
                <button
                  onClick={() => setPassBranding("concert")}
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    passBranding === "concert"
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-on-surface-variant border-outline-variant/30 hover:bg-surface-container"
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>Party/Concert</span>
                </button>
                <button
                  onClick={() => setPassBranding("sports")}
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    passBranding === "sports"
                      ? "bg-status-success text-white border-status-success"
                      : "bg-white text-on-surface-variant border-outline-variant/30 hover:bg-surface-container"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Sports Run</span>
                </button>
                <button
                  onClick={() => setPassBranding("enterprise")}
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    passBranding === "enterprise"
                      ? "bg-charcoal-dark text-white border-charcoal-dark"
                      : "bg-white text-on-surface-variant border-outline-variant/30 hover:bg-surface-container"
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Enterprise</span>
                </button>
              </div>

              {/* Visual Card Mockup */}
              <div 
                className={`w-full aspect-[1.6/1] rounded-2xl p-5 shadow-lg border border-white/5 relative overflow-hidden transition-all duration-300 ${
                  passBranding === "premium"
                    ? "bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-850 text-white"
                    : passBranding === "concert"
                    ? "bg-gradient-to-br from-indigo-950 via-purple-900 to-pink-900 text-white"
                    : passBranding === "sports"
                    ? "bg-gradient-to-br from-emerald-950 via-teal-900 to-cyan-900 text-white"
                    : "bg-gradient-to-br from-slate-900 via-slate-800 to-charcoal-dark text-white"
                }`}
              >
                {/* Background ambient logo */}
                <div className="absolute right-0 bottom-0 w-36 h-36 bg-white/5 rounded-full blur-2xl -mr-12 -mb-12 pointer-events-none"></div>

                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-white/10 rounded-lg">
                      <Lock className={`w-4 h-4 ${passBranding === "premium" ? "text-amber-400" : "text-white"}`} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-white/70">GatePass India</h4>
                      <p className="text-sm font-extrabold -mt-0.5 tracking-tight">Enterprise Access</p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded ${
                    passBranding === "premium" ? "bg-amber-400 text-black" : "bg-white/15 text-white"
                  }`}>
                    {passBranding}
                  </span>
                </div>

                <div className="mt-8 flex justify-between items-end relative z-10">
                  <div className="flex flex-col gap-1">
                    <p className={`text-[10px] uppercase tracking-wider ${
                      passBranding === "premium" ? "text-amber-400/80" : "text-white/60"
                    } font-bold`}>
                      {passBranding.toUpperCase()} PASS
                    </p>
                    <p className="text-xs font-mono font-bold tracking-widest">ID: GP-{passBranding.slice(0, 3).toUpperCase()}-001</p>
                    <p className="text-[9px] text-white/50 font-medium">Valid Until: 12/31/2026</p>
                  </div>

                  {/* Visual Barcode/QR */}
                  <div className="bg-white p-1 rounded-md flex items-center justify-center">
                    <QrCode className="w-10 h-10 text-black" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
