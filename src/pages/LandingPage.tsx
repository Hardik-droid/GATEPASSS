import React, { useState } from "react";
import { 
  Shield, 
  Smartphone, 
  Sparkles, 
  Lock, 
  Users, 
  Ticket as TicketIcon, 
  CheckCircle, 
  Activity,
  LogIn
} from "lucide-react";
import { motion } from "motion/react";
import { MorphText } from "../components/ui/morph-text";
import { AnimatedNumber } from "../components/ui/animated-number";
import { authClient } from "../auth";

interface LandingPageProps {
  onLoginSuccess: (credentialResponse: any) => void;
  onLoginError: () => void;
}

export default function LandingPage({ onLoginSuccess, onLoginError }: LandingPageProps) {
  const ease = [0.22, 1, 0.36, 1] as const;
  const [loadingProfile, setLoadingProfile] = useState(false);

  const handleNeonGoogleSignIn = async () => {
    setLoadingProfile(true);
    try {
      const res: any = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/identity`,
      });
      if (res?.error) {
        console.error("Neon Auth Google sign-in error:", res.error);
        alert(`Neon Auth Error: ${res.error.message || JSON.stringify(res.error)}`);
      }
    } catch (err: any) {
      console.error("Neon Auth Google sign-in failed:", err);
      alert(`Sign-in Error: ${err?.message || err}`);
      onLoginError();
    } finally {
      setLoadingProfile(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col justify-between font-sans selection:bg-cyan-500 selection:text-white relative overflow-hidden">
      {/* Background Gradient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] aspect-square rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] aspect-square rounded-full bg-[#ff2bd6]/5 blur-[120px] pointer-events-none" />

      {/* Header Navigation */}
      <header className="px-6 py-6 md:px-16 flex items-center justify-between border-b border-white/5 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-400 to-[#ff2bd6] flex items-center justify-center font-black text-sm text-black animate-pulse">
            GP
          </div>
          <span className="text-sm font-black tracking-widest uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
            GatePass
          </span>
        </div>
      </header>

      {/* Hero Content */}
      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-12 md:px-16 max-w-2xl mx-auto w-full relative z-10 text-center">
        
        {/* Main Copywriting */}
        <div className="flex flex-col items-center gap-5">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-cyan-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Smart Campus Access Portal</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight leading-none text-white">
            Seamless Entry.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff2bd6] to-cyan-400">
              Absolute Control.
            </span>
          </h1>

          <p className="text-sm md:text-base text-neutral-400 leading-relaxed font-medium">
            GatePass integrates single-token secure QR identity, instant validation checkpoints, and Razorpay-powered event registration into one unified system. Authenticate via Google OAuth to proceed.
          </p>
        </div>

        {/* OAuth Google Authentication Block */}
        <div className="w-full bg-neutral-900/50 border border-white/15 rounded-3xl p-6 md:p-8 backdrop-blur-md shadow-2xl flex flex-col gap-4 text-left">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Sign In &amp; Join GatePass</h3>
            <p className="text-[11px] text-neutral-400 font-medium mt-1">Use your Google account via Neon Auth to gain instant entry.</p>
          </div>
          
          <div className="flex flex-col gap-3 pt-1">
            {/* Neon Auth Google Sign In Button */}
            <button
              onClick={handleNeonGoogleSignIn}
              disabled={loadingProfile}
              className="w-full py-3.5 px-6 rounded-2xl bg-white text-black font-extrabold text-sm uppercase tracking-wider hover:bg-neutral-200 transition-all cursor-pointer flex items-center justify-center gap-3 shadow-lg active:scale-[0.99]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{loadingProfile ? "Redirecting to Neon Auth..." : "Sign in with Google"}</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 md:px-16 border-t border-white/5 text-center text-xs text-neutral-500 font-medium relative z-10">
        GatePass Access System • Secured by Neon Auth &amp; FastAPI
      </footer>
    </div>
  );
}
