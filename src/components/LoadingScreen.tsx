import { useEffect, useState, useRef } from "react";
import { Fingerprint, Loader2 } from "lucide-react";

interface LoadingScreenProps {
  isHydrated: boolean;
  onExitComplete: () => void;
}

export default function LoadingScreen({ isHydrated, onExitComplete }: LoadingScreenProps) {
  const [isExiting, setIsExiting] = useState(false);
  const startTimeRef = useRef(Date.now());
  const MIN_DISPLAY_MS = 650;
  const EXIT_DURATION_MS = 280;

  useEffect(() => {
    if (!isHydrated) return;

    const elapsed = Date.now() - startTimeRef.current;
    const remainingDelay = Math.max(0, MIN_DISPLAY_MS - elapsed);

    const timer = setTimeout(() => {
      setIsExiting(true);
      const exitTimer = setTimeout(() => {
        onExitComplete();
      }, EXIT_DURATION_MS);
      return () => clearTimeout(exitTimer);
    }, remainingDelay);

    return () => clearTimeout(timer);
  }, [isHydrated, onExitComplete]);

  return (
    <div
      aria-label="Loading GatePass Operating System"
      role="status"
      style={{
        transition: `opacity ${EXIT_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${EXIT_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? "translateY(-4px) scale(0.985)" : "translateY(0) scale(1)",
        pointerEvents: isExiting ? "none" : "auto",
      }}
      className="fixed inset-0 z-[90] bg-background flex flex-col items-center justify-center gap-5 select-none"
    >
      {/* 1. Fingerprint Icon Box (0ms - 420ms) */}
      <div
        style={{
          animation: "loaderLogoEnter 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
        className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg"
      >
        <Fingerprint className="w-9 h-9" />
      </div>

      {/* 2. GATEPASS Title (100ms - 500ms, overlapping stagger) */}
      <h1
        style={{
          animation: "loaderTitleEnter 420ms cubic-bezier(0.22, 1, 0.36, 1) 100ms both",
        }}
        className="text-2xl font-black text-charcoal-dark uppercase tracking-tight"
      >
        GATEPASS
      </h1>

      {/* 3. Connection Status Row (220ms - 540ms, overlapping stagger) */}
      <div
        style={{
          animation: "loaderStatusEnter 340ms cubic-bezier(0.22, 1, 0.36, 1) 220ms both",
        }}
        className="flex items-center gap-2.5 text-sm font-semibold text-on-surface-variant"
      >
        <Loader2
          style={{ willChange: "transform" }}
          className="w-4 h-4 text-primary animate-spin-smooth"
        />
        <span>Connecting to server…</span>
      </div>
    </div>
  );
}
