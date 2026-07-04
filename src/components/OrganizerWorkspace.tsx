import React, { useState } from "react";
import { EventItem, Order, Ticket, ScanLog, Settlement, AuditLog, TicketCategory, TicketStatus } from "../types";
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
  Award
} from "lucide-react";

interface OrganizerWorkspaceProps {
  events: EventItem[];
  orders: Order[];
  tickets: Ticket[];
  scanLogs: ScanLog[];
  settlements: Settlement[];
  auditLogs: AuditLog[];
  onAddNewEvent: (newEvent: EventItem) => void;
  onIssueManualTicket: (ticket: Omit<Ticket, "id" | "status" | "issuedAt">) => void;
  onProcessRefund: (ticketId: string) => void;
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
  onProcessRefund
}: OrganizerWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "builder" | "manual" | "settlement" | "audit" | "org">("dashboard");
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
  const [newMemberRole, setNewMemberRole] = useState("Scanner Staff");

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
  const [categories, setCategories] = useState<Array<{ name: string; price: number; capacity: number }>>([
    { name: "General Pass", price: 150, capacity: 400 },
    { name: "VIP Pass", price: 499, capacity: 100 }
  ]);

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

  const handleCreateEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventVenue.trim()) {
      alert("Please provide complete title and venue details.");
      return;
    }

    const newEventId = "ev_" + Date.now();
    const formattedCategories: TicketCategory[] = categories.map((cat, idx) => ({
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
      startTime: "2026-07-06T10:00",
      endTime: "2026-07-06T18:00",
      bannerUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=80",
      capacity: eventCapacity,
      ticketCategories: formattedCategories
    };

    onAddNewEvent(newEvent);
    showToast(`Successfully launched "${eventTitle}" event!`);
    
    // Reset Form & Switch Tab
    setEventTitle("");
    setEventVenue("");
    setEventDesc("");
    setActiveTab("dashboard");
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
        <div className="fixed top-20 right-4 z-50 bg-charcoal-dark text-white px-4 py-3 rounded-xl shadow-lg border border-primary/20 flex items-center gap-2 animate-bounce">
          <Sparkles className="w-5 h-5 text-status-warning" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header and Switcher Links */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-charcoal-dark tracking-tight">GatePass Organizer Console</h2>
          <p className="text-sm text-on-surface-variant">
            Immersion suite to create events, reconcile manual sales, view live scan audits, and track settlements.
          </p>
        </div>

        {/* Action Button to launch builder quickly */}
        {activeTab !== "builder" && (
          <button
            onClick={() => setActiveTab("builder")}
            className="sm:w-auto w-full bg-primary hover:bg-opacity-95 text-white py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Event</span>
          </button>
        )}
      </div>

      {/* Ribbon Navigator Toggles */}
      <div className="w-full bg-white/70 p-1.5 rounded-xl flex flex-wrap gap-1 border border-outline-variant/30">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex-1 min-w-[120px] py-2 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "dashboard" ? "bg-charcoal-dark text-white shadow" : "text-on-surface-variant hover:text-charcoal-dark"
          }`}
        >
          Control Room (Live)
        </button>
        <button
          onClick={() => setActiveTab("builder")}
          className={`flex-1 min-w-[120px] py-2 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "builder" ? "bg-charcoal-dark text-white shadow" : "text-on-surface-variant hover:text-charcoal-dark"
          }`}
        >
          Event Builder
        </button>
        <button
          onClick={() => setActiveTab("manual")}
          className={`flex-1 min-w-[120px] py-2 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "manual" ? "bg-charcoal-dark text-white shadow" : "text-on-surface-variant hover:text-charcoal-dark"
          }`}
        >
          Manual/Cash Sales
        </button>
        <button
          onClick={() => setActiveTab("settlement")}
          className={`flex-1 min-w-[120px] py-2 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "settlement" ? "bg-charcoal-dark text-white shadow" : "text-on-surface-variant hover:text-charcoal-dark"
          }`}
        >
          Settlements &amp; Fees
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex-1 min-w-[120px] py-2 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "audit" ? "bg-charcoal-dark text-white shadow" : "text-on-surface-variant hover:text-charcoal-dark"
          }`}
        >
          Audit Ledger
        </button>
        <button
          onClick={() => setActiveTab("org")}
          className={`flex-1 min-w-[120px] py-2 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "org" ? "bg-charcoal-dark text-white shadow" : "text-on-surface-variant hover:text-charcoal-dark"
          }`}
        >
          Org &amp; Settings
        </button>
      </div>

      {/* Pane dashboard */}
      {activeTab === "dashboard" && (
        <div className="flex flex-col gap-6" id="dashboard-tab-content">
          {/* Bento live statistics cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Sales Volume */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">Gross Sales Volume</span>
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-2xl font-black text-charcoal-dark">₹{totalSalesVolume.toLocaleString()}</h3>
              <span className="text-[10px] text-outline font-medium mt-2 flex items-center gap-1">
                From {orders.length} digital/manual reservations
              </span>
            </div>

            {/* Total Checked In */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">Checked In / Used</span>
                <ShieldCheck className="w-4 h-4 text-status-success" />
              </div>
              <h3 className="text-2xl font-black text-status-success">
                {totalCheckedIn} <span className="text-sm font-semibold text-outline">/ {tickets.length}</span>
              </h3>
              {/* Progress bar */}
              <div className="w-full bg-surface-container h-1.5 rounded-full mt-2 overflow-hidden">
                <div 
                  className="bg-status-success h-full rounded-full transition-all" 
                  style={{ width: `${tickets.length ? (totalCheckedIn / tickets.length) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {/* Duplicate Scan Attempts */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-status-danger uppercase tracking-wider">Blocked Fraud Scans</span>
                <AlertOctagon className="w-4 h-4 text-status-danger" />
              </div>
              <h3 className="text-2xl font-black text-status-danger">{duplicateScanAttempts}</h3>
              <span className="text-[10px] text-status-danger font-medium mt-2 flex items-center gap-1">
                Same-QR duplicated screenshots blocked
              </span>
            </div>

            {/* Refunded Count */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/30 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">Cancellations / Refunds</span>
                <Users className="w-4 h-4 text-outline" />
              </div>
              <h3 className="text-2xl font-black text-charcoal-dark">{totalRefunded}</h3>
              <span className="text-[10px] text-outline font-medium mt-2">
                Voided from database instantly
              </span>
            </div>
          </div>

          {/* Segmented Control for SubView */}
          <div className="flex bg-surface-container border border-outline-variant/20 p-1 rounded-xl w-full max-w-md my-1 self-start">
            <button
              onClick={() => setControlRoomSubView("stream")}
              className={`flex-1 py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                controlRoomSubView === "stream" ? "bg-charcoal-dark text-white shadow" : "text-outline hover:text-charcoal-dark"
              }`}
            >
              Live Check-In Monitor
            </button>
            <button
              onClick={() => setControlRoomSubView("analytics")}
              className={`flex-1 py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                controlRoomSubView === "analytics" ? "bg-primary text-white shadow" : "text-outline hover:text-charcoal-dark"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-status-warning" />
              <span>Shotgun Community Analytics</span>
            </button>
          </div>

          {controlRoomSubView === "stream" ? (
            /* Live gate-wise scans stream */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
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
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 text-xs ${
                          log.scanResult === "VALID" 
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
                          <span className={`text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded ${
                            log.scanResult === "VALID" ? "bg-status-success text-white" : "bg-status-danger text-white"
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

                {/* Hardening & Refund Test */}
                <div className="mt-4 pt-4 border-t border-surface-container flex flex-col gap-2">
                  <h4 className="text-xs font-bold text-charcoal-dark uppercase tracking-wider">Gate Security Simulator</h4>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Test the refund invalidate protection! Voiding a ticket immediately flags it at the mobile scanner gate.
                  </p>

                  <div className="flex flex-col gap-2 mt-1">
                    {tickets.filter(t => t.status === TicketStatus.ISSUED).slice(0, 1).map(ticket => (
                      <button
                        key={ticket.id}
                        onClick={() => {
                          onProcessRefund(ticket.id);
                          showToast(`Refund processed! ${ticket.attendeeName}'s QR token has been blacklisted.`);
                        }}
                        className="w-full py-2 bg-status-danger/10 text-status-danger border border-status-danger/20 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-status-danger/20 transition-all cursor-pointer text-center"
                      >
                        Process Refund / Void QR for {ticket.attendeeName}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Shotgun Community Analytics Overview View */
            <div className="flex flex-col gap-6 animate-fadeIn" id="shotgun-community-analytics">
              
              {/* Header Info Area */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-5 rounded-2xl border border-outline-variant/30 gap-4">
                <div>
                  <h3 className="text-base font-black text-charcoal-dark uppercase tracking-tight flex items-center gap-1.5">
                    <span>Overview</span>
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    How does people who attended this event has evolved?
                  </p>
                </div>

                {/* Explore Event dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-outline">Explore by event</span>
                  <select
                    value={exploreEventId}
                    onChange={(e) => setExploreEventId(e.target.value)}
                    className="bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2 text-xs font-bold text-charcoal-dark cursor-pointer outline-none"
                  >
                    <option value="all">All Active Events</option>
                    <option value="ev4">Rock En Seine</option>
                    <option value="ev5">We Love Green</option>
                    <option value="ev6">Afterlife Roman Ruins</option>
                  </select>
                </div>
              </div>

              {/* Statistics indicators (4 Column Grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {/* Total Contacts */}
                <div className="bg-white rounded-2xl p-5 border border-outline-variant/30 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-on-surface-variant tracking-wider">
                    <span>Total contacts</span>
                    <Info className="w-3.5 h-3.5 text-outline/60" />
                  </div>
                  <h4 className="text-3xl font-black text-charcoal-dark mt-3">
                    {exploreEventId === "all" ? "1,099" : exploreEventId === "ev4" ? "480" : exploreEventId === "ev5" ? "398" : "221"}
                  </h4>
                  <span className="text-[9px] text-status-success font-semibold mt-1">● Active list size</span>
                </div>

                {/* Followers */}
                <div className="bg-white rounded-2xl p-5 border border-outline-variant/30 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-on-surface-variant tracking-wider">
                    <span>Followers on Shotgun</span>
                    <Info className="w-3.5 h-3.5 text-outline/60" />
                  </div>
                  <h4 className="text-3xl font-black text-charcoal-dark mt-3">
                    {exploreEventId === "all" ? "321" : exploreEventId === "ev4" ? "150" : exploreEventId === "ev5" ? "111" : "60"}
                  </h4>
                  <span className="text-[9px] text-primary font-semibold mt-1">● Direct app followers</span>
                </div>

                {/* Email Subscribers */}
                <div className="bg-white rounded-2xl p-5 border border-outline-variant/30 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-on-surface-variant tracking-wider">
                    <span>Email subscribers</span>
                    <Info className="w-3.5 h-3.5 text-outline/60" />
                  </div>
                  <h4 className="text-3xl font-black text-charcoal-dark mt-3">
                    {exploreEventId === "all" ? "198" : exploreEventId === "ev4" ? "90" : exploreEventId === "ev5" ? "73" : "35"}
                  </h4>
                  <span className="text-[9px] text-outline font-semibold mt-1">● Campaign subscribers</span>
                </div>

                {/* Push Subscribers */}
                <div className="bg-white rounded-2xl p-5 border border-outline-variant/30 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-on-surface-variant tracking-wider">
                    <span>Push subscribers</span>
                    <Info className="w-3.5 h-3.5 text-outline/60" />
                  </div>
                  <h4 className="text-3xl font-black text-charcoal-dark mt-3">
                    {exploreEventId === "all" ? "92" : exploreEventId === "ev4" ? "40" : exploreEventId === "ev5" ? "34" : "18"}
                  </h4>
                  <span className="text-[9px] text-status-warning font-semibold mt-1">● Push alerts active</span>
                </div>
              </div>

              {/* Advanced Graphs/Tables Grid (2 columns) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Left Card: Event attendance with beautiful Donut concentric SVG loops */}
                <div className="md:col-span-5 bg-white rounded-2xl p-5 border border-outline-variant/30 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase tracking-wider text-charcoal-dark">Event attendance</h4>
                      <Info className="w-3.5 h-3.5 text-outline/60" />
                    </div>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Contacts who attended this event attend <strong className="text-charcoal-dark">1,5 events</strong> on average.
                    </p>
                  </div>

                  {/* Concentric rings SVG Donut Chart */}
                  <div className="relative w-44 h-44 mx-auto my-6 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                      {/* Ring 1: 1 event (Green) */}
                      <circle
                        cx="60"
                        cy="60"
                        r="45"
                        fill="transparent"
                        stroke="#e2e8f0"
                        strokeWidth="12"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="45"
                        fill="transparent"
                        stroke="#10b981"
                        strokeWidth="12"
                        strokeDasharray="282.7"
                        strokeDashoffset={282.7 - (282.7 * 62) / 100}
                        strokeLinecap="round"
                      />

                      {/* Ring 2: 2 events (Blue) */}
                      <circle
                        cx="60"
                        cy="60"
                        r="32"
                        fill="transparent"
                        stroke="#e2e8f0"
                        strokeWidth="10"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="32"
                        fill="transparent"
                        stroke="#3b82f6"
                        strokeWidth="10"
                        strokeDasharray="201"
                        strokeDashoffset={201 - (201 * 22) / 100}
                        strokeLinecap="round"
                      />

                      {/* Ring 3: 3 events (Pink) */}
                      <circle
                        cx="60"
                        cy="60"
                        r="20"
                        fill="transparent"
                        stroke="#e2e8f0"
                        strokeWidth="8"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="20"
                        fill="transparent"
                        stroke="#f43f5e"
                        strokeWidth="8"
                        strokeDasharray="125.6"
                        strokeDashoffset={125.6 - (125.6 * 8) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                    
                    {/* Centered value overlay */}
                    <div className="absolute flex flex-col items-center">
                      <span className="text-2xl font-black text-charcoal-dark leading-none">1,5</span>
                      <span className="text-[9px] font-bold text-outline uppercase tracking-wider">Avg events</span>
                    </div>
                  </div>

                  {/* Colored legends */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-on-surface-variant font-bold pt-3 border-t border-surface-container">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
                      <span>1 event: <strong>62%</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span>
                      <span>2 events: <strong>22%</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e]"></span>
                      <span>3 events: <strong>8%</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24]"></span>
                      <span>4 events: <strong>4%</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#6366f1]"></span>
                      <span>5+ events: <strong>2%</strong></span>
                    </div>
                  </div>
                </div>

                {/* Right Card: Time since last purchase */}
                <div className="md:col-span-7 bg-white rounded-2xl p-5 border border-outline-variant/30 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase tracking-wider text-charcoal-dark">Time since last purchase</h4>
                      <Info className="w-3.5 h-3.5 text-outline/60" />
                    </div>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Historical retention matrix mapping repeat purchasers on the platform.
                    </p>
                  </div>

                  {/* Beautiful structured table */}
                  <div className="flex flex-col gap-3.5 my-4">
                    
                    {/* Row 1: < 3 months */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] font-bold text-charcoal-dark">
                        <span>&lt; 3 months</span>
                        <span>3,741 contacts (37%)</span>
                      </div>
                      <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                        <div className="bg-primary h-full rounded-full" style={{ width: "37%" }} />
                      </div>
                    </div>

                    {/* Row 2: 3 to 6 months */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] font-bold text-charcoal-dark">
                        <span>3 to 6 months</span>
                        <span>5,201 contacts (50%)</span>
                      </div>
                      <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                        <div className="bg-primary h-full rounded-full" style={{ width: "50%" }} />
                      </div>
                    </div>

                    {/* Row 3: 6 to 12 months */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] font-bold text-charcoal-dark">
                        <span>6 to 12 months</span>
                        <span>1,954 contacts (19%)</span>
                      </div>
                      <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                        <div className="bg-primary h-full rounded-full" style={{ width: "19%" }} />
                      </div>
                    </div>

                    {/* Row 4: 12 to 24 months */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] font-bold text-charcoal-dark">
                        <span>12 to 24 months</span>
                        <span>1,227 contacts (12%)</span>
                      </div>
                      <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                        <div className="bg-primary h-full rounded-full" style={{ width: "12%" }} />
                      </div>
                    </div>

                    {/* Row 5: > 24 months */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px] font-bold text-charcoal-dark">
                        <span>&gt; 24 months</span>
                        <span>1,227 contacts (12%)</span>
                      </div>
                      <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                        <div className="bg-primary h-full rounded-full" style={{ width: "12%" }} />
                      </div>
                    </div>

                  </div>

                  <div className="text-[10px] text-outline text-right font-medium">
                    * Data computed live from connected Shotgun tracking hooks
                  </div>

                </div>

              </div>

            </div>
          )}
        </div>
      )}

      {/* Pane Event Builder (Module 2) */}
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

            {/* Custom Ticket Tiers */}
            <div className="border-t border-surface-container pt-4 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-extrabold text-charcoal-dark uppercase tracking-wide">Ticket Category Ranges</h4>
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-2.5 py-1 bg-primary/10 text-primary rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add Tier
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {categories.map((cat, index) => (
                  <div key={index} className="flex gap-3 items-center bg-surface-container-low p-3 rounded-lg border border-outline-variant/15">
                    <input
                      type="text"
                      value={cat.name}
                      onChange={(e) => {
                        const newCats = [...categories];
                        newCats[index].name = e.target.value;
                        setCategories(newCats);
                      }}
                      placeholder="Category Name"
                      className="flex-3 bg-white border border-outline-variant rounded p-1.5 text-xs text-charcoal-dark font-semibold outline-none"
                    />
                    <div className="flex-1 flex items-center gap-1 bg-white border border-outline-variant rounded p-1.5 text-xs">
                      <span className="text-outline">₹</span>
                      <input
                        type="number"
                        value={cat.price}
                        onChange={(e) => {
                          const newCats = [...categories];
                          newCats[index].price = Number(e.target.value);
                          setCategories(newCats);
                        }}
                        className="w-full bg-transparent border-none p-0 outline-none font-semibold text-charcoal-dark text-right"
                      />
                    </div>
                    <input
                      type="number"
                      value={cat.capacity}
                      onChange={(e) => {
                        const newCats = [...categories];
                        newCats[index].capacity = Number(e.target.value);
                        setCategories(newCats);
                      }}
                      className="flex-1 bg-white border border-outline-variant rounded p-1.5 text-xs text-charcoal-dark font-semibold outline-none text-center"
                    />
                    {categories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(index)}
                        className="text-status-danger p-1 hover:bg-status-danger/10 rounded transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-primary hover:bg-opacity-95 text-white text-xs font-bold tracking-widest uppercase rounded-xl shadow-lg mt-3 cursor-pointer"
            >
              Launch Event Pass Block
            </button>
          </form>
        </div>
      )}

      {/* Pane Manual Tickets (Module 4 Flow E) */}
      {activeTab === "manual" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-5" id="manual-tab-content">
          <div>
            <h3 className="text-base font-black text-charcoal-dark mb-1">Log Cash / Offline Sales</h3>
            <p className="text-xs text-on-surface-variant">
              Mandatory module to log manual ticket cash collections directly into immutable database tracking. Prevents leakage.
            </p>
          </div>

          <form onSubmit={handleManualTicketSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Select Target Event</label>
                <select
                  required
                  value={manualEventId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setManualEventId(id);
                    const selectedEv = events.find(ev => ev.id === id);
                    if (selectedEv && selectedEv.ticketCategories.length > 0) {
                      setManualCategory(selectedEv.ticketCategories[0].name);
                      setManualPrice(selectedEv.ticketCategories[0].price);
                    }
                  }}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none cursor-pointer"
                >
                  <option value="">-- Choose Event --</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
              </div>

              {manualEventId && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-outline uppercase">Choose Category Tier</label>
                  <select
                    required
                    value={manualCategory}
                    onChange={(e) => {
                      const name = e.target.value;
                      setManualCategory(name);
                      const ev = events.find(ev => ev.id === manualEventId);
                      const cat = ev?.ticketCategories.find(c => c.name === name);
                      if (cat) setManualPrice(cat.price);
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-charcoal-dark font-semibold outline-none cursor-pointer"
                  >
                    {events.find(ev => ev.id === manualEventId)?.ticketCategories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name} (₹{cat.price})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Attendee Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Singh"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-charcoal-dark font-semibold outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Contact Mobile Number</label>
                <input
                  type="text"
                  placeholder="e.g. +91 99999 12345"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-charcoal-dark font-semibold outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-outline uppercase">Contact Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. ramesh@gmail.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-charcoal-dark font-semibold outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-charcoal-dark hover:bg-opacity-95 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow cursor-pointer mt-2"
            >
              Generate &amp; Register Cash Ticket (Issues QR Code)
            </button>
          </form>
        </div>
      )}

      {/* Pane Settlement Clarity (Module 4) */}
      {activeTab === "settlement" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4" id="settlement-tab-content">
          <div>
            <h3 className="text-base font-black text-charcoal-dark mb-1">Settlement &amp; Fees Ledger</h3>
            <p className="text-xs text-on-surface-variant">
              Full breakdown of gross sales, gateway processing charges, flat GatePass platform fee (₹5/paid ticket), and final payout parameters.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30 text-on-surface-variant font-bold text-[10px] tracking-wider uppercase">
                  <th className="p-3">Event Title</th>
                  <th className="p-3 text-right">Gross Sales</th>
                  <th className="p-3 text-right">Gateway (2.5%)</th>
                  <th className="p-3 text-right">GP Platform (₹5)</th>
                  <th className="p-3 text-right">Manual / Cash</th>
                  <th className="p-3 text-right">Net Payable</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {settlements.map((set) => (
                  <tr key={set.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="p-3 font-extrabold text-charcoal-dark">{set.eventName}</td>
                    <td className="p-3 text-right font-semibold">₹{set.grossSales.toLocaleString()}</td>
                    <td className="p-3 text-right text-on-surface-variant">₹{set.gatewayFees.toLocaleString()}</td>
                    <td className="p-3 text-right text-on-surface-variant">₹{set.platformFees.toLocaleString()}</td>
                    <td className="p-3 text-right text-on-surface-variant">₹{set.manualCollections.toLocaleString()}</td>
                    <td className="p-3 text-right font-black text-primary">₹{set.netSettlement.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <span className={`text-[9px] font-black tracking-wider uppercase px-2 py-1 rounded-full ${
                        set.status === "settled" 
                          ? "bg-status-success text-white" 
                          : set.status === "processing"
                          ? "bg-status-warning text-white"
                          : "bg-status-inactive text-white"
                      }`}>
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

      {/* Pane Audit Ledger (Module 8 Audit Logs) */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4" id="audit-tab-content">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-charcoal-dark mb-1">Immutable Workspace Audit Ledger</h3>
              <p className="text-xs text-on-surface-variant">
                Immutable security logs tracking administrative role actions, ticket issues, voids, and validation pings.
              </p>
            </div>
            <Award className="w-8 h-8 text-primary" />
          </div>

          <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-charcoal-dark">{log.action}</span>
                    <span className="text-outline">•</span>
                    <span className="text-[10px] font-bold text-primary">{log.actor}</span>
                  </div>
                  <p className="text-on-surface-variant mt-1 leading-relaxed text-[11px]">{log.details}</p>
                </div>
                <div className="text-[10px] font-mono text-outline whitespace-nowrap self-end sm:self-center">
                  {log.timestamp}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pane Org Settings (Module 1 Organizer Workspace) */}
      {activeTab === "org" && (
        <div className="flex flex-col gap-6 animate-fadeIn" id="org-tab-content">
          {/* Org Profile & Payout Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Org Profile card */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-black text-charcoal-dark mb-1">Organization Profile</h3>
                <p className="text-xs text-on-surface-variant">Configure standard workspace parameters for institutional verification.</p>
              </div>
              
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-outline uppercase">Organization Name</label>
                  <input 
                    type="text" 
                    value={orgName} 
                    onChange={(e) => setOrgName(e.target.value)} 
                    className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                  />
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-outline uppercase">Workspace Type</label>
                  <input 
                    type="text" 
                    value={orgType} 
                    onChange={(e) => setOrgType(e.target.value)} 
                    className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-outline uppercase">Contact Email</label>
                    <input 
                      type="email" 
                      value={orgEmail} 
                      onChange={(e) => setOrgEmail(e.target.value)} 
                      className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-outline uppercase">Support Phone</label>
                    <input 
                      type="text" 
                      value={orgPhone} 
                      onChange={(e) => setOrgPhone(e.target.value)} 
                      className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                    />
                  </div>
                </div>
                
                <button 
                  onClick={() => showToast("Organization Profile settings updated!")}
                  className="mt-2 w-full py-2.5 bg-primary hover:bg-opacity-95 text-white text-xs font-bold tracking-wider uppercase transition-all rounded cursor-pointer"
                >
                  Save Profile Settings
                </button>
              </div>
            </div>

            {/* Payout Configurations card */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-black text-charcoal-dark mb-1">Payout &amp; Settlement Settings</h3>
                <p className="text-xs text-on-surface-variant">Add bank or UPI targets for ticket revenues. 100% transparent fee structure.</p>
              </div>
              
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-outline uppercase">Settlement Bank Name</label>
                  <input 
                    type="text" 
                    value={payoutBank} 
                    onChange={(e) => setPayoutBank(e.target.value)} 
                    className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-outline uppercase">IFSC Code</label>
                    <input 
                      type="text" 
                      value={payoutIFSC} 
                      onChange={(e) => setPayoutIFSC(e.target.value)} 
                      className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-outline uppercase">Account Number</label>
                    <input 
                      type="text" 
                      value={payoutAcc} 
                      onChange={(e) => setPayoutAcc(e.target.value)} 
                      className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-outline uppercase">UPI ID / Address</label>
                    <input 
                      type="text" 
                      value={payoutUPI} 
                      onChange={(e) => setPayoutUPI(e.target.value)} 
                      className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-outline uppercase">Payout Cycle</label>
                    <select 
                      value={payoutSchedule} 
                      onChange={(e) => setPayoutSchedule(e.target.value)} 
                      className="p-2 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded cursor-pointer outline-none"
                    >
                      <option value="Daily after gate-reconciliation">Daily gate-reconciliation</option>
                      <option value="Weekly (Every Friday)">Weekly (Every Friday)</option>
                      <option value="Monthly Cycle">Monthly Cycle</option>
                    </select>
                  </div>
                </div>
                
                <button 
                  onClick={() => showToast("Financial Settlement Accounts updated!")}
                  className="mt-2 w-full py-2.5 bg-primary hover:bg-opacity-95 text-white text-xs font-bold tracking-wider uppercase transition-all rounded cursor-pointer"
                >
                  Save Payout Credentials
                </button>
              </div>
            </div>

          </div>

          {/* Team Roles and Permissions Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* List members */}
            <div className="lg:col-span-7 bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-black text-charcoal-dark mb-1">Team Members &amp; Permission Roles</h3>
                <p className="text-xs text-on-surface-variant">School / College fests require team coordination. Assign scanning and gate roles.</p>
              </div>
              
              <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
                {teamMembers.map(member => (
                  <div key={member.id} className="p-3 bg-surface-container-low border border-outline-variant/15 flex justify-between items-center text-xs rounded-lg">
                    <div>
                      <p className="font-extrabold text-charcoal-dark">{member.name}</p>
                      <p className="text-[10px] text-outline mt-0.5">{member.email}</p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <select 
                        value={member.role}
                        onChange={(e) => {
                          const updated = teamMembers.map(m => m.id === member.id ? { ...m, role: e.target.value } : m);
                          setTeamMembers(updated);
                          showToast(`Updated ${member.name} role to ${e.target.value}!`);
                        }}
                        className="p-1 text-[10px] font-bold bg-white text-charcoal-dark border border-outline-variant rounded cursor-pointer outline-none"
                      >
                        <option value="Owner">Owner</option>
                        <option value="Event Manager">Event Manager</option>
                        <option value="Finance Manager">Finance Manager</option>
                        <option value="Gate Staff">Gate Staff</option>
                        <option value="Scanner Staff">Scanner Staff</option>
                        <option value="Volunteer">Volunteer</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                      
                      <button 
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-status-danger p-1 hover:bg-status-danger/10 rounded transition-all cursor-pointer"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Invite new member form */}
            <div className="lg:col-span-5 bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-black text-charcoal-dark mb-1">Invite New Admin Member</h3>
                <p className="text-xs text-on-surface-variant">Add volunteers or staff to scan at ticket check-in portals.</p>
              </div>

              <form onSubmit={handleAddTeamMember} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-outline uppercase">Member Full Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={newMemberName} 
                    onChange={(e) => setNewMemberName(e.target.value)} 
                    className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                  />
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-outline uppercase">Member Email</label>
                  <input 
                    type="email" 
                    required
                    placeholder="ramesh@dtu.ac.in"
                    value={newMemberEmail} 
                    onChange={(e) => setNewMemberEmail(e.target.value)} 
                    className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-outline uppercase">Default Permission Role</label>
                  <select 
                    value={newMemberRole} 
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="p-2 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded cursor-pointer outline-none"
                  >
                    <option value="Event Manager">Event Manager</option>
                    <option value="Finance Manager">Finance Manager</option>
                    <option value="Gate Staff">Gate Staff</option>
                    <option value="Scanner Staff">Scanner Staff</option>
                    <option value="Volunteer">Volunteer</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </div>
                
                <button 
                  type="submit"
                  className="mt-2 w-full py-2.5 bg-charcoal-dark hover:bg-opacity-95 text-white text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 rounded cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>Invite &amp; Grant Access</span>
                </button>
              </form>
            </div>

          </div>

          {/* Branding Settings Customizer Row */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/30 flex flex-col gap-4">
            <div>
              <h3 className="text-base font-black text-charcoal-dark mb-1">Branding &amp; Ticket Personalization</h3>
              <p className="text-xs text-on-surface-variant">Format client-side parameters on issued ticket categories, banners, and digital email frames.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-outline uppercase">Corporate Brand Color (Primary HEX)</label>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={brandingColor} 
                    onChange={(e) => setBrandingColor(e.target.value)} 
                    className="w-10 h-10 border border-outline-variant rounded cursor-pointer outline-none"
                  />
                  <input 
                    type="text" 
                    value={brandingColor} 
                    onChange={(e) => setBrandingColor(e.target.value)} 
                    className="p-2.5 text-xs text-charcoal-dark font-mono font-bold bg-surface-container-low flex-1 border border-outline-variant rounded outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-outline uppercase">Issued Ticket Header Warning Text</label>
                <input 
                  type="text" 
                  value={ticketHeader} 
                  onChange={(e) => setTicketHeader(e.target.value)} 
                  className="p-2.5 text-xs text-charcoal-dark font-bold bg-surface-container-low border border-outline-variant rounded outline-none"
                />
              </div>
            </div>
            
            <button 
              onClick={() => showToast("Branding settings saved successfully!")}
              className="mt-2 w-max px-6 py-2.5 bg-primary hover:bg-opacity-95 text-white text-xs font-bold tracking-wider uppercase transition-all rounded cursor-pointer self-end"
            >
              Update Brand Parameters
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
