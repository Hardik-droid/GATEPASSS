import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { 
  Check, 
  Upload, 
  Sparkles, 
  Download, 
  RefreshCw, 
  ArrowLeft, 
  Camera, 
  Image as ImageIcon,
  Sliders,
  Layers,
  ChevronRight,
  Trash2
} from "lucide-react";

// Preset frames (Simple & Distinct)
export interface FrameOption {
  id: string;
  name: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  accentBorder?: string;
  isDark?: boolean;
}

const FRAME_OPTIONS: FrameOption[] = [
  {
    id: "frame-01",
    name: "Classic White",
    bgColor: "#FFFFFF",
    borderColor: "#E5E5E5",
    textColor: "#171719",
    accentBorder: "border-gray-200"
  },
  {
    id: "frame-02",
    name: "Dark Noir",
    bgColor: "#171719",
    borderColor: "#2D2D32",
    textColor: "#F8F5F2",
    isDark: true,
    accentBorder: "border-neutral-800"
  },
  {
    id: "frame-03",
    name: "Warm Cream",
    bgColor: "#FDFBF7",
    borderColor: "#EFEBE4",
    textColor: "#3D3833",
    accentBorder: "border-[#EFEBE4]"
  },
  {
    id: "frame-04",
    name: "Retro Film",
    bgColor: "#0F0F12",
    borderColor: "#26262E",
    textColor: "#E2E8F0",
    isDark: true,
    accentBorder: "border-neutral-700"
  },
  {
    id: "frame-05",
    name: "Neon Edge",
    bgColor: "#09090C",
    borderColor: "#00E5FF",
    textColor: "#00E5FF",
    isDark: true,
    accentBorder: "border-cyan-500"
  },
  {
    id: "frame-06",
    name: "Minimal Rose",
    bgColor: "#FAF0F0",
    borderColor: "#F3D6D6",
    textColor: "#4A2E2E",
    accentBorder: "border-pink-200"
  },
  {
    id: "frame-07",
    name: "Golden Hour",
    bgColor: "#F7F2E7",
    borderColor: "#E8DBC5",
    textColor: "#4A3E2C",
    accentBorder: "border-amber-200"
  },
  {
    id: "frame-08",
    name: "Earthy Sage",
    bgColor: "#F0F4F1",
    borderColor: "#D3E0D7",
    textColor: "#2D3B32",
    accentBorder: "border-emerald-200"
  }
];

// High-quality sample photo presets
const SAMPLE_PHOTOS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&auto=format&fit=crop&q=80",
];

