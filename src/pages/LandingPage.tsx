import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { 
  Shield, 
  Smartphone, 
  Sparkles, 
  Lock, 
  Users, 
  Ticket as TicketIcon, 
  CheckCircle, 
  Activity
} from "lucide-react";
import { motion } from "motion/react";
import { MorphText } from "../components/ui/morph-text";
import { AnimatedNumber } from "../components/ui/animated-number";

interface LandingPageProps {
  onLoginSuccess: (credentialResponse: any) => void;
  onLoginError: () => void;
}

export default function LandingPage({ onLoginSuccess, onLoginError }: LandingPageProps) {
  const ease = [0.22, 1, 0.36, 1] as const;

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
              <p className="text-[11px] text-neutral-400 font-medium mt-1">Use your verified Google Student/Staff account to gain instant entry.</p>
            </div>
            
            <div className="scale-105 origin-left py-2">
              <GoogleLogin
                onSuccess={onLoginSuccess}
                onError={onLoginError}
                useOneTap
                theme="filled_black"
                shape="pill"
                size="large"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Card Preview & Features */}
        <div className="flex-1 w-full max-w-md flex flex-col gap-6 relative">
          {/* Glassmorphic Mock Card */}
          <div className="w-full bg-gradient-to-b from-white/10 to-white/[0.02] border border-white/15 rounded-[32px] p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-[#ff2bd6] to-cyan-400 opacity-60" />
            
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-400 to-[#ff2bd6] flex items-center justify-center font-black text-[10px] text-black">
                  GP
                </div>
                <span className="text-[10px] uppercase font-black tracking-widest text-neutral-300">Identity Pass</span>
              </div>
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>

            <div className="flex flex-col gap-1 mb-8">
              <span className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wider">Pass Holder</span>
              <h4 className="text-lg font-black uppercase text-white tracking-tight">Hardik Jain</h4>
              <span className="text-[9px] uppercase font-bold text-cyan-400 tracking-widest">Verified Member</span>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-4 text-[10px] uppercase text-neutral-400 font-bold">
              <div>
                <p className="text-[8px] text-neutral-500 font-bold">Campus Clearance</p>
                <p className="text-white mt-0.5">All Zones Granted</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-neutral-500 font-bold">Gate Station</p>
                <p className="text-[#ff2bd6] mt-0.5">Validated</p>
              </div>
            </div>
          </div>

          {/* Grid list of Features */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
              <Smartphone className="w-5 h-5 text-cyan-400" />
              <h4 className="text-[11px] font-black uppercase tracking-wider text-white">Universal QR</h4>
              <p className="text-[10px] text-neutral-400 leading-normal">Permanent scannable credential for tickets, identity, and gate entry.</p>
            </div>
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
              <Lock className="w-5 h-5 text-cyan-400" />
              <h4 className="text-[11px] font-black uppercase tracking-wider text-white">Secure Check-in</h4>
              <p className="text-[10px] text-neutral-400 leading-normal">Validation checks with backend row locking and double-scan security.</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
              <TicketIcon className="w-5 h-5 text-[#ff2bd6]" />
              <h4 className="text-[11px] font-black uppercase tracking-wider text-white">Razorpay Tickets</h4>
              <p className="text-[10px] text-neutral-400 leading-normal">Premium booking checkout sheets to secure concert passes instantly.</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
              <Users className="w-5 h-5 text-[#ffbe1a]" />
              <h4 className="text-[11px] font-black uppercase tracking-wider text-white">Staff Dashboard</h4>
              <p className="text-[10px] text-neutral-400 leading-normal">Unified organizer control center to review entry requests and logs.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Statistics and Footer */}
      <footer className="bg-black/80 border-t border-white/5 py-8 px-6 md:px-16 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex gap-8 md:gap-16">
            <div className="text-center md:text-left">
              <div className="text-xl md:text-2xl font-black text-white">
                <AnimatedNumber value={15} />
                <span>K+</span>
              </div>
              <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold mt-1">Active Students</p>
            </div>
            <div className="text-center md:text-left">
              <div className="text-xl md:text-2xl font-black text-white">
                <AnimatedNumber value={45} />
                <span>+</span>
              </div>
              <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold mt-1">Events Hosted</p>
            </div>
            <div className="text-center md:text-left">
              <div className="text-xl md:text-2xl font-black text-white">
                <AnimatedNumber value={12} />
                <span>+</span>
              </div>
              <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold mt-1">Access Gates</p>
            </div>
          </div>

          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            &copy; 2026 GatePass Security Inc. All Rights Reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
