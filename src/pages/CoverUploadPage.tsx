import React, { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { EventItem, CoverUploadLinkConfig } from "../types";
import { validateCoverLink, formatExpiryLabel } from "../coverLinkUtils";
import { uploadEventCoverApi } from "../api";
import { validateImageFile } from "../imageValidation";
import { coverErrorMessage } from "../coverError";
import KineticHeading from "../components/ui/KineticHeading";
import AnimatedButton from "../components/ui/animated-button";
import { QRCodeSVG } from "qrcode.react";
import {
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Sparkles,
  Sliders,
  Smartphone,
  Monitor,
  QrCode,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Eye,
  Layers,
  Calendar,
  MapPin,
  X,
  Check,
  ExternalLink
} from "lucide-react";

interface CoverUploadPageProps {
  events: EventItem[];
  onUpdateEventCover: (
    eventId: string,
    newCoverUrl: string,
    configUpdates?: Partial<CoverUploadLinkConfig>,
  ) => Promise<boolean>;
}

export default function CoverUploadPage({ events, onUpdateEventCover }: CoverUploadPageProps) {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || undefined;

  const targetEvent = events.find((e) => e.id === eventId);
  const linkConfig = targetEvent?.coverUploadConfig;

  // Security state
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Validation
  const validation = validateCoverLink(linkConfig, passwordUnlocked ? linkConfig?.password || "" : passwordInput);

  // Upload & Editing state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "4:3">("16:9");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [autoCenter, setAutoCenter] = useState<boolean>(true);

  // Process & Status
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<"invitation" | "pass" | "verification" | "registration" | "dashboard">("invitation");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (linkConfig?.password && passwordInput.trim() === linkConfig.password.trim()) {
      setPasswordUnlocked(true);
      setPasswordError(null);
    } else {
      setPasswordError("Incorrect upload password. Please verify with the event organizer.");
    }
  };

  const processFile = async (selectedFile: File) => {
    setValidationError(null);
    const result = await validateImageFile(selectedFile);
    if (!result.ok) {
      setValidationError(result.message);
      return;
    }

    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleConfirmUpload = async () => {
    if (!file || !targetEvent) return;
    setIsUploading(true);
    setValidationError(null);

    try {
      const uploadedUrl = await uploadEventCoverApi(file);

      // "Deployed" is claimed only after the event row has actually committed
      // the new reference. Uploading the bytes is only half the job — showing
      // success on the upload alone is what made the cover look saved right up
      // until the next refresh.
      const saved = await onUpdateEventCover(targetEvent.id, uploadedUrl, {
        hasCustomCover: true,
        lastUpdated: new Date().toISOString()
      });

      if (!saved) {
        setValidationError(
          "Your image uploaded, but saving it to the event failed. Please try again."
        );
        return;
      }

      setPublishedUrl(uploadedUrl);
      setUploadSuccess(true);
    } catch (err: any) {
      console.error("Cover upload error:", err);
      setValidationError(coverErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  // If event not found
  if (!targetEvent) {
    return (
      <div className="min-h-screen bg-[#0F0F12] text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-2xl text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black tracking-tight mb-2">Event Not Found</h2>
          <p className="text-sm text-gray-400 mb-6">
            The event link you are trying to access does not exist or has been removed.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-gray-200 transition-colors"
          >
            Return to GatePass Home
          </Link>
        </div>
      </div>
    );
  }

  // Handle Disabled or Expired link
  if (linkConfig?.isDisabled || (linkConfig?.expiresAt && new Date(linkConfig.expiresAt).getTime() < Date.now())) {
    const isExpired = linkConfig?.expiresAt && new Date(linkConfig.expiresAt).getTime() < Date.now();
    return (
      <div className="min-h-screen bg-[#0F0F12] text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-2xl text-center shadow-2xl animate-fadeIn">
          <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
            <Lock className="w-8 h-8" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full mb-3 inline-block">
            {isExpired ? "Link Expired" : "Link Disabled"}
          </span>
          <h2 className="text-2xl font-black tracking-tight mb-2">{targetEvent.title}</h2>
          <p className="text-sm text-gray-400 mb-6">
            {isExpired
              ? "This cover photo upload link has expired. Please ask the event organizer to generate a new upload link."
              : "This cover photo upload link has been disabled by the event organizer."}
          </p>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-xs text-left mb-6 text-gray-300">
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Event Organizer:</span>
              <span className="font-semibold text-white">GatePass Verified Admin</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Venue:</span>
              <span className="font-semibold text-white">{targetEvent.venue}</span>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center w-full py-3 rounded-xl bg-white/10 text-white font-bold text-xs uppercase tracking-wider hover:bg-white/20 transition-all border border-white/10"
          >
            Go to GatePass
          </Link>
        </div>
      </div>
    );
  }

  // Handle Password Protection requirement
  if (linkConfig?.password && !passwordUnlocked) {
    return (
      <div className="min-h-screen bg-[#0F0F12] text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl animate-fadeIn">
          <div className="w-14 h-14 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
            <Lock className="w-7 h-7" />
          </div>
          <div className="text-center mb-6">
            <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full mb-2 inline-block">
              Password Protected Access
            </span>
            <h2 className="text-2xl font-black tracking-tight">{targetEvent.title}</h2>
            <p className="text-xs text-gray-400 mt-1">
              The event organizer protected this link with a passcode. Please enter the passcode to customize the cover photo.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                Upload Passcode
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter passcode"
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/15 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-400 text-sm font-semibold transition-colors"
                autoFocus
              />
            </div>

            {passwordError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Unlock Cover Studio</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Effective display cover (preview file OR published URL OR targetEvent.bannerUrl)
  const displayCoverUrl = publishedUrl || previewUrl || targetEvent.bannerUrl;

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Glassmorphism Navigation Bar */}
      <header className="sticky top-0 z-50 w-full bg-[#0A0A0C]/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 xl:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-[1px] shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-[#0F0F12] rounded-[11px] flex items-center justify-center text-white font-black text-xs uppercase">
                GP
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-white">{targetEvent.title}</h1>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Verified Portal
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-semibold flex items-center gap-2">
                <span>{targetEvent.eventType}</span>
                <span>•</span>
                <span>{targetEvent.venue}</span>
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase font-extrabold tracking-wider">Access Scope</p>
              <p className="text-xs font-bold text-gray-200">Client &amp; Brand Team</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 xl:px-8 py-10">
        {uploadSuccess ? (
          /* SUCCESS STATE AFTER UPLOAD */
          <div className="max-w-2xl mx-auto bg-gradient-to-b from-white/10 to-white/5 border border-white/15 rounded-3xl p-8 sm:p-12 text-center backdrop-blur-2xl shadow-2xl animate-fadeIn">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <span className="text-[11px] font-extrabold uppercase tracking-widest px-4 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-full mb-4 inline-block border border-emerald-500/30">
              Branding Deployed
            </span>
            <h2 className="text-3xl font-black tracking-tight mb-3">Event Cover Successfully Updated!</h2>
            <p className="text-sm text-gray-300 mb-8 max-w-md mx-auto leading-relaxed">
              Your customized cover photo is now automatically applied across all Gate Pass touchpoints: invitation pages, digital passes, scanner terminals, and registration forms.
            </p>

            <div className="p-4 bg-black/40 rounded-2xl border border-white/10 mb-8 overflow-hidden">
              <div className="aspect-video w-full rounded-xl overflow-hidden relative shadow-lg">
                <img src={publishedUrl || displayCoverUrl} alt="Published Cover" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-4">
                  <div className="text-left">
                    <h4 className="text-sm font-bold text-white">{targetEvent.title}</h4>
                    <p className="text-[10px] text-gray-300">{targetEvent.venue}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => {
                  setUploadSuccess(false);
                  setFile(null);
                  setPreviewUrl(null);
                }}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider transition-all border border-white/10 cursor-pointer flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Upload Another Version</span>
              </button>
              <Link
                to={`/events`}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>View Live Event Page</span>
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          /* WORKFLOW & EDITOR STATE */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: Upload Card & Controls (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Header Titles */}
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-extrabold uppercase tracking-wider mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Cover Photo Portal</span>
                </div>
                <h2 className="text-3xl font-black tracking-tight text-white leading-tight">
                  Customize Your Event Experience
                </h2>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Upload your event cover photo to personalize your Gate Pass. Changes propagate in real time across client invitations, wallet passes, and security gates.
                </p>
              </div>

              {/* Upload Drop Zone Card */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-2xl shadow-xl">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                />

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[220px] ${
                    isDragging
                      ? "border-indigo-400 bg-indigo-500/10 scale-[0.99]"
                      : file
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-white/15 hover:border-white/30 hover:bg-white/5"
                  }`}
                >
                  {file ? (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-3 border border-emerald-500/30">
                        <Check className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-white max-w-[200px] truncate">{file.name}</p>
                      <p className="text-[10px] text-gray-400 mt-1 font-semibold">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for smart optimization
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          setPreviewUrl(null);
                        }}
                        className="mt-3 text-[10px] font-bold text-red-400 hover:text-red-300 uppercase tracking-wider underline cursor-pointer"
                      >
                        Change Photo
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-14 h-14 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mb-3 border border-indigo-500/20 shadow-inner">
                        <Upload className="w-7 h-7" />
                      </div>
                      <p className="text-xs font-bold text-white mb-1">Drag &amp; drop your cover photo</p>
                      <p className="text-[10px] text-gray-400 mb-4">Supports PNG, JPG, WEBP up to 50 MB</p>
                      <span className="px-4 py-2 rounded-xl bg-white text-black font-extrabold text-[11px] uppercase tracking-wider shadow-lg hover:bg-gray-100 transition-all">
                        Select Image
                      </span>
                    </div>
                  )}
                </div>

                {validationError && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}
              </div>

              {/* Smart Processing & Crop Controls Card */}
              {previewUrl && (
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-2xl shadow-xl animate-fadeIn space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-indigo-400" />
                      Smart Image Processing
                    </h3>
                    <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Auto-Centered
                    </span>
                  </div>

                  {/* Aspect Ratio Selector */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-2">
                      Aspect Ratio Preset
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAspectRatio("16:9")}
                        className={`py-2 px-3 rounded-xl text-[11px] font-bold uppercase tracking-wider border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          aspectRatio === "16:9"
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-md"
                            : "bg-black/30 text-gray-400 border-white/10 hover:text-white"
                        }`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>Desktop 16:9</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAspectRatio("4:3")}
                        className={`py-2 px-3 rounded-xl text-[11px] font-bold uppercase tracking-wider border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          aspectRatio === "4:3"
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-md"
                            : "bg-black/30 text-gray-400 border-white/10 hover:text-white"
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Mobile 4:3</span>
                      </button>
                    </div>
                  </div>

                  {/* Zoom Slider */}
                  <div>
                    <div className="flex justify-between items-center text-[10px] font-extrabold uppercase text-gray-400 mb-1">
                      <span>Crop Zoom</span>
                      <span className="text-white">{zoomLevel.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="2"
                      step="0.1"
                      value={zoomLevel}
                      onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 bg-black/40 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Focal alignment toggle */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[10px] font-extrabold uppercase text-gray-400">Smart Quality Optimization</span>
                    <button
                      type="button"
                      onClick={() => setAutoCenter(!autoCenter)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${
                        autoCenter ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-white/10 text-gray-400"
                      }`}
                    >
                      {autoCenter ? "Active" : "Off"}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirm Upload Button */}
              {file && (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={handleConfirmUpload}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Optimizing &amp; Publishing Cover...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm &amp; Deploy Cover Photo</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* RIGHT COLUMN: Real-Time Multi-Surface Live Preview Section (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-2xl shadow-xl flex flex-col h-full">
                
                {/* Surface Switcher Tabs */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                      <Eye className="w-4 h-4 text-indigo-400" />
                      Real-Time Multi-Surface Preview
                    </h3>
                    <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
                      Preview how your cover photo dynamically brands every touchpoint.
                    </p>
                  </div>
                </div>

                {/* Navigation Pills */}
                <div className="flex flex-wrap gap-1.5 p-1 bg-black/40 rounded-2xl border border-white/10 mb-6">
                  {[
                    { id: "invitation", label: "Invitation Page" },
                    { id: "pass", label: "Digital Gate Pass" },
                    { id: "verification", label: "QR Terminal" },
                    { id: "registration", label: "Registration" },
                    { id: "dashboard", label: "Dashboard View" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActivePreviewTab(tab.id as any)}
                      className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                        activePreviewTab === tab.id
                          ? "bg-indigo-600 text-white shadow-md"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* LIVE PREVIEW CONTAINER */}
                <div className="flex-1 bg-black/60 rounded-2xl border border-white/10 p-6 flex flex-col justify-center items-center relative overflow-hidden min-h-[380px]">
                  
                  {/* Surface 1: Event Invitation Page Mockup */}
                  {activePreviewTab === "invitation" && (
                    <div className="w-full max-w-md bg-[#141419] rounded-2xl border border-white/15 overflow-hidden shadow-2xl animate-fadeIn">
                      <div className="relative h-44 overflow-hidden">
                        <img
                          src={displayCoverUrl}
                          alt="Cover Preview"
                          style={{
                            transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                          }}
                          className="w-full h-full object-cover transition-all"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#141419] via-transparent to-transparent" />
                        <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-full text-white border border-white/10">
                          {targetEvent.eventType}
                        </span>
                      </div>
                      <div className="p-5">
                        <h4 className="text-base font-black text-white">{targetEvent.title}</h4>
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-indigo-400" />
                          <span>{targetEvent.venue}</span>
                        </p>
                        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                          <span className="text-[10px] text-gray-400 font-bold uppercase">Gate Pass Access</span>
                          <span className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-extrabold uppercase">
                            Get Tickets
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Surface 2: Digital Gate Pass Mockup */}
                  {activePreviewTab === "pass" && (
                    <div className="w-full max-w-xs bg-gradient-to-b from-[#1C1C24] to-[#121218] rounded-3xl border border-white/15 overflow-hidden shadow-2xl p-4 animate-fadeIn">
                      <div className="h-32 rounded-2xl overflow-hidden relative mb-3">
                        <img src={displayCoverUrl} alt="Pass Header" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
                        <div className="absolute bottom-2 left-3 text-white">
                          <p className="text-[9px] font-black uppercase text-indigo-300">DTU ACCESS PASS</p>
                          <h5 className="text-xs font-black truncate max-w-[200px]">{targetEvent.title}</h5>
                        </div>
                      </div>
                      <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-inner">
                        <QRCodeSVG value="SAMPLE_GATEPASS_TOKEN" size={110} />
                        <p className="text-[10px] font-black text-black tracking-widest mt-2 uppercase">GP-9012-VX</p>
                        <p className="text-[9px] text-gray-500 font-bold">VERIFIED DELEGATE ENTRY</p>
                      </div>
                    </div>
                  )}

                  {/* Surface 3: QR Terminal Verification Mockup */}
                  {activePreviewTab === "verification" && (
                    <div className="w-full max-w-sm bg-black rounded-2xl border border-emerald-500/30 p-5 shadow-2xl animate-fadeIn">
                      <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Gate Scanner Terminal
                        </span>
                        <span className="text-[9px] font-extrabold text-gray-400">GATE-01</span>
                      </div>
                      <div className="h-28 rounded-xl overflow-hidden relative mb-3 border border-white/10">
                        <img src={displayCoverUrl} alt="Terminal Banner" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-emerald-950/40" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="px-3 py-1 rounded-full bg-emerald-500 text-black font-black text-[10px] uppercase tracking-wider shadow-lg">
                            ✓ VALID SCAN DETECTED
                          </span>
                        </div>
                      </div>
                      <div className="text-left space-y-1">
                        <p className="text-xs font-bold text-white">Attendee: Rahul Verma</p>
                        <p className="text-[10px] text-gray-400">Event: {targetEvent.title}</p>
                      </div>
                    </div>
                  )}

                  {/* Surface 4: Visitor Registration Mockup */}
                  {activePreviewTab === "registration" && (
                    <div className="w-full max-w-md bg-[#16161D] rounded-2xl border border-white/15 overflow-hidden shadow-2xl p-5 animate-fadeIn">
                      <div className="h-24 rounded-xl overflow-hidden relative mb-4">
                        <img src={displayCoverUrl} alt="Reg Banner" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center px-4">
                          <h5 className="text-sm font-black text-white uppercase tracking-wider">Visitor Registration</h5>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="h-8 bg-white/5 rounded-lg border border-white/10 px-3 flex items-center text-[10px] text-gray-400">
                          Full Name: Hardik Jain
                        </div>
                        <div className="h-8 bg-white/5 rounded-lg border border-white/10 px-3 flex items-center text-[10px] text-gray-400">
                          Requested Zone: VIP Festival Arena
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Surface 5: Event Dashboard Preview Mockup */}
                  {activePreviewTab === "dashboard" && (
                    <div className="w-full max-w-md bg-[#181820] rounded-2xl border border-white/15 p-4 shadow-2xl animate-fadeIn">
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-12 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                          <img src={displayCoverUrl} alt="Dash Thumbnail" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <h5 className="text-xs font-black text-white">{targetEvent.title}</h5>
                          <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                            <Check className="w-3 h-3" />
                            Cover Photo Active
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* Footer Info */}
                <div className="mt-4 text-center">
                  <p className="text-[10px] text-gray-400 font-semibold">
                    Smart image processing automatically generates retina desktop banners &amp; high-DPI mobile wallet dimensions.
                  </p>
                </div>

              </div>

            </div>

          </div>
        )}
      </main>
    </div>
  );
}
