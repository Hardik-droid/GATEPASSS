import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { EventItem, Order, Ticket, ScanLog, Settlement, AuditLog, TicketCategory, TicketStatus, CoverUploadLinkConfig } from "../types";
import { AnimatedNumber } from "../components/ui/animated-number";
import AnimatedButton from "../components/ui/animated-button";
import KineticHeading from "../components/ui/KineticHeading";
import { createCoverConfig, getShareableCoverUploadUrl, formatExpiryLabel } from "../coverLinkUtils";
import { uploadEventCoverApi } from "../api";
import { validateImageFile } from "../imageValidation";
import { coverErrorMessage } from "../coverError";
import {
  Plus,
  TrendingUp,
  Users,
  Calendar,
  ShieldCheck,
  DollarSign,
  Download,
  History,
  Info,
  Tag,
  Trash2,
  FileText,
  Clock,
  MapPin,
  AlertOctagon,
  Sparkles,
  Award,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Smartphone,
  CheckCircle2,
  Link as LinkIcon,
  Copy,
  Lock,
  Share2,
  ExternalLink,
  Eye,
  RefreshCw,
  XCircle,
  X,
  Check,
  Image as ImageIcon,
  Upload
} from "lucide-react";

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the browser's local time.
function toDatetimeLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultEventStart(): Date {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  return start;
}

function defaultEventEnd(start: Date): Date {
  const end = new Date(start);
  end.setHours(end.getHours() + 8);
  return end;
}

const DEFAULT_EVENT_COVER_URL = "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=80";

interface OrganizerWorkspaceProps {
  events: EventItem[];
  orders: Order[];
  tickets: Ticket[];
  scanLogs: ScanLog[];
  settlements: Settlement[];
  auditLogs: AuditLog[];
  onAddNewEvent: (newEvent: EventItem) => Promise<boolean>;
  onIssueManualTicket: (ticket: Omit<Ticket, "id" | "status" | "issuedAt">) => void;
  onProcessRefund: (ticketId: string) => void;
  onUpdateEventCoverConfig?: (eventId: string, config: CoverUploadLinkConfig) => void;
  onUpdateEventCover: (
    eventId: string,
    newCoverUrl: string,
    configUpdates?: Partial<CoverUploadLinkConfig>,
  ) => Promise<boolean>;
}

