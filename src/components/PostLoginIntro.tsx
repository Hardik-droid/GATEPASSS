import { useEffect, useState } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";

interface PostLoginIntroProps {
  userEmail?: string | null;
  onComplete: () => void;
}

export default function PostLoginIntro({ userEmail, onComplete }: PostLoginIntroProps) {
  const [phase, setPhase] = useState<"enter" | "active" | "exit">("enter");

  useEffect(() => {
    // Phase 1 -> Phase 2/3 (Active float & identity activation)
    const activeTimer = setTimeout(() => {
      setPhase("active");
    }, 350);

    // Phase 4 -> Phase 5 (Exit transition to application)
    const exitTimer = setTimeout(() => {
      setPhase("exit");
    }, 1500);

    // Final unmount & handoff callback at ~1850ms
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 1850);

    return () => {
      clearTimeout(activeTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const isExiting = phase === "exit";

  return (
    <div
      aria-label="GatePass Identity Activation"
      role="status"
      style={{
        transition: "opacity 350ms cubic-bezier(0.4, 0, 0.2, 1)",
        opacity: isExiting ? 0 : 1,
        pointerEvents: isExiting ? "none" : "auto",
      }}
      className="fixed inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center p-6 select-none overflow-hidden"
    >
      {/* Background Subtle Gradient Orbs */}
      <div className="absolute top-[-15%] left-[-15%] w-[60%] aspect-square rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[60%] aspect-square rounded-full bg-[#ff2bd6]/10 blur-[130px] pointer-events-none" />

      {/* Floating 3D Identity Access Credential Card */}
      <div
        style={{
          transition: "all 350ms cubic-bezier(0.4, 0, 0.2, 1)",
          transform: isExiting
            ? "translateY(-6px) scale(1.04)"
            : phase === "active"
            ? "translateY(0px) scale(1)"
            : "translateY(12px) scale(0.88)",
          opacity: isExiting ? 0 : 1,
          animation: phase !== "exit" ? "cardFloat3D 1500ms cubic-bezier(0.22, 1, 0.36, 1) both" : undefined,
        }}
        className="w-full max-w-sm bg-gradient-to-b from-white/12 to-white/[0.03] border border-white/15 rounded-[32px] p-7 shadow-2xl backdrop-blur-2xl relative overflow-hidden flex flex-col items-center text-center gap-5"
      >
        {/* Shimmer Light Sweep Effect across card */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer-pass pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-[#ff2bd6] to-cyan-400 opacity-70" />

        {/* Identity Verified Top Badge */}
        <div
          style={{
            animation: "postLoginBadgeEnter 400ms cubic-bezier(0.22, 1, 0.36, 1) 500ms both",
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>IDENTITY VERIFIED</span>
        </div>

        {/* Central Fingerprint Icon Box */}
        <div
          style={{
            animation: "postLoginIconEnter 450ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both",
          }}
          className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-[#ff2bd6] p-0.5 shadow-xl flex items-center justify-center relative group"
        >
          <div className="w-full h-full bg-[#0a0a0c] rounded-[22px] flex items-center justify-center text-white">
            <Fingerprint className="w-10 h-10 text-cyan-400 animate-pulse" />
          </div>
        </div>

        {/* GATEPASS Wordmark & User Email */}
        <div
          style={{
            animation: "postLoginTextEnter 450ms cubic-bezier(0.22, 1, 0.36, 1) 750ms both",
          }}
          className="flex flex-col items-center gap-1"
        >
          <h1 className="text-2xl font-black text-white uppercase tracking-wider">
            GATEPASS
          </h1>
          <p className="text-xs text-neutral-400 font-medium tracking-wide">
            {userEmail ? userEmail : "Access System Ready"}
          </p>
        </div>

        {/* Activated System Status Indicator */}
        <div
          style={{
            animation: "postLoginStatusEnter 400ms cubic-bezier(0.22, 1, 0.36, 1) 950ms both",
          }}
          className="flex items-center gap-2 pt-2 border-t border-white/10 w-full justify-center text-[10px] uppercase font-black tracking-widest text-cyan-400"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span>SESSION AUTHENTICATED</span>
        </div>
      </div>
    </div>
  );
}