export default function StripCustomizer() {
  // Simplest State Structure:
  const [selectedLayout, setSelectedLayout] = useState<"4" | "3" | "1">("4");
  const [selectedFrameId, setSelectedFrameId] = useState<string>("frame-01");
  const [slotPhotos, setSlotPhotos] = useState<string[]>([...SAMPLE_PHOTOS]);
  const [isExported, setIsExported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);

  const currentFrame = FRAME_OPTIONS.find((f) => f.id === selectedFrameId) || FRAME_OPTIONS[0];

  // Number of slots for selected layout
  const slotCount = selectedLayout === "4" ? 4 : selectedLayout === "3" ? 3 : 1;

  // Upload handler for individual photo slot
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, slotIdx: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const newPhotos = [...slotPhotos];
        newPhotos[slotIdx] = event.target.result as string;
        setSlotPhotos(newPhotos);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFillSamples = () => {
    setSlotPhotos([...SAMPLE_PHOTOS]);
  };

  const handleClearPhotos = () => {
    setSlotPhotos([]);
  };

  const handleDownloadStrip = () => {
    setIsExported(true);
    setTimeout(() => setIsExported(false), 4000);
  };

  return (
    <div className="w-full min-h-screen bg-[#FAFAFA] text-[#171719] font-sans selection:bg-black selection:text-white">
      {/* Header Bar */}
      <div className="w-full bg-white border-b border-black/10 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link 
              to="/" 
              className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-[#171719] border border-black/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-lg font-black tracking-tight text-[#171719] uppercase">Photo Strip Studio</h1>
              <p className="text-xs text-neutral-500 font-semibold">Clean, simple strip customization</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleFillSamples}
              className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#171719] font-bold text-xs uppercase tracking-wider border border-black/10 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Fill Samples</span>
            </button>
            <button
              onClick={handleClearPhotos}
              className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-red-50 text-red-600 font-bold text-xs uppercase tracking-wider border border-black/10 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hidden File Input for uploading */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (activeUploadIndex !== null) {
            handlePhotoUpload(e, activeUploadIndex);
          }
        }}
      />

      {/* Notification Toast */}
      {isExported && (
        <div className="fixed top-20 right-4 z-50 bg-[#171719] text-white px-5 py-3 rounded-2xl shadow-xl border border-white/20 flex items-center gap-3 animate-bounce">
          <Check className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-extrabold uppercase tracking-wide">Photo Strip Exported Successfully!</span>
        </div>
      )}

      {/* Main Grid: Left Customization Controls | Right Live Strip Preview */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 xl:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Customization Controls (Steps 1, 2, 3, 4) */}
          {/* ========================================================================= */}
          <div className="lg:col-span-6 xl:col-span-5 flex flex-col gap-8">
            
            {/* STEP 1 & 2: CHOOSE STRIP LAYOUT */}
            <section className="bg-white rounded-2xl p-5 border border-black/10 shadow-sm space-y-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Step 1</span>
                <h2 className="text-base font-black uppercase text-[#171719]">Choose Strip Layout</h2>
                <p className="text-xs text-neutral-500 font-medium">Select the number of vertical photo slots</p>
              </div>

              {/* 3 Layout Cards */}
              <div className="grid grid-cols-3 gap-3">
                {/* 4 Photos Card */}
                <button
                  type="button"
                  onClick={() => setSelectedLayout("4")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-between gap-3 transition-all cursor-pointer ${
                    selectedLayout === "4"
                      ? "bg-[#171719] text-white border-[#171719] shadow-md scale-[1.02]"
                      : "bg-neutral-50 hover:bg-neutral-100 text-[#171719] border-black/10"
                  }`}
                >
                  {/* Miniature Preview SVG: 4 slots */}
                  <div className="w-10 h-16 rounded border border-current/20 p-1 flex flex-col justify-between items-center bg-black/5">
                    <div className="w-full h-2.5 rounded-[1px] bg-current opacity-80" />
                    <div className="w-full h-2.5 rounded-[1px] bg-current opacity-80" />
                    <div className="w-full h-2.5 rounded-[1px] bg-current opacity-80" />
                    <div className="w-full h-2.5 rounded-[1px] bg-current opacity-80" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-wider">4 Photos</p>
                    <p className="text-[9px] opacity-70 font-semibold">Standard</p>
                  </div>
                </button>

                {/* 3 Photos Card */}
                <button
                  type="button"
                  onClick={() => setSelectedLayout("3")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-between gap-3 transition-all cursor-pointer ${
                    selectedLayout === "3"
                      ? "bg-[#171719] text-white border-[#171719] shadow-md scale-[1.02]"
                      : "bg-neutral-50 hover:bg-neutral-100 text-[#171719] border-black/10"
                  }`}
                >
                  {/* Miniature Preview SVG: 3 slots */}
                  <div className="w-10 h-16 rounded border border-current/20 p-1 flex flex-col justify-between items-center bg-black/5">
                    <div className="w-full h-3.5 rounded-[1px] bg-current opacity-80" />
                    <div className="w-full h-3.5 rounded-[1px] bg-current opacity-80" />
                    <div className="w-full h-3.5 rounded-[1px] bg-current opacity-80" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-wider">3 Photos</p>
                    <p className="text-[9px] opacity-70 font-semibold">Trio</p>
                  </div>
                </button>

                {/* 1 Photo Card */}
                <button
                  type="button"
                  onClick={() => setSelectedLayout("1")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-between gap-3 transition-all cursor-pointer ${
                    selectedLayout === "1"
                      ? "bg-[#171719] text-white border-[#171719] shadow-md scale-[1.02]"
                      : "bg-neutral-50 hover:bg-neutral-100 text-[#171719] border-black/10"
                  }`}
                >
                  {/* Miniature Preview SVG: 1 slot */}
                  <div className="w-10 h-16 rounded border border-current/20 p-1 flex items-center justify-center bg-black/5">
                    <div className="w-full h-11 rounded-[1px] bg-current opacity-80" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-wider">1 Photo</p>
                    <p className="text-[9px] opacity-70 font-semibold">Single</p>
                  </div>
                </button>
              </div>
            </section>

            {/* STEP 3: CHOOSE FRAME */}
            <section className="bg-white rounded-2xl p-5 border border-black/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Step 2</span>
                  <h2 className="text-base font-black uppercase text-[#171719]">Choose Frame</h2>
                </div>
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Scroll horizontal &rarr;</span>
              </div>

              {/* Horizontal Scrollable Frame Selector */}
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory -mx-1 px-1">
                {FRAME_OPTIONS.map((frame) => {
                  const isSelected = selectedFrameId === frame.id;
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => setSelectedFrameId(frame.id)}
                      className={`flex-none w-28 p-2.5 rounded-xl border snap-start flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? "ring-2 ring-[#171719] border-transparent shadow-md scale-95"
                          : "border-black/10 hover:border-black/20 bg-neutral-50"
                      }`}
                    >
                      {/* Frame Color Thumbnail */}
                      <div 
                        className="w-full h-14 rounded-lg border shadow-inner flex flex-col items-center justify-center p-1.5 relative overflow-hidden"
                        style={{ backgroundColor: frame.bgColor, borderColor: frame.borderColor }}
                      >
                        {/* Inner photo mock line */}
                        <div className="w-full h-full border border-black/10 rounded flex flex-col items-center justify-center gap-1 bg-white/40">
                          <div className="w-4 h-2 bg-neutral-400/40 rounded-[1px]" />
                          <div className="w-4 h-2 bg-neutral-400/40 rounded-[1px]" />
                        </div>

                        {isSelected && (
                          <span className="absolute top-1 right-1 w-4 h-4 bg-[#171719] text-white rounded-full flex items-center justify-center text-[10px]">
                            <Check className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] font-bold uppercase text-[#171719] truncate w-full text-center">
                        {frame.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* STEP 4: PHOTO SLOT MANAGEMENT */}
            <section className="bg-white rounded-2xl p-5 border border-black/10 shadow-sm space-y-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Step 3</span>
                <h2 className="text-base font-black uppercase text-[#171719]">Photo Slots ({slotCount})</h2>
                <p className="text-xs text-neutral-500 font-medium">Click any slot to upload your own image</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: slotCount }).map((_, idx) => {
                  const photoSrc = slotPhotos[idx];
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setActiveUploadIndex(idx);
                        fileInputRef.current?.click();
                      }}
                      className="relative aspect-square rounded-xl border border-dashed border-black/20 hover:border-black/40 overflow-hidden bg-neutral-50 flex flex-col items-center justify-center group transition-colors cursor-pointer"
                    >
                      {photoSrc ? (
                        <>
                          <img src={photoSrc} alt={`Slot ${idx + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white p-2">
                            <Upload className="w-4 h-4 mb-1" />
                            <span className="text-[9px] font-bold uppercase">Change</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center text-neutral-400 group-hover:text-neutral-700">
                          <Camera className="w-5 h-5 mb-1" />
                          <span className="text-[10px] font-bold uppercase">Slot {idx + 1}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* CONTINUE / EXPORT ACTION */}
            <button
              type="button"
              onClick={handleDownloadStrip}
              className="w-full py-4 rounded-xl bg-[#171719] hover:bg-neutral-800 text-white font-extrabold text-xs uppercase tracking-widest shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Photo Strip</span>
            </button>

          </div>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: Live Strip Preview (Sticky on Desktop) */}
          {/* ========================================================================= */}
          <div className="lg:col-span-6 xl:col-span-7 flex flex-col items-center justify-center sticky top-6">
            
            <div className="w-full bg-white rounded-2xl p-6 border border-black/10 shadow-sm flex flex-col items-center justify-center">
              
              <div className="flex items-center justify-between w-full max-w-sm mb-4">
                <span className="text-xs font-black uppercase text-[#171719] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Preview
                </span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase">
                  {selectedLayout} Slot • {currentFrame.name}
                </span>
              </div>

              {/* PHOTO STRIP RENDERED CONTAINER */}
              <div 
                className="w-full max-w-[280px] p-4 rounded-2xl shadow-2xl transition-all duration-300 flex flex-col items-center border"
                style={{
                  backgroundColor: currentFrame.bgColor,
                  borderColor: currentFrame.borderColor,
                  color: currentFrame.textColor
                }}
              >
                {/* Photo Stack Container */}
                <div className="w-full flex flex-col gap-3">
                  {Array.from({ length: slotCount }).map((_, idx) => {
                    const imageSrc = slotPhotos[idx] || SAMPLE_PHOTOS[idx % SAMPLE_PHOTOS.length];
                    return (
                      <div 
                        key={idx}
                        className={`w-full overflow-hidden rounded-lg bg-neutral-200 border border-black/10 relative shadow-inner ${
                          selectedLayout === "1" ? "aspect-[3/4]" : selectedLayout === "3" ? "aspect-[4/3]" : "aspect-[4/3]"
                        }`}
                      >
                        <img 
                          src={imageSrc} 
                          alt={`Slot ${idx + 1}`}
                          className="w-full h-full object-cover object-center transition-transform hover:scale-105 duration-300"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Strip Branding Footer */}
                <div className="mt-4 pt-3 w-full text-center border-t border-current/15 flex flex-col items-center gap-0.5">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-90">
                    GATEPASS PHOTO STRIP
                  </p>
                  <p className="text-[8px] font-bold uppercase tracking-wider opacity-60">
                    MEMORY COLLECTION • 2026
                  </p>
                </div>
              </div>

              <p className="text-[10px] text-neutral-400 font-semibold mt-4 text-center">
                Updates in real time as you switch layouts &amp; frames.
              </p>

            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
