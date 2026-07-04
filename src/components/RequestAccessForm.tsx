import React, { useState } from "react";
import { ArrowLeft, Shield, Calendar, Clock, Edit3, ChevronRight, Check } from "lucide-react";
import { AccessRequest, InvitePass } from "../types";

interface RequestAccessFormProps {
  onBack: () => void;
  onSubmitRequest: (newRequest: Omit<AccessRequest, "id" | "status" | "requestTime">) => void;
}

const SAMPLE_ZONES = [
  "Hostel B • Ground Floor",
  "Server Room A • Level 2",
  "Chemistry Lab B • Research Block",
  "Main Campus Library • Silent Study",
  "Dean Office • Admin Wing",
  "Bio-Tech Incubator • Zone 4",
  "Academic Block C • Lecture Hall 101"
];

export default function RequestAccessForm({ onBack, onSubmitRequest }: RequestAccessFormProps) {
  const [selectedZone, setSelectedZone] = useState("");
  const [showZoneSelector, setShowZoneSelector] = useState(false);
  const [startTime, setStartTime] = useState("Today, 09:00 AM");
  const [endTime, setEndTime] = useState("Today, 05:00 PM");
  const [durationPreset, setDurationPreset] = useState<"2h" | "half" | "full" | "custom">("custom");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const selectPreset = (preset: "2h" | "half" | "full") => {
    setDurationPreset(preset);
    if (preset === "2h") {
      setStartTime("Today, " + formatCurrentHour(0));
      setEndTime("Today, " + formatCurrentHour(2));
    } else if (preset === "half") {
      setStartTime("Today, " + formatCurrentHour(0));
      setEndTime("Today, " + formatCurrentHour(4));
    } else if (preset === "full") {
      setStartTime("Today, " + formatCurrentHour(0));
      setEndTime("Today, " + formatCurrentHour(8));
    }
  };

  const formatCurrentHour = (offsetHours: number) => {
    const d = new Date();
    d.setHours(d.getHours() + offsetHours);
    let h = d.getHours();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12; // 0 should be 12
    const min = d.getMinutes().toString().padStart(2, "0");
    return `${h.toString().padStart(2, "0")}:${min} ${ampm}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZone) {
      alert("Please select a target zone.");
      return;
    }
    if (!purpose.trim()) {
      alert("Please specify the purpose of your visit.");
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      onSubmitRequest({
        requesterName: "Hardik Jain",
        zoneName: selectedZone,
        durationHours: durationPreset === "2h" ? "2 Hours" : durationPreset === "half" ? "Half Day" : "Full Day",
        purpose: purpose
      });
      setSubmitting(false);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onBack();
      }, 1500);
    }, 1000);
  };

  return (
    <div className="bg-surface min-h-screen pb-24 font-sans animate-fadeIn">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm px-6 py-4 flex items-center gap-4 border-b border-surface-container-high">
        <button 
          onClick={onBack}
          aria-label="Go back"
          className="p-2 -ml-2 rounded-full hover:bg-surface-container-highest transition-colors text-charcoal-dark focus:outline-none focus:ring-2 focus:ring-primary flex items-center justify-center min-h-[44px] min-w-[44px]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-charcoal-dark tracking-tight">Request Access</h1>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-8">
        {/* Security Assurance Banner */}
        <div className="flex items-start gap-4 p-4 bg-secondary-fixed/40 rounded-xl border border-secondary-fixed shadow-[0px_4px_20px_rgba(76,94,131,0.03)]">
          <div className="p-2 bg-white rounded-full shadow-sm text-primary flex-shrink-0 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary fill-primary/10" />
          </div>
          <div className="flex flex-col gap-1 pt-0.5">
            <p className="text-sm font-bold text-on-secondary-fixed-variant">Safe &amp; Secure Process</p>
            <p className="text-xs text-secondary leading-relaxed">
              All requests are cryptographically signed and reviewed by designated zone administrators prior to approval.
            </p>
          </div>
        </div>

        {success ? (
          <div className="bg-white p-8 rounded-2xl shadow-md border border-status-success/20 text-center flex flex-col items-center gap-4 py-12">
            <div className="w-16 h-16 rounded-full bg-status-success/10 flex items-center justify-center text-status-success">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-charcoal-dark">Access Pass Requested</h3>
            <p className="text-sm text-on-surface-variant max-w-md">
              Your request for <strong>{selectedZone}</strong> has been logged. Admin reviewers will receive a push notification instantly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Zone Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Destination Zone</label>
              <div className="relative">
                <button
                  type="button"
                  id="select-zone-trigger"
                  onClick={() => setShowZoneSelector(!showZoneSelector)}
                  className="w-full flex items-center justify-between p-4 bg-white border border-outline-variant rounded-xl text-left hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary-fixed min-h-[56px] shadow-[0px_4px_20px_rgba(76,94,131,0.01)] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-outline" />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-charcoal-dark">
                        {selectedZone || "Select a Target Zone"}
                      </span>
                      <span className="text-xs text-outline">
                        {selectedZone ? "Destination Confirmed" : "e.g. Campus > Research Wing > Lab 4"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-outline transition-transform duration-200" style={{ transform: showZoneSelector ? 'rotate(90deg)' : 'none' }} />
                </button>

                {/* Dropdown list */}
                {showZoneSelector && (
                  <div className="absolute top-[64px] left-0 w-full bg-white border border-outline-variant rounded-xl shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto animate-fadeIn">
                    <div className="p-2 bg-surface-container-low text-[10px] font-bold text-outline uppercase tracking-wider">Available Zones</div>
                    {SAMPLE_ZONES.map((zone) => (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => {
                          setSelectedZone(zone);
                          setShowZoneSelector(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-charcoal-dark hover:bg-surface-container-high border-b border-surface-container-low last:border-b-0 flex items-center justify-between"
                      >
                        <span>{zone}</span>
                        {selectedZone === zone && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Time Window */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Time Window</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Start Time */}
                <div className="flex items-center gap-3 p-4 bg-white border border-outline-variant rounded-xl min-h-[56px] shadow-[0px_4px_20px_rgba(76,94,131,0.01)]">
                  <Calendar className="w-5 h-5 text-primary" />
                  <div className="flex flex-col w-full">
                    <span className="text-[10px] font-bold text-outline uppercase">Start</span>
                    <input 
                      type="text" 
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        setDurationPreset("custom");
                      }}
                      className="text-sm font-semibold text-charcoal-dark bg-transparent border-none p-0 focus:ring-0 w-full outline-none"
                    />
                  </div>
                </div>

                {/* End Time */}
                <div className="flex items-center gap-3 p-4 bg-white border border-outline-variant rounded-xl min-h-[56px] shadow-[0px_4px_20px_rgba(76,94,131,0.01)]">
                  <Clock className="w-5 h-5 text-primary" />
                  <div className="flex flex-col w-full">
                    <span className="text-[10px] font-bold text-outline uppercase">End</span>
                    <input 
                      type="text" 
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        setDurationPreset("custom");
                      }}
                      className="text-sm font-semibold text-charcoal-dark bg-transparent border-none p-0 focus:ring-0 w-full outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Select Pills */}
              <div className="flex gap-2.5 mt-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  id="preset-2h"
                  onClick={() => selectPreset("2h")}
                  className={`whitespace-nowrap px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer min-h-[36px] ${
                    durationPreset === "2h"
                      ? "border-primary text-primary bg-pass-temporary font-extrabold"
                      : "border-outline-variant text-on-surface-variant bg-white hover:bg-surface-container"
                  }`}
                >
                  2 Hours
                </button>
                <button
                  type="button"
                  id="preset-half"
                  onClick={() => selectPreset("half")}
                  className={`whitespace-nowrap px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer min-h-[36px] ${
                    durationPreset === "half"
                      ? "border-primary text-primary bg-pass-temporary font-extrabold"
                      : "border-outline-variant text-on-surface-variant bg-white hover:bg-surface-container"
                  }`}
                >
                  Half Day
                </button>
                <button
                  type="button"
                  id="preset-full"
                  onClick={() => selectPreset("full")}
                  className={`whitespace-nowrap px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer min-h-[36px] ${
                    durationPreset === "full"
                      ? "border-primary text-primary bg-pass-temporary font-extrabold"
                      : "border-outline-variant text-on-surface-variant bg-white hover:bg-surface-container"
                  }`}
                >
                  Full Day
                </button>
              </div>
            </div>

            {/* Purpose of Visit */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Purpose of Visit</label>
              <div className="relative">
                <textarea
                  required
                  rows={4}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Briefly detail the operational requirement for accessing this zone..."
                  className="w-full p-4 bg-white border border-outline-variant rounded-xl text-sm text-charcoal-dark placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all resize-none shadow-[0px_4px_20px_rgba(76,94,131,0.01)]"
                />
                <div className="absolute bottom-3 right-3 text-outline">
                  <Edit3 className="w-5 h-5 text-outline/80" />
                </div>
              </div>
            </div>

            {/* Submit Action Block */}
            <div className="mt-4">
              <button
                type="submit"
                id="btn-submit-request"
                disabled={submitting}
                className="w-full bg-charcoal-dark text-white font-bold text-xs tracking-widest uppercase py-4 rounded-xl shadow-lg hover:bg-opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 min-h-[56px] disabled:opacity-55 cursor-pointer"
              >
                <span>{submitting ? "Signing Request..." : "Request Access"}</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
