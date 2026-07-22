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
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
          <span className="text-[10px] uppercase font-black tracking-widest text-neutral-400">Node Gateway Online</span>
        </div>
      </header>

      {/* Hero Content */}
      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 px-6 py-12 md:px-16 max-w-7xl mx-auto w-full relative z-10">
        
        {/* Left Column: Copywriting */}
        <div className="flex-1 flex flex-col gap-6 lg:max-w-xl">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-cyan-400 max-w-fit">
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

          {/* OAuth Google Authentication Block */}
          <div className="bg-neutral-900/50 border border-white/15 rounded-3xl p-6 backdrop-blur-md shadow-2xl flex flex-col gap-4 mt-2">
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
        </div>

        {/* Right Column: Interactive Card Preview & Features */}
        <div className="flex-1 w-full max-w-md flex flex-col gap-6 relative">
          {/* Glassmorphic Mock Card */}
          <div className="w-full bg-gradient-to-b from-white/10 to-white/[0.02] border border-white/15 rounded-[32px] p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-[#ff2bd6] to-cyan-400 opacity-60" />
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-cyan-400" />
                <span className="text-xs font-black uppercase tracking-wider text-neutral-300">Identity Preview</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ACTIVE
              </span>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-black text-xl text-white shadow-lg">
                HJ
              </div>
              <div>
                <h3 className="font-black text-lg text-white uppercase tracking-tight">Hardik Jain</h3>
                <p className="text-xs text-cyan-400 font-bold uppercase tracking-wider">Student ID: GP-8842-X</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10 text-xs">
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-wider block">Access Level</span>
                <span className="font-bold text-white mt-0.5 block">Full Campus</span>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-wider block">Auth Status</span>
                <span className="font-bold text-emerald-400 mt-0.5 block">Neon Verified</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-3.5 text-center">
              <span className="text-lg font-black text-white block">100%</span>
              <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400 block mt-0.5">Automated</span>
            </div>
            <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-3.5 text-center">
              <span className="text-lg font-black text-cyan-400 block">&lt; 1s</span>
              <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400 block mt-0.5">Verification</span>
            </div>
            <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-3.5 text-center">
              <span className="text-lg font-black text-[#ff2bd6] block">256-bit</span>
              <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400 block mt-0.5">Encryption</span>
            </div>
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