export default function OrganizerWorkspace({
  events,
  orders,
  tickets,
  scanLogs,
  settlements,
  auditLogs,
  onAddNewEvent,
  onIssueManualTicket,
  onProcessRefund,
  onUpdateEventCoverConfig,
  onUpdateEventCover
}: OrganizerWorkspaceProps) {
  const location = useLocation();
  const getTabFromUrl = () => {
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab === "security" || tab === "audit" || tab === "settlement" || tab === "builder" || tab === "manual" || tab === "org") {
      return tab;
    }
    return "dashboard";
  };

  const [activeTab, setActiveTab] = useState<"dashboard" | "builder" | "manual" | "settlement" | "audit" | "org" | "security">(getTabFromUrl);

  useEffect(() => {
    const currentTab = getTabFromUrl();
    setActiveTab(currentTab);
  }, [location.search]);

  const [controlRoomSubView, setControlRoomSubView] = useState<"stream" | "analytics">("stream");
  const [exploreEventId, setExploreEventId] = useState<string>("all");

  // Organization settings states
  const [orgName, setOrgName] = useState("Delhi Technological University");
  const [orgType, setOrgType] = useState("College Society");
  const [orgEmail, setOrgEmail] = useState("fests@dtu.ac.in");
  const [orgPhone, setOrgPhone] = useState("+91 11 2789 6522");

  const [teamMembers, setTeamMembers] = useState([
    { id: "tm_1", name: "Hardik Jain", email: "hardik@dtu.ac.in", role: "Owner", status: "Active" },
    { id: "tm_2", name: "Rishabh Mehra", email: "mehra.rishabh@dtu.ac.in", role: "Finance Manager", status: "Active" },
    { id: "tm_3", name: "Officer Mehra", email: "mehra@security.org", role: "Gate Staff", status: "Active" },
    { id: "tm_4", name: "Kunal Sen", email: "kunal@dtu.ac.in", role: "Volunteer", status: "Active" }
  ]);

  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("Event Manager");

  const [payoutBank, setPayoutBank] = useState("State Bank of India");
  const [payoutIFSC, setPayoutIFSC] = useState("SBIN0001292");
  const [payoutAcc, setPayoutAcc] = useState("************2091");
  const [payoutUPI, setPayoutUPI] = useState("fests@upi");
  const [payoutSchedule, setPayoutSchedule] = useState("Daily after gate-reconciliation");

  const [brandingColor, setBrandingColor] = useState("#18181b");
  const [ticketHeader, setTicketHeader] = useState("GATEPASS VALID ENTRY TIER");

  const handleAddTeamMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) {
      alert("Please provide member name and email.");
      return;
    }
    const newMember = {
      id: "tm_" + Date.now(),
      name: newMemberName,
      email: newMemberEmail,
      role: newMemberRole,
      status: "Active"
    };
    setTeamMembers([...teamMembers, newMember]);
    setNewMemberName("");
    setNewMemberEmail("");
    showToast(`Added ${newMemberName} as ${newMemberRole}!`);
  };

  const handleRemoveMember = (id: string) => {
    const target = teamMembers.find(m => m.id === id);
    if (target?.role === "Owner") {
      alert("Cannot remove the Owner of this organization.");
      return;
    }
    setTeamMembers(teamMembers.filter(m => m.id !== id));
    showToast(`Removed team member.`);
  };

  // Form states for Event Builder
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType] = useState("College Fest");
  const [eventVenue, setEventVenue] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventCapacity, setEventCapacity] = useState(500);
  const [eventStartTime, setEventStartTime] = useState(() => toDatetimeLocalInput(defaultEventStart()));
  const [eventEndTime, setEventEndTime] = useState(() => toDatetimeLocalInput(defaultEventEnd(defaultEventStart())));
  const [categories, setCategories] = useState<Array<{ name: string; price: number; capacity: number }>>([
    { name: "General Pass", price: 150, capacity: 400 },
    { name: "VIP Pass", price: 499, capacity: 100 }
  ]);

  // Event Cover Image state in Event Builder
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [persistedCoverUrl, setPersistedCoverUrl] = useState<string | null>(null);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (coverPreviewUrl && coverPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
    };
  }, [coverPreviewUrl]);

  const processCoverFile = async (selectedFile: File) => {
    setCoverUploadError(null);
    const result = await validateImageFile(selectedFile);
    if (!result.ok) {
      setCoverUploadError(coverErrorMessage(result.message));
      return;
    }
    if (coverPreviewUrl && coverPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(coverPreviewUrl);
    }
    setSelectedCoverFile(selectedFile);
    setPersistedCoverUrl(null);
    setCoverPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processCoverFile(e.target.files[0]);
    }
  };

  const handleRemoveCover = () => {
    if (coverPreviewUrl && coverPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(coverPreviewUrl);
    }
    setSelectedCoverFile(null);
    setCoverPreviewUrl(null);
    setPersistedCoverUrl(null);
    setCoverUploadError(null);
    if (coverFileInputRef.current) {
      coverFileInputRef.current.value = "";
    }
  };

  // Cover Link System Modal States
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [modalEventId, setModalEventId] = useState<string | null>(null);
  const [modalExpiryHours, setModalExpiryHours] = useState<number | null>(null); // null = Never, 24, 72, 168
  const [modalPassword, setModalPassword] = useState<string>("");
  const [modalAllowReplace, setModalAllowReplace] = useState<boolean>(true);
  const [modalGeneratedUrl, setModalGeneratedUrl] = useState<string>("");

  // Form states for Manual/Cash ticketing
  const [manualEventId, setManualEventId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualPrice, setManualPrice] = useState(0);

  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  // Calculations for Control Room Live metrics
  const totalSalesVolume = orders.reduce((acc, curr) => acc + (curr.paymentStatus === "paid" ? curr.grossAmount : 0), 0);
  const totalCheckedIn = tickets.filter(t => t.status === TicketStatus.CHECKED_IN).length;
  const totalUnused = tickets.filter(t => t.status === TicketStatus.ISSUED).length;
  const totalRefunded = tickets.filter(t => t.status === TicketStatus.REFUNDED).length;
  const duplicateScanAttempts = scanLogs.filter(s => s.scanResult === "ALREADY_USED").length;
  const invalidScanAttempts = scanLogs.filter(s => s.scanResult === "INVALID").length;

  const handleAddCategory = () => {
    setCategories([...categories, { name: "Early Bird", price: 99, capacity: 50 }]);
  };

  const handleRemoveCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const handleCreateEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventVenue.trim()) {
      alert("Please provide complete title and venue details.");
      return;
    }
    if (!eventStartTime || !eventEndTime) {
      alert("Please pick a start and end date/time for the event.");
      return;
    }
    if (new Date(eventEndTime) <= new Date(eventStartTime)) {
      alert("Event end time must be after the start time.");
      return;
    }

    setCoverUploading(true);
    setCoverUploadError(null);

    let activeBannerUrl = persistedCoverUrl || DEFAULT_EVENT_COVER_URL;

    // Upload only if we have a chosen file and haven't already obtained a persistent URL
    if (selectedCoverFile && !persistedCoverUrl) {
      try {
        const uploadedUrl = await uploadEventCoverApi(selectedCoverFile);
        if (typeof uploadedUrl !== "string" || !uploadedUrl.trim()) {
          throw new Error("Upload succeeded, but no valid image URL string was returned by server.");
        }
        activeBannerUrl = uploadedUrl;
        setPersistedCoverUrl(uploadedUrl);
      } catch (err: unknown) {
        console.error("Failed to upload event cover image:", err);
        setCoverUploadError(coverErrorMessage(err));
        setCoverUploading(false);
        return;
      }
    }

    const newEventId = "ev_" + Date.now();

    // Create initial cover upload config link for the new event
    const coverConfig = createCoverConfig({
      hasCustomCover: Boolean(selectedCoverFile || persistedCoverUrl),
      lastUpdated: new Date().toISOString()
    });

    const categoriesSource = categories.length > 0 ? categories : [
      { name: "General Pass", price: 150, capacity: 400 },
      { name: "VIP Pass", price: 499, capacity: 100 }
    ];

    const formattedCategories: TicketCategory[] = categoriesSource.map((cat, idx) => ({
      id: `cat_${newEventId}_${idx}`,
      eventId: newEventId,
      name: cat.name,
      description: `Access tier for ${cat.name}`,
      price: cat.price,
      capacity: cat.capacity,
      soldCount: 0
    }));

    const newEvent: EventItem = {
      id: newEventId,
      title: eventTitle,
      description: eventDesc || "No further details provided by the organization.",
      eventType,
      venue: eventVenue,
      startTime: new Date(eventStartTime).toISOString(),
      endTime: new Date(eventEndTime).toISOString(),
      bannerUrl: typeof activeBannerUrl === "string" ? activeBannerUrl : DEFAULT_EVENT_COVER_URL,
      capacity: eventCapacity,
      ticketCategories: formattedCategories,
      coverUploadConfig: coverConfig
    };

    const saved = await onAddNewEvent(newEvent);
    if (!saved) {
      setCoverUploadError(
        selectedCoverFile || persistedCoverUrl
          ? "The cover uploaded, but the event could not be saved to the database. Click Publish to retry without re-uploading."
          : "The event could not be saved to the database. Please try again."
      );
      setCoverUploading(false);
      return;
    }
    showToast(`Successfully launched "${eventTitle}"!`);

    // Clean up temporary preview object URL
    if (coverPreviewUrl && coverPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(coverPreviewUrl);
    }
    setSelectedCoverFile(null);
    setCoverPreviewUrl(null);
    setPersistedCoverUrl(null);
    setCoverUploadError(null);
    setCoverUploading(false);
    if (coverFileInputRef.current) {
      coverFileInputRef.current.value = "";
    }

    // Reset Form & Switch Tab
    setEventTitle("");
    setEventVenue("");
    setEventDesc("");
    const nextStart = defaultEventStart();
    setEventStartTime(toDatetimeLocalInput(nextStart));
    setEventEndTime(toDatetimeLocalInput(defaultEventEnd(nextStart)));
    setActiveTab("dashboard");
  };

  // Open modal to generate/customize link for an event
  const openCoverModalForEvent = (event: EventItem) => {
    setModalEventId(event.id);
    const existingConfig = event.coverUploadConfig;
    if (existingConfig) {
      setModalPassword(existingConfig.password || "");
      setModalAllowReplace(existingConfig.allowReplace ?? true);
      const url = getShareableCoverUploadUrl(event.id, existingConfig.token);
      setModalGeneratedUrl(url);
    } else {
      const newConfig = createCoverConfig();
      setModalPassword("");
      setModalAllowReplace(true);
      const url = getShareableCoverUploadUrl(event.id, newConfig.token);
      setModalGeneratedUrl(url);
    }
    setShowCoverModal(true);
  };

  // Generate or save link settings in modal
  const handleSaveCoverModalSettings = () => {
    if (!modalEventId) return;
    const targetEv = events.find(e => e.id === modalEventId);
    if (!targetEv) return;

    const newConfig = createCoverConfig({
      expiryHours: modalExpiryHours,
      password: modalPassword.trim() || null,
      allowReplace: modalAllowReplace
    });

    if (targetEv.coverUploadConfig?.hasCustomCover) {
      newConfig.hasCustomCover = true;
    }

    if (onUpdateEventCoverConfig) {
      onUpdateEventCoverConfig(modalEventId, newConfig);
    } else {
      targetEv.coverUploadConfig = newConfig;
    }

    const shareUrl = getShareableCoverUploadUrl(modalEventId, newConfig.token);
    setModalGeneratedUrl(shareUrl);
    showToast("Cover Photo Upload Link generated & updated!");
  };

  const copyToClipboard = (text: string, label: string = "Link") => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard!`);
  };

  const toggleCoverLinkDisabled = (event: EventItem) => {
    const currentConfig = event.coverUploadConfig || createCoverConfig();
    const updatedConfig: CoverUploadLinkConfig = {
      ...currentConfig,
      isDisabled: !currentConfig.isDisabled
    };

    if (onUpdateEventCoverConfig) {
      onUpdateEventCoverConfig(event.id, updatedConfig);
    } else {
      event.coverUploadConfig = updatedConfig;
    }

    showToast(updatedConfig.isDisabled ? "Upload Link Disabled" : "Upload Link Enabled");
  };

  const handleManualTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEventId || !manualName || !manualCategory) {
      alert("Please select event, category and attendee details.");
      return;
    }

    onIssueManualTicket({
      eventId: manualEventId,
      orderId: "ord_manual_" + Date.now(),
      categoryName: manualCategory,
      price: manualPrice,
      attendeeName: manualName,
      attendeePhone: manualPhone || "+91 00000 00000",
      attendeeEmail: manualEmail || "manual@offline.org",
      qrToken: "GP_MAN_" + Math.random().toString(36).substr(2, 9).toUpperCase()
    });

    showToast(`Offline Ticket Issued successfully to ${manualName}!`);
    setManualName("");
    setManualEmail("");
    setManualPhone("");
  };

  const exportCSV = (reportName: string) => {
    let headers = "ID,Name,Phone,Email,Status,Price\n";
    let rows = tickets.map(t => `${t.id},${t.attendeeName},${t.attendeePhone},${t.attendeeEmail},${t.status},₹${t.price}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", `${reportName}_reconciliation_${Date.now()}.csv`);
    a.click();
    showToast(`Exported report: ${reportName}`);
  };

  return (
    <div className="flex flex-col gap-6 font-sans animate-fadeIn" id="organizer-workspace-section">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-[#171719] text-white px-4 py-3 rounded-xl shadow-lg border border-primary/20 flex items-center gap-2 animate-bounce">
          <Sparkles className="w-5 h-5 text-status-warning" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header and Switcher Links */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-xl bg-white hover:bg-neutral-100 text-charcoal-dark border border-outline-variant/30 transition-all flex items-center justify-center">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <KineticHeading
              accent="Create the event."
              primary="GatePass handles access."
              size="md"
              lightMode={true}
            />
            <p className="text-sm text-on-surface-variant mt-1">
              Immersion suite to create events, reconcile manual sales, view live scan audits, and manage cover branding.
            </p>
          </div>
        </div>

        {/* Action Button to launch builder quickly */}
        {activeTab !== "builder" && (
          <AnimatedButton
            onClick={() => setActiveTab("builder")}
            className="!sm:w-auto !w-full !bg-primary !text-white !py-2.5 !px-4 !rounded-xl !text-xs !font-bold !uppercase !tracking-wider !border-primary [--shine:rgba(255,255,255,.66)]"
          >
            <Plus className="w-4 h-4 mr-2" />
            <span>Create Event</span>
          </AnimatedButton>
        )}
      </div>

      {/* Ribbon Navigator Toggles */}
      <div className="w-full bg-[#F8F5F2] p-1.5 rounded-2xl flex flex-wrap gap-1.5 border border-black/10 shadow-sm mb-7">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex-1 min-w-[120px] py-2 px-3 text-center rounded-xl font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "dashboard"
              ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
              : "text-[#625B57] hover:text-[#171719] font-semibold"
          }`}
        >
          Control Room (Live)
        </button>
        <button
          onClick={() => setActiveTab("builder")}
          className={`flex-1 min-w-[120px] py-2 px-3 text-center rounded-xl font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "builder"
              ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
              : "text-[#625B57] hover:text-[#171719] font-semibold"
          }`}
        >
          Event Builder
        </button>
        <button
          onClick={() => setActiveTab("manual")}
          className={`flex-1 min-w-[120px] py-2 px-3 text-center rounded-xl font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "manual"
              ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
              : "text-[#625B57] hover:text-[#171719] font-semibold"
          }`}
        >
          Manual/Cash Sales
        </button>
        <button
          onClick={() => setActiveTab("settlement")}
          className={`flex-1 min-w-[120px] py-2 px-3 text-center rounded-xl font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "settlement"
              ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
              : "text-[#625B57] hover:text-[#171719] font-semibold"
          }`}
        >
          Settlements &amp; Fees
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex-1 min-w-[120px] py-2 px-3 text-center rounded-xl font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "audit"
              ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
              : "text-[#625B57] hover:text-[#171719] font-semibold"
          }`}
        >
          Audit Ledger
        </button>
        <button
          onClick={() => setActiveTab("org")}
          className={`flex-1 min-w-[120px] py-2 px-3 text-center rounded-xl font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "org"
              ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
              : "text-[#625B57] hover:text-[#171719] font-semibold"
          }`}
        >
          Org &amp; Settings
        </button>
      </div>

      {/* Pane dashboard */}
      {activeTab === "dashboard" && (
        <div className="flex flex-col gap-8" id="dashboard-tab-content">
          {/* Bento live statistics cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* 1. Gross Sales Volume */}
            <div className="bg-[#F8F5F2] rounded-2xl p-6 border border-black/10 shadow-[0_8px_24px_rgba(49,40,36,0.05)] flex flex-col justify-between min-h-[135px]">
              <span className="text-[10px] font-black text-[#938C87] uppercase tracking-wider">Gross Sales Volume</span>
              <h3 className="text-3xl font-extrabold text-[#171719] my-2 tabular-nums flex items-center">
                ₹<AnimatedNumber value={totalSalesVolume} className="text-3xl font-extrabold tabular-nums" />
              </h3>
              <span className="text-[11px] text-[#625B57] font-medium">
                {orders.length} reservations
              </span>
            </div>

            {/* 2. Total Checked In / Used */}
            <div className="bg-[#F8F5F2] rounded-2xl p-6 border border-black/10 shadow-[0_8px_24px_rgba(49,40,36,0.05)] flex flex-col justify-between min-h-[135px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-[#938C87] uppercase tracking-wider">Checked In / Used</span>
                <CheckCircle2 className="w-4 h-4 text-[#55765F]" />
              </div>
              <h3 className="text-3xl font-extrabold text-[#55765F] my-1.5 tabular-nums flex items-center gap-1.5">
                <AnimatedNumber value={totalCheckedIn} className="text-3xl font-extrabold tabular-nums" />
                <span className="text-sm font-bold text-[#938C87]">/ {tickets.length}</span>
              </h3>
              <div className="w-full bg-[#171719]/10 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#55765F] h-full rounded-full transition-all"
                  style={{ width: `${tickets.length ? (totalCheckedIn / tickets.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* 3. Blocked Fraud Scans */}
            <div className="bg-[#F8F5F2] rounded-2xl p-6 border border-black/10 shadow-[0_8px_24px_rgba(49,40,36,0.05)] flex flex-col justify-between min-h-[135px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-[#938C87] uppercase tracking-wider">Blocked Fraud Scans</span>
                <AlertOctagon className="w-4 h-4 text-[#A34F4C]" />
              </div>
              <h3 className="text-3xl font-extrabold text-[#A34F4C] my-2 tabular-nums">
                <AnimatedNumber value={duplicateScanAttempts} className="text-3xl font-extrabold tabular-nums" />
              </h3>
              <span className="text-[11px] text-[#625B57] font-medium">
                Duplicate QR attempts blocked
              </span>
            </div>

            {/* 4. Cancellations / Refunds */}
            <div className="bg-[#F8F5F2] rounded-2xl p-6 border border-black/10 shadow-[0_8px_24px_rgba(49,40,36,0.05)] flex flex-col justify-between min-h-[135px]">
              <span className="text-[10px] font-black text-[#938C87] uppercase tracking-wider">Cancellations / Refunds</span>
              <h3 className="text-3xl font-extrabold text-[#171719] my-2 tabular-nums">
                <AnimatedNumber value={totalRefunded} className="text-3xl font-extrabold tabular-nums" />
              </h3>
              <span className="text-[11px] text-[#625B57] font-medium">
                Voided reservations
              </span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* FEATURE: EVENT COVER PHOTO & UPLOAD LINK MANAGEMENT DASHBOARD VIEW */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-3xl p-6 border border-outline-variant/30 shadow-sm flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/20 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-charcoal-dark uppercase tracking-tight">Event Cover Photo System</h3>
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Link Sharing Flow
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">
                  Send a link → Client uploads cover → Event automatically gets branded. No direct file uploading from dashboard.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (events.length > 0) openCoverModalForEvent(events[0]);
                }}
                className="px-4 py-2.5 bg-[#171719] hover:bg-[#292725] text-white rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Upload Link</span>
              </button>
            </div>

            {/* Event Cover Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {events.map((evt) => {
                const config = evt.coverUploadConfig || createCoverConfig();
                const shareableUrl = getShareableCoverUploadUrl(evt.id, config.token);
                const hasCover = Boolean(config.hasCustomCover || evt.bannerUrl.includes("/api/event-images?"));
                const isDisabled = config.isDisabled;

                return (
                  <div key={evt.id} className="bg-[#F8F5F2] rounded-2xl p-4 border border-black/10 shadow-sm flex flex-col justify-between gap-4">
                    {/* Cover Preview Box */}
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-black/10 border border-black/10">
                      <img src={evt.bannerUrl} alt={evt.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                        <div className="text-white">
                          <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 bg-white/20 backdrop-blur-md rounded text-white mb-1 inline-block">
                            {evt.eventType}
                          </span>
                          <h4 className="text-xs font-bold truncate max-w-[220px]">{evt.title}</h4>
                        </div>
                      </div>
                    </div>

                    {/* Status Indicator */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-black/5">
                      <span className="text-[10px] font-extrabold uppercase text-[#746D68]">Event Cover Status</span>
                      {isDisabled ? (
                        <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Link Disabled
                        </span>
                      ) : hasCover ? (
                        <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          ✓ Cover Added
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Link Active
                        </span>
                      )}
                    </div>

                    {/* Expiry & Protection Badge */}
                    <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-semibold">
                      <span className="px-2 py-0.5 rounded bg-white border border-black/10">
                        Expiry: {formatExpiryLabel(config.expiresAt)}
                      </span>
                      {config.password && (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Password
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openCoverModalForEvent(evt)}
                        className="py-2 px-3 bg-[#171719] hover:bg-[#292725] text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <LinkIcon className="w-3 h-3" />
                        <span>Generate Link</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copyToClipboard(shareableUrl, "Upload Link")}
                        className="py-2 px-3 bg-white hover:bg-neutral-100 text-[#171719] border border-black/15 rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Link</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleCoverLinkDisabled(evt)}
                        className={`py-2 px-3 rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer border ${
                          isDisabled
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                        }`}
                      >
                        {isDisabled ? "Enable Link" : "Disable Link"}
                      </button>

                      <button
                        type="button"
                        onClick={() => window.open(shareableUrl, "_blank")}
                        className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Replace Cover</span>
                      </button>

                      {hasCover && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`Remove the custom cover from "${evt.title}"?`)) return;
                            void onUpdateEventCover(evt.id, DEFAULT_EVENT_COVER_URL, {
                              hasCustomCover: false,
                              lastUpdated: new Date().toISOString(),
                            });
                          }}
                          className="col-span-2 py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove Cover</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Segmented Control for SubView */}
          <div className="flex bg-surface-container border border-outline-variant/20 p-1 rounded-xl w-full max-w-md my-1 self-start">
            <button
              onClick={() => setControlRoomSubView("stream")}
              className={`flex-1 py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${controlRoomSubView === "stream" ? "bg-charcoal-dark text-white shadow" : "text-outline hover:text-charcoal-dark"
                }`}
            >
              Live Check-In Monitor
            </button>
            <button
              onClick={() => setControlRoomSubView("analytics")}
              className={`flex-1 py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${controlRoomSubView === "analytics" ? "bg-primary text-white shadow" : "text-outline hover:text-charcoal-dark"
                }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-status-warning" />
              <span>Shotgun Community Analytics</span>
            </button>
          </div>

          {controlRoomSubView === "stream" ? (
            /* Live gate-wise scans stream */
            <div className="flex flex-col gap-6 animate-fadeIn">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Scans Stream */}
                <div className="lg:col-span-7 bg-white rounded-2xl p-5 shadow-sm border border-outline-variant/30">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-black text-charcoal-dark">Live Gate Scanning Stream</h3>
                    <span className="px-2.5 py-1 bg-status-success/10 rounded-full text-[10px] font-bold text-status-success animate-pulse uppercase tracking-wider">
                      ● Systems Online
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
                    {scanLogs.length === 0 ? (
                      <div className="py-12 text-center text-outline text-xs flex flex-col items-center gap-2">
                        <Clock className="w-8 h-8 text-outline/60" />
                        <span>Awaiting first scanner synchronization packet...</span>
                      </div>
                    ) : (
                      scanLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 text-xs ${log.scanResult === "VALID"
                              ? "bg-status-success/5 border-status-success/20"
                              : "bg-status-danger/5 border-status-danger/20"
                            }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-charcoal-dark">{log.attendeeName}</span>
                              <span className="text-outline">•</span>
                              <span className="text-[10px] font-mono text-outline font-semibold">{log.categoryName}</span>
                            </div>
                            <p className="text-[10px] text-on-surface-variant mt-1">
                              Event: {log.eventName} • Gate: {log.gateName} • Scanner: {log.scannedBy}
                            </p>
                          </div>

                          <div className="text-right">
                            <span className={`text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded ${log.scanResult === "VALID" ? "bg-status-success text-white" : "bg-status-danger text-white"
                              }`}>
                              {log.scanResult}
                            </span>
                            <p className="font-mono text-[9px] text-outline mt-1.5">{log.scanTime}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Reports and Payout controls */}
                <div className="lg:col-span-5 bg-white rounded-2xl p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
                  <h3 className="text-base font-black text-charcoal-dark">Reconciliation &amp; Exports</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    As required by the blueprint guidelines, GatePass provides immediate flat reconciliation exports to avoid excel-sheet manual errors.
                  </p>

                  <div className="flex flex-col gap-3 mt-2">
                    <button
                      onClick={() => exportCSV("Aura_Fest_2026")}
                      className="w-full py-3 bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 rounded-xl text-xs font-bold text-charcoal-dark uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-primary" />
                      <span>Download Attendance Reconciliation (.CSV)</span>
                    </button>

                    <button
                      onClick={() => exportCSV("Marathon_Run")}
                      className="w-full py-3 bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 rounded-xl text-xs font-bold text-charcoal-dark uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-primary" />
                      <span>Download Sales &amp; Platform Ledger (.CSV)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Pane Event Builder */}
      {activeTab === "builder" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30" id="builder-tab-content">
          <h3 className="text-base font-black text-charcoal-dark mb-1">Launch New Event Pass Tier</h3>
          <p className="text-xs text-on-surface-variant mb-6">
            GatePass creates custom cryptographically verifiable pass classes with secure validation hooks.
          </p>

          <form onSubmit={handleCreateEventSubmit} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Event Title Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. hack_campus winter 2026"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Pass Category Vibe</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold cursor-pointer outline-none"
                >
                  <option value="College Fest">College Cultural Fest</option>
                  <option value="Marathon">Sports Marathon / Run</option>
                  <option value="Workshop">Technical Workshop</option>
                  <option value="Open Mic">Local Standup Show</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Venue Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Auditorium Hall C"
                  value={eventVenue}
                  onChange={(e) => setEventVenue(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Total Safety Capacity</label>
                <input
                  type="number"
                  required
                  min={10}
                  value={eventCapacity}
                  onChange={(e) => setEventCapacity(Number(e.target.value))}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Entry Opens (Start)</label>
                <input
                  type="datetime-local"
                  required
                  value={eventStartTime}
                  onChange={(e) => setEventStartTime(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Entry Closes (End)</label>
                <input
                  type="datetime-local"
                  required
                  min={eventStartTime}
                  value={eventEndTime}
                  onChange={(e) => setEventEndTime(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-outline uppercase">Overview Details / Guidelines</label>
              <textarea
                rows={3}
                placeholder="Attendee entry requirements, safety checks, or refund criteria..."
                value={eventDesc}
                onChange={(e) => setEventDesc(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none resize-none"
              />
            </div>

            {/* EVENT COVER IMAGE UPLOADER & PREVIEW */}
            <div className="flex flex-col gap-2 p-5 rounded-2xl bg-[#F8F5F2] border border-black/10">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase text-[#171719] tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4" />
                    Event Cover Image
                  </h4>
                  <p className="text-[11px] text-[#746D68] mt-0.5">
                    Select a custom cover image or banner for your event (JPG, PNG, WebP up to 50 MB).
                  </p>
                </div>
                {coverPreviewUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveCover}
                    className="text-xs font-bold text-red-600 hover:text-red-800 uppercase tracking-wider cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Controlled Preview Box (Desktop: min(100%, 620px), 16:9 ratio) */}
              <div className="w-full flex flex-col items-center justify-center mt-2">
                {coverPreviewUrl ? (
                  <div
                    className="relative w-full rounded-2xl overflow-hidden border border-black/15 shadow-sm bg-neutral-900"
                    style={{
                      width: "min(100%, 620px)",
                      maxWidth: "620px",
                      aspectRatio: "16 / 9"
                    }}
                  >
                    <img
                      src={coverPreviewUrl}
                      alt="Cover Preview"
                      className="w-full h-full object-cover object-center"
                    />
                    <div className="absolute top-3 left-3 bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                      Preview (Not Yet Saved)
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => coverFileInputRef.current?.click()}
                    className="w-full cursor-pointer rounded-2xl border-2 border-dashed border-black/20 hover:border-black/40 p-6 bg-white/50 flex flex-col items-center justify-center text-center transition-colors"
                    style={{
                      width: "min(100%, 620px)",
                      maxWidth: "620px",
                      aspectRatio: "16 / 9"
                    }}
                  >
                    <div className="p-3 bg-[#171719] text-white rounded-2xl mb-3 shadow-md">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-[#171719] uppercase tracking-wider mb-1">
                      Click or drag cover image here
                    </p>
                    <p className="text-[11px] text-[#746D68]">
                      High resolution 16:9 landscape image recommended
                    </p>
                  </div>
                )}

                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverFileChange}
                  className="hidden"
                />

                {coverUploadError && (
                  <p className="text-xs font-bold text-red-600 mt-2 text-center">
                    {coverUploadError}
                  </p>
                )}
              </div>
            </div>

            {/* Custom Ticket Tiers */}
            <div className="border-t border-[#3F3632]/10 pt-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <h4 className="text-xs font-extrabold text-[#171719] uppercase tracking-wider">
                  Ticket Tiers &amp; Pricing Rules
                </h4>
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-1.5 bg-[#171719] hover:bg-[#292725] text-[#F8F5F2] rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Tier</span>
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                {categories.map((cat, idx) => (
                  <div key={idx} className="p-3 bg-[#F8F5F2] rounded-xl border border-black/10 flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      placeholder="Tier Name"
                      value={cat.name}
                      onChange={(e) => {
                        const updated = [...categories];
                        updated[idx].name = e.target.value;
                        setCategories(updated);
                      }}
                      className="flex-1 min-w-[120px] bg-white border border-black/10 rounded-lg p-2 text-xs font-bold text-[#171719]"
                    />
                    <div className="flex items-center gap-1 w-28">
                      <span className="text-xs font-bold text-[#746D68]">₹</span>
                      <input
                        type="number"
                        min={0}
                        value={cat.price}
                        onChange={(e) => {
                          const updated = [...categories];
                          updated[idx].price = Number(e.target.value);
                          setCategories(updated);
                        }}
                        className="w-full bg-white border border-black/10 rounded-lg p-2 text-xs font-bold text-[#171719]"
                      />
                    </div>
                    <div className="flex items-center gap-1 w-28">
                      <span className="text-[10px] font-bold text-[#746D68]">CAP</span>
                      <input
                        type="number"
                        min={1}
                        value={cat.capacity}
                        onChange={(e) => {
                          const updated = [...categories];
                          updated[idx].capacity = Number(e.target.value);
                          setCategories(updated);
                        }}
                        className="w-full bg-white border border-black/10 rounded-lg p-2 text-xs font-bold text-[#171719]"
                      />
                    </div>
                    {categories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(idx)}
                        className="p-2 text-status-danger hover:bg-status-danger/10 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <AnimatedButton
              type="submit"
              disabled={coverUploading}
              className="!w-full !bg-[#171719] !text-white !py-3.5 !rounded-xl !text-xs !font-bold !uppercase !tracking-wider mt-2 cursor-pointer"
            >
              <span>{coverUploading ? "Uploading & Saving Event..." : "Publish Event & Generate Cover Link"}</span>
            </AnimatedButton>
          </form>
        </div>
      )}

      {/* Pane Manual Sales */}
      {activeTab === "manual" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30">
          <h3 className="text-base font-black text-charcoal-dark mb-1">Issue Offline / Cash Entry Pass</h3>
          <p className="text-xs text-on-surface-variant mb-6">
            Log cash desk ticket purchases manually. Automatically deducts inventory and registers token on security terminals.
          </p>

          <form onSubmit={handleManualTicketSubmit} className="flex flex-col gap-4 max-w-xl">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-outline uppercase">Select Target Event</label>
              <select
                required
                value={manualEventId}
                onChange={(e) => setManualEventId(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold cursor-pointer outline-none"
              >
                <option value="">-- Choose Published Event --</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.venue})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Attendee Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Priyanshu Sharma"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Ticket Tier Category</label>
                <select
                  required
                  value={manualCategory}
                  onChange={(e) => {
                    setManualCategory(e.target.value);
                    const targetEv = events.find(ev => ev.id === manualEventId);
                    const cat = targetEv?.ticketCategories.find(c => c.name === e.target.value);
                    if (cat) setManualPrice(cat.price);
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold cursor-pointer outline-none"
                >
                  <option value="">-- Choose Category Tier --</option>
                  {manualEventId &&
                    events.find(e => e.id === manualEventId)?.ticketCategories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} — ₹{c.price}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Attendee Email (Optional)</label>
                <input
                  type="email"
                  placeholder="priyanshu@gmail.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Phone Number (SMS Alert)</label>
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none"
                />
              </div>
            </div>

            <AnimatedButton
              type="submit"
              className="!w-full !bg-primary !text-white !py-3 !rounded-xl !text-xs !font-bold !uppercase !tracking-wider mt-2 cursor-pointer"
            >
              <span>Confirm Cash Collection &amp; Issue QR Pass</span>
            </AnimatedButton>
          </form>
        </div>
      )}

      {/* Pane Settlements */}
      {activeTab === "settlement" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-6">
          <div>
            <h3 className="text-base font-black text-charcoal-dark">Financial Ledger &amp; Payout Settlements</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Net settlement breakdown computed after platform charges, payment gateway fees, and manual offline collections.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container border-b border-outline-variant/30 text-[10px] font-black text-outline uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Event Name</th>
                  <th className="py-3 px-4">Gross Sales</th>
                  <th className="py-3 px-4">Platform Fee (₹5/tkt)</th>
                  <th className="py-3 px-4">Cash Hand-Collected</th>
                  <th className="py-3 px-4">Net Payout Due</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 font-semibold text-charcoal-dark">
                {settlements.map((set) => (
                  <tr key={set.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3.5 px-4 font-bold">{set.eventName}</td>
                    <td className="py-3.5 px-4 font-mono">₹{set.grossSales}</td>
                    <td className="py-3.5 px-4 font-mono text-status-danger">-₹{set.platformFees}</td>
                    <td className="py-3.5 px-4 font-mono text-outline">₹{set.manualCollections}</td>
                    <td className="py-3.5 px-4 font-mono font-black text-primary text-sm">₹{set.netSettlement}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 bg-status-warning/10 text-status-warning rounded-full text-[10px] font-bold uppercase">
                        {set.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COVER PHOTO LINK GENERATION MODAL */}
      {showCoverModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#121218] border border-white/15 text-white max-w-lg w-full rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <LinkIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Generate Cover Upload Link</h3>
                  <p className="text-[11px] text-gray-400 font-semibold">Shareable link for client, manager, or designer</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCoverModal(false)}
                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Generated Link Field */}
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-2">
                Shareable Secure Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={modalGeneratedUrl}
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-xs font-mono text-indigo-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(modalGeneratedUrl, "Cover Upload Link")}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            {/* Security Options */}
            <div className="space-y-4 pt-2 border-t border-white/10">
              <h4 className="text-xs font-black uppercase text-gray-300 tracking-wider">Link Security Options</h4>

              {/* Expiry Selector */}
              <div>
                <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1">Expiration Duration</label>
                <select
                  value={modalExpiryHours ?? 0}
                  onChange={(e) => setModalExpiryHours(Number(e.target.value) === 0 ? null : Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs font-semibold text-white cursor-pointer outline-none"
                >
                  <option value={0}>Never Expire</option>
                  <option value={24}>24 Hours</option>
                  <option value={72}>3 Days (72 Hours)</option>
                  <option value={168}>7 Days</option>
                </select>
              </div>

              {/* Password Protection */}
              <div>
                <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1">Password Protection (Optional)</label>
                <input
                  type="text"
                  placeholder="Set optional password"
                  value={modalPassword}
                  onChange={(e) => setModalPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none"
                />
              </div>

              {/* Allow replace toggle */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-300 font-semibold">Allow replacing existing cover image</span>
                <input
                  type="checkbox"
                  checked={modalAllowReplace}
                  onChange={(e) => setModalAllowReplace(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Target Share Guidance */}
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-[11px] text-gray-300 space-y-1">
              <p className="font-bold text-white uppercase text-[10px]">Recipient Sharing Flow:</p>
              <p className="text-gray-400">Share this link directly with:</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-bold">Event Client</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-bold">Event Manager</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">Designer</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold">Marketing Team</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveCoverModalSettings}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                Save Security Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
