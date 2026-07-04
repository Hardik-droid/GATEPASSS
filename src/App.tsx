import React, { useState, useEffect } from "react";
import { 
  getOrCreateStore, 
  saveStore,
  INITIAL_USER,
  INITIAL_ACCESS_REQUESTS,
  INITIAL_INVITE_PASSES,
  INITIAL_EVENTS,
  INITIAL_ORDERS,
  INITIAL_TICKETS,
  INITIAL_SCAN_LOGS,
  INITIAL_SETTLEMENTS,
  INITIAL_AUDIT_LOGS
} from "./mockData";
import { 
  UserProfile, 
  AccessRequest, 
  InvitePass, 
  EventItem, 
  Order, 
  Ticket, 
  ScanLog, 
  Settlement, 
  AuditLog, 
  TicketStatus,
  UserRole
} from "./types";
import IdentityCard from "./components/IdentityCard";
import RequestAccessForm from "./components/RequestAccessForm";
import ApprovalsInvites from "./components/ApprovalsInvites";
import WalletSync from "./components/WalletSync";
import QRScannerSimulation from "./components/QRScannerSimulation";
import OrganizerWorkspace from "./components/OrganizerWorkspace";
import AttendeeEventsList from "./components/AttendeeEventsList";
import { 
  Fingerprint, 
  IdCard, 
  Bell, 
  ShieldCheck, 
  Smartphone, 
  Settings, 
  Sliders, 
  Menu, 
  X, 
  Calendar, 
  TrendingUp, 
  Award, 
  Shield, 
  SlidersHorizontal,
  ChevronRight,
  Sparkles,
  Info,
  Ticket as TicketIcon
} from "lucide-react";

export default function App() {
  // Perspectives
  const [perspective, setPerspective] = useState<"attendee" | "organizer">("attendee");

  // Nav states
  const [attendeeSection, setAttendeeSection] = useState<"home" | "request" | "approvals" | "wallet" | "events">("home");
  const [organizerSection, setOrganizerSection] = useState<"workspace" | "scanner">("workspace");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Database states
  const [user, setUser] = useState<UserProfile>(INITIAL_USER);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [invitePasses, setInvitePasses] = useState<InvitePass[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Selected pass for Wallet details
  const [selectedWalletPass, setSelectedWalletPass] = useState<InvitePass | undefined>(undefined);

  // Load from LocalStorage on mount
  useEffect(() => {
    setUser(getOrCreateStore("gps_user", INITIAL_USER));
    setRequests(getOrCreateStore("gps_requests", INITIAL_ACCESS_REQUESTS));
    setInvitePasses(getOrCreateStore("gps_invites", INITIAL_INVITE_PASSES));
    setEvents(getOrCreateStore("gps_events", INITIAL_EVENTS));
    setOrders(getOrCreateStore("gps_orders", INITIAL_ORDERS));
    setTickets(getOrCreateStore("gps_tickets", INITIAL_TICKETS));
    setScanLogs(getOrCreateStore("gps_scanlogs", INITIAL_SCAN_LOGS));
    setSettlements(getOrCreateStore("gps_settlements", INITIAL_SETTLEMENTS));
    setAuditLogs(getOrCreateStore("gps_auditlogs", INITIAL_AUDIT_LOGS));
  }, []);

  // Update localStorage when state alters
  const persistState = (key: string, data: any, stateSetter: Function) => {
    stateSetter(data);
    saveStore(key, data);
  };

  // Callback: Request Access submitted (Screen 4 Form)
  const handleAddRequest = (newReq: Omit<AccessRequest, "id" | "status" | "requestTime">) => {
    const id = "req_" + Date.now();
    const addedReq: AccessRequest = {
      ...newReq,
      id,
      status: "pending",
      requestTime: "Today, " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updated = [addedReq, ...requests];
    persistState("gps_requests", updated, setRequests);

    // Add Audit Log
    const addedAudit: AuditLog = {
      id: "aud_" + Date.now(),
      timestamp: new Date().toISOString(),
      actor: "Hardik Jain (Student)",
      action: "Access Requested",
      details: `Requested access pass to '${newReq.zoneName}' for ${newReq.durationHours}.`
    };
    persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
  };

  // Callback: Request Approved (Screen 3 Approvals)
  const handleApproveRequest = (id: string) => {
    const updatedReqs = requests.map(req => {
      if (req.id === id) {
        return { ...req, status: "approved" as const };
      }
      return req;
    });
    persistState("gps_requests", updatedReqs, setRequests);

    const approvedReq = requests.find(r => r.id === id);
    if (approvedReq) {
      // Create new active pass
      const passIdCode = "GP-" + Math.floor(1000 + Math.random() * 9000) + "-VX";
      const newPass: InvitePass = {
        id: "p_" + Date.now(),
        title: "Temporary Access Pass",
        category: "INVITE",
        subCategory: approvedReq.zoneName.split(" • ")[0],
        passIdCode,
        status: "APPROVED",
        validityText: "Expires in " + approvedReq.durationHours,
        usageText: "0 OF 1 ENTRIES USED",
        usageType: "limited",
        entriesTotal: 1,
        entriesUsed: 0,
        qrToken: "TOKEN_" + passIdCode.replace("-", "_")
      };

      const updatedPasses = [newPass, ...invitePasses];
      persistState("gps_invites", updatedPasses, setInvitePasses);

      // Create log
      const addedAudit: AuditLog = {
        id: "aud_" + Date.now(),
        timestamp: new Date().toISOString(),
        actor: "Admin Reviewer",
        action: "Pass Approved & Issued",
        details: `Approved '${approvedReq.requesterName}' access request. Generated secure token hash: ${newPass.qrToken}`
      };
      persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
    }
  };

  // Callback: Request Denied (Screen 3 Approvals)
  const handleDenyRequest = (id: string) => {
    const updatedReqs = requests.map(req => {
      if (req.id === id) {
        return { ...req, status: "denied" as const };
      }
      return req;
    });
    persistState("gps_requests", updatedReqs, setRequests);

    const deniedReq = requests.find(r => r.id === id);
    if (deniedReq) {
      const addedAudit: AuditLog = {
        id: "aud_" + Date.now(),
        timestamp: new Date().toISOString(),
        actor: "Admin Reviewer",
        action: "Request Denied",
        details: `Denied access request for '${deniedReq.requesterName}' to '${deniedReq.zoneName}'.`
      };
      persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
    }
  };

  // Callback: Revoke Invite Pass (Screen 3 My Invites)
  const handleRevokeInvite = (id: string) => {
    const updatedPasses = invitePasses.map(p => {
      if (p.id === id) {
        return { ...p, status: "REVOKED" as const, validityText: "Revoked by Administrator" };
      }
      return p;
    });
    persistState("gps_invites", updatedPasses, setInvitePasses);

    const targetPass = invitePasses.find(p => p.id === id);
    const addedAudit: AuditLog = {
      id: "aud_" + Date.now(),
      timestamp: new Date().toISOString(),
      actor: "Security Officer",
      action: "Pass Revoked",
      details: `Revoked active access token ${targetPass?.passIdCode || ""} for security maintenance.`
    };
    persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
  };

  // Callback: Resend Invite (Screen 3 My Invites)
  const handleResendInvite = (id: string) => {
    const addedAudit: AuditLog = {
      id: "aud_" + Date.now(),
      timestamp: new Date().toISOString(),
      actor: "System Outbox",
      action: "Notification Dispatched",
      details: `Dispatched SMS/Email reminder with digital wallet link for pass ID ${id}.`
    };
    persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
  };

  // Callback: Add New Event (Organizer Workspace Builder)
  const handleAddNewEvent = (newEvent: EventItem) => {
    const updated = [newEvent, ...events];
    persistState("gps_events", updated, setEvents);

    // Initialize blank settlement parameters
    const newSettlement: Settlement = {
      id: "set_" + newEvent.id,
      eventId: newEvent.id,
      eventName: newEvent.title,
      grossSales: 0,
      totalRefunds: 0,
      platformFees: 0,
      gatewayFees: 0,
      manualCollections: 0,
      netSettlement: 0,
      status: "pending"
    };
    persistState("gps_settlements", [newSettlement, ...settlements], setSettlements);

    // Audit log
    const addedAudit: AuditLog = {
      id: "aud_" + Date.now(),
      timestamp: new Date().toISOString(),
      actor: "Event Coordinator",
      action: "Event Published",
      details: `Published "${newEvent.title}" (${newEvent.eventType}) at ${newEvent.venue}.`
    };
    persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
  };

  // Callback: Book Event Ticket (From AttendeeEventsList)
  const handleBookTicket = (newOrder: Order, newTicket: Ticket) => {
    // 1. Add order to orders
    persistState("gps_orders", [newOrder, ...orders], setOrders);

    // 2. Add ticket to tickets
    persistState("gps_tickets", [newTicket, ...tickets], setTickets);

    // 3. Update events list (incrementing category soldCount)
    const updatedEvents = events.map(ev => {
      if (ev.id === newTicket.eventId) {
        return {
          ...ev,
          ticketCategories: ev.ticketCategories.map(cat => {
            if (cat.name === newTicket.categoryName) {
              return { ...cat, soldCount: (cat.soldCount || 0) + 1 };
            }
            return cat;
          })
        };
      }
      return ev;
    });
    persistState("gps_events", updatedEvents, setEvents);

    // 4. Update settlements
    const updatedSettlements = settlements.map(set => {
      if (set.eventId === newTicket.eventId) {
        const isCash = newOrder.paymentMethod === "cash";
        return {
          ...set,
          grossSales: set.grossSales + newTicket.price,
          platformFees: set.platformFees + newOrder.platformFee,
          gatewayFees: set.gatewayFees + (newOrder.gatewayFee || 0),
          manualCollections: set.manualCollections + (isCash ? newTicket.price : 0),
          netSettlement: set.netSettlement + newOrder.netAmount
        };
      }
      return set;
    });
    persistState("gps_settlements", updatedSettlements, setSettlements);

    // 5. Generate matching InvitePass so that the attendee immediately sees it in their "Digital Identity" active list
    const passIdCode = "GP-" + Math.floor(1000 + Math.random() * 9000) + "-VX";
    const companionPass: InvitePass = {
      id: "pass_ev_" + Date.now(),
      title: events.find(e => e.id === newTicket.eventId)?.title || "Event Entry Pass",
      category: "EVENT",
      subCategory: newTicket.categoryName,
      passIdCode,
      status: "APPROVED",
      validityText: "Valid: " + new Date(events.find(e => e.id === newTicket.eventId)?.startTime || "").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
      usageText: "SINGLE ENTRY PASS",
      usageType: "limited",
      entriesTotal: 1,
      entriesUsed: 0,
      qrToken: newTicket.qrToken
    };
    persistState("gps_invites", [companionPass, ...invitePasses], setInvitePasses);

    // 6. Add Audit Log entry
    const addedAudit: AuditLog = {
      id: "aud_" + Date.now(),
      timestamp: new Date().toISOString(),
      actor: `${newTicket.attendeeName} (Attendee)`,
      action: "Ticket Purchased",
      details: `Purchased [${newTicket.categoryName}] ticket for '${events.find(e => e.id === newTicket.eventId)?.title || "Event"}' via ${newOrder.paymentMethod.toUpperCase()}. Order ID: ${newOrder.id}. QR token generated.`
    };
    persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
  };

  // Callback: Issue Manual/Cash Ticket (Organizer Workspace Module 4 Flow E)
  const handleIssueManualTicket = (newTkt: Omit<Ticket, "id" | "status" | "issuedAt">) => {
    const ticketId = "tkt_manual_" + Date.now();
    const addedTicket: Ticket = {
      ...newTkt,
      id: ticketId,
      status: TicketStatus.ISSUED,
      issuedAt: new Date().toISOString()
    };
    persistState("gps_tickets", [addedTicket, ...tickets], setTickets);

    // Create companion Manual Order
    const addedOrder: Order = {
      id: newTkt.orderId,
      eventId: newTkt.eventId,
      buyerName: newTkt.attendeeName,
      buyerEmail: newTkt.attendeeEmail,
      buyerPhone: newTkt.attendeePhone,
      paymentStatus: "paid",
      grossAmount: newTkt.price,
      platformFee: 5, // Flat ₹5/ticket fee
      gatewayFee: 0, // No online gateway charge for cash
      netAmount: newTkt.price - 5,
      paymentMethod: "cash",
      created_at: new Date().toISOString()
    };
    persistState("gps_orders", [addedOrder, ...orders], setOrders);

    // Update Category counts
    const updatedEvents = events.map(ev => {
      if (ev.id === newTkt.eventId) {
        return {
          ...ev,
          ticketCategories: ev.ticketCategories.map(cat => {
            if (cat.name === newTkt.categoryName) {
              return { ...cat, soldCount: cat.soldCount + 1 };
            }
            return cat;
          })
        };
      }
      return ev;
    });
    persistState("gps_events", updatedEvents, setEvents);

    // Update Settlements values
    const updatedSettlements = settlements.map(set => {
      if (set.eventId === newTkt.eventId) {
        return {
          ...set,
          grossSales: set.grossSales + newTkt.price,
          platformFees: set.platformFees + 5,
          manualCollections: set.manualCollections + newTkt.price,
          netSettlement: set.netSettlement + (newTkt.price - 5)
        };
      }
      return set;
    });
    persistState("gps_settlements", updatedSettlements, setSettlements);

    // Audit log
    const addedAudit: AuditLog = {
      id: "aud_" + Date.now(),
      timestamp: new Date().toISOString(),
      actor: "Cash Register Staff",
      action: "Manual Pass Issued",
      details: `Logged offline cash sale for '${newTkt.attendeeName}' [${newTkt.categoryName}]. QR Ticket printed.`
    };
    persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
  };

  // Callback: Process Refund / Void QR (Organizer Workspace Control Room)
  const handleProcessRefund = (ticketId: string) => {
    const updatedTickets = tickets.map(t => {
      if (t.id === ticketId) {
        return { ...t, status: TicketStatus.REFUNDED };
      }
      return t;
    });
    persistState("gps_tickets", updatedTickets, setTickets);

    const ticket = tickets.find(t => t.id === ticketId);
    if (ticket) {
      // Create companion audit log
      const addedAudit: AuditLog = {
        id: "aud_" + Date.now(),
        timestamp: new Date().toISOString(),
        actor: "Finance Auditor",
        action: "Ticket Voided (Refunded)",
        details: `Process refund for ticket ${ticketId}. QR token ${ticket.qrToken} flag invalidated on security terminals.`
      };
      persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
    }
  };

  // Callback: Gate Web QR Scan validated (Scanner Simulation)
  const handleLogScan = (ticket: Ticket, result: ScanLog["scanResult"], gate: string) => {
    const logId = "slog_" + Date.now();
    const targetEvent = events.find(e => e.id === ticket.eventId);

    const addedLog: ScanLog = {
      id: logId,
      ticketId: ticket.id,
      eventId: ticket.eventId,
      eventName: targetEvent?.title || "Unknown Event",
      attendeeName: ticket.attendeeName,
      categoryName: ticket.categoryName,
      scanResult: result,
      scanTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      gateName: gate,
      scannedBy: "Officer Mehra"
    };

    persistState("gps_scanlogs", [addedLog, ...scanLogs], setScanLogs);

    // If valid scan, update actual Ticket Status to Checked In
    if (result === "VALID") {
      const updatedTickets = tickets.map(t => {
        if (t.id === ticket.id) {
          return {
            ...t,
            status: TicketStatus.CHECKED_IN,
            checkedInAt: new Date().toISOString(),
            gateScanned: gate,
            scannedBy: "Officer Mehra"
          };
        }
        return t;
      });
      persistState("gps_tickets", updatedTickets, setTickets);
    }

    // Add Security Audit log
    const addedAudit: AuditLog = {
      id: "aud_" + Date.now(),
      timestamp: new Date().toISOString(),
      actor: "Gate scanner Terminal",
      action: `Scan: ${result}`,
      details: `Gate staff scanned token ${ticket.qrToken} at '${gate}'. Outcome: ${result}.`
    };
    persistState("gps_auditlogs", [addedAudit, ...auditLogs], setAuditLogs);
  };

  return (
    <div className="min-h-screen bg-background font-sans text-on-background flex flex-col pb-20 md:pb-0">
      
      {/* Top Bar Navigation (Responsive Sidebar Drawer Trigger) */}
      <header className="w-full bg-white border-b border-outline-variant/30 sticky top-0 z-40 px-6 py-4 flex justify-between items-center md:hidden">
        <div className="flex items-center gap-3">
          <Fingerprint className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-base font-black text-charcoal-dark tracking-tight">GatePass</h1>
            <p className="text-[9px] uppercase tracking-wider text-outline font-bold">Organizer &amp; Entry Operating System</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick Perspective Toggle on Mobile header */}
          <button 
            onClick={() => setPerspective(perspective === "attendee" ? "organizer" : "attendee")}
            className="text-[10px] font-black uppercase bg-primary-container text-on-primary-container px-3 py-1.5 rounded-full shadow-sm"
          >
            {perspective === "attendee" ? "Organizer Mode" : "User Mode"}
          </button>
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg hover:bg-surface-container text-charcoal-dark"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Responsive Left Sidebar Navigation (Desktop view + Mobile Overlay Drawer) */}
      <aside className={`fixed md:sticky top-0 left-0 h-screen md:h-auto w-64 md:w-full bg-white border-r md:border-r-0 md:border-b border-outline-variant/40 flex flex-col md:flex-row md:items-center justify-between py-6 md:py-4 px-4 md:px-10 shadow-sm z-50 transition-transform duration-300 ${
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}>
        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
          {/* Logo and Branding header */}
          <div className="flex items-center gap-3 px-2 md:px-0">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white border-2 border-primary">
              <Fingerprint className="w-6 h-6" />
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl md:text-3xl font-black text-charcoal-dark tracking-tighter uppercase">GatePass</h1>
              <p className="text-[10px] md:text-xs uppercase font-bold bg-charcoal-dark text-white px-2 py-0.5 tracking-widest hidden md:block">PRO</p>
            </div>
          </div>

          {/* Perspective Selector Swapper */}
          <div className="bg-surface-container p-1 rounded-xl flex flex-col md:flex-row md:items-center gap-1 md:ml-4 border-2 border-outline-variant/30">
            <span className="text-[9px] font-black text-outline uppercase px-2 py-1 tracking-wider md:hidden">Perspective Node</span>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setPerspective("attendee");
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  perspective === "attendee" ? "bg-primary text-white shadow font-bold" : "text-on-surface-variant hover:text-charcoal-dark"
                }`}
              >
                Attendee
              </button>
              <button
                onClick={() => {
                  setPerspective("organizer");
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  perspective === "organizer" ? "bg-primary text-white shadow font-bold" : "text-on-surface-variant hover:text-charcoal-dark"
                }`}
              >
                Organizer
              </button>
            </div>
          </div>

          {/* Perspective specific Navigation Routes */}
          <nav className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-6 mt-2 md:mt-0">
            {perspective === "attendee" ? (
              /* ATTENDEE ROUTES */
              <>
                <button
                  onClick={() => {
                    setAttendeeSection("home");
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3.5 md:gap-2 px-4 md:px-0 py-3 md:py-0 rounded-xl md:rounded-none transition-all cursor-pointer text-sm md:text-xs font-bold md:uppercase md:tracking-widest ${
                    attendeeSection === "home" 
                      ? "bg-primary-container/10 md:bg-transparent text-primary md:text-charcoal-dark md:underline md:decoration-2 md:underline-offset-4 border-l-4 md:border-l-0 border-l-primary" 
                      : "text-on-surface-variant hover:bg-surface-container md:hover:bg-transparent md:hover:text-charcoal-dark md:opacity-60 md:hover:opacity-100"
                  }`}
                >
                  <IdCard className="w-4 h-4 md:hidden" />
                  <span>Digital Identity</span>
                </button>

                <button
                  onClick={() => {
                    setAttendeeSection("request");
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3.5 md:gap-2 px-4 md:px-0 py-3 md:py-0 rounded-xl md:rounded-none transition-all cursor-pointer text-sm md:text-xs font-bold md:uppercase md:tracking-widest ${
                    attendeeSection === "request" 
                      ? "bg-primary-container/10 md:bg-transparent text-primary md:text-charcoal-dark md:underline md:decoration-2 md:underline-offset-4 border-l-4 md:border-l-0 border-l-primary" 
                      : "text-on-surface-variant hover:bg-surface-container md:hover:bg-transparent md:hover:text-charcoal-dark md:opacity-60 md:hover:opacity-100"
                  }`}
                >
                  <Calendar className="w-4 h-4 md:hidden" />
                  <span>Request Temp Access</span>
                </button>

                <button
                  onClick={() => {
                    setAttendeeSection("approvals");
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3.5 md:gap-2 px-4 md:px-0 py-3 md:py-0 rounded-xl md:rounded-none transition-all cursor-pointer text-sm md:text-xs font-bold md:uppercase md:tracking-widest relative ${
                    attendeeSection === "approvals" 
                      ? "bg-primary-container/10 md:bg-transparent text-primary md:text-charcoal-dark md:underline md:decoration-2 md:underline-offset-4 border-l-4 md:border-l-0 border-l-primary" 
                      : "text-on-surface-variant hover:bg-surface-container md:hover:bg-transparent md:hover:text-charcoal-dark md:opacity-60 md:hover:opacity-100"
                  }`}
                >
                  <Bell className="w-4 h-4 md:hidden" />
                  <span>Approvals &amp; Invites</span>
                  {requests.filter(r => r.status === "pending").length > 0 && (
                    <span className="absolute right-4 md:-right-4 md:-top-2 w-5 h-5 md:w-4 md:h-4 bg-status-danger rounded-full text-[9px] font-bold text-white flex items-center justify-center animate-bounce border border-charcoal-dark">
                      {requests.filter(r => r.status === "pending").length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setAttendeeSection("wallet");
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3.5 md:gap-2 px-4 md:px-0 py-3 md:py-0 rounded-xl md:rounded-none transition-all cursor-pointer text-sm md:text-xs font-bold md:uppercase md:tracking-widest ${
                    attendeeSection === "wallet" 
                      ? "bg-primary-container/10 md:bg-transparent text-primary md:text-charcoal-dark md:underline md:decoration-2 md:underline-offset-4 border-l-4 md:border-l-0 border-l-primary" 
                      : "text-on-surface-variant hover:bg-surface-container md:hover:bg-transparent md:hover:text-charcoal-dark md:opacity-60 md:hover:opacity-100"
                  }`}
                >
                  <Smartphone className="w-4 h-4 md:hidden" />
                  <span>Wallet Sync</span>
                </button>

                <button
                  onClick={() => {
                    setAttendeeSection("events");
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3.5 md:gap-2 px-4 md:px-0 py-3 md:py-0 rounded-xl md:rounded-none transition-all cursor-pointer text-sm md:text-xs font-bold md:uppercase md:tracking-widest ${
                    attendeeSection === "events" 
                      ? "bg-primary-container/10 md:bg-transparent text-primary md:text-charcoal-dark md:underline md:decoration-2 md:underline-offset-4 border-l-4 md:border-l-0 border-l-primary" 
                      : "text-on-surface-variant hover:bg-surface-container md:hover:bg-transparent md:hover:text-charcoal-dark md:opacity-60 md:hover:opacity-100"
                  }`}
                >
                  <TicketIcon className="w-4 h-4 md:hidden" />
                  <span>Events &amp; Concerts</span>
                </button>
              </>
            ) : (
              /* ORGANIZER ROUTES */
              <>
                <button
                  onClick={() => {
                    setOrganizerSection("workspace");
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3.5 md:gap-2 px-4 md:px-0 py-3 md:py-0 rounded-xl md:rounded-none transition-all cursor-pointer text-sm md:text-xs font-bold md:uppercase md:tracking-widest ${
                    organizerSection === "workspace" 
                      ? "bg-primary-container/10 md:bg-transparent text-primary md:text-charcoal-dark md:underline md:decoration-2 md:underline-offset-4 border-l-4 md:border-l-0 border-l-primary" 
                      : "text-on-surface-variant hover:bg-surface-container md:hover:bg-transparent md:hover:text-charcoal-dark md:opacity-60 md:hover:opacity-100"
                  }`}
                >
                  <TrendingUp className="w-4 h-4 md:hidden" />
                  <span>Control Room &amp; Workspace</span>
                </button>

                <button
                  onClick={() => {
                    setOrganizerSection("scanner");
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3.5 md:gap-2 px-4 md:px-0 py-3 md:py-0 rounded-xl md:rounded-none transition-all cursor-pointer text-sm md:text-xs font-bold md:uppercase md:tracking-widest ${
                    organizerSection === "scanner" 
                      ? "bg-primary-container/10 md:bg-transparent text-primary md:text-charcoal-dark md:underline md:decoration-2 md:underline-offset-4 border-l-4 md:border-l-0 border-l-primary" 
                      : "text-on-surface-variant hover:bg-surface-container md:hover:bg-transparent md:hover:text-charcoal-dark md:opacity-60 md:hover:opacity-100"
                  }`}
                >
                  <Smartphone className="w-4 h-4 md:hidden" />
                  <span>Gate Checkout Scanner</span>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Desktop Sidebar Footer -> Now Header Avatar */}
        <div className="border-t border-surface-container md:border-t-0 pt-4 md:pt-0 mt-auto md:mt-0 flex flex-col md:flex-row gap-2">
          <div className="flex items-center gap-3 px-2 md:px-0">
            <div className="hidden md:block text-right">
              <h4 className="text-xs font-bold text-charcoal-dark">{user.name}</h4>
              <p className="text-[10px] text-outline uppercase font-semibold">Verified Member</p>
            </div>
            <img 
              src={user.avatarUrl} 
              alt={user.name} 
              className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border border-outline-variant"
            />
            <div className="truncate md:hidden">
              <h4 className="text-xs font-bold text-charcoal-dark truncate">{user.name}</h4>
              <p className="text-[10px] text-outline uppercase font-semibold">Verified Member</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Screen background blocking mask on mobile view when menu is active */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
        />
      )}

      {/* Primary Layout Center */}
      <main className="flex-1 max-w-full px-6 py-6 md:py-10 md:px-10 overflow-x-hidden">
        
        {/* Banner Alert advising users on the perspective toggling feature */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary p-2 rounded-full flex-shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-charcoal-dark tracking-wide">Interactive V1 Live Preview Sandbox</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed mt-0.5">
                Switch perspective nodes at any time! Generate access requests as a user, instantly approve them, and test validation gates using the QR scanner mock simulator.
              </p>
            </div>
          </div>
          <button 
            onClick={() => setPerspective(perspective === "attendee" ? "organizer" : "attendee")}
            className="whitespace-nowrap py-2 px-4 bg-charcoal-dark text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-opacity-95 transition-all cursor-pointer shadow-sm text-center"
          >
            Swap to {perspective === "attendee" ? "Organizer Console" : "User App"}
          </button>
        </div>

        {/* Dynamic Route Switching block */}
        {perspective === "attendee" ? (
          /* ATTENDEE PANEL COMPONENT MATRIX */
          <div id="attendee-matrix">
            {attendeeSection === "home" && (
              <IdentityCard 
                user={user}
                invitePasses={invitePasses}
                onNavigateToRequest={() => setAttendeeSection("request")}
                onNavigateToWallet={(pass) => {
                  setSelectedWalletPass(pass);
                  setAttendeeSection("wallet");
                }}
              />
            )}

            {attendeeSection === "request" && (
              <RequestAccessForm 
                onBack={() => setAttendeeSection("home")}
                onSubmitRequest={handleAddRequest}
              />
            )}

            {attendeeSection === "approvals" && (
              <ApprovalsInvites 
                requests={requests}
                invites={invitePasses}
                onApproveRequest={handleApproveRequest}
                onDenyRequest={handleDenyRequest}
                onRevokeInvite={handleRevokeInvite}
                onResendInvite={handleResendInvite}
              />
            )}

            {attendeeSection === "wallet" && (
              <WalletSync 
                user={user}
                selectedPass={selectedWalletPass}
              />
            )}

            {attendeeSection === "events" && (
              <AttendeeEventsList 
                events={events}
                user={user}
                onBookTicket={handleBookTicket}
              />
            )}
          </div>
        ) : (
          /* ORGANIZER PANEL COMPONENT MATRIX */
          <div id="organizer-matrix">
            {organizerSection === "workspace" && (
              <OrganizerWorkspace 
                events={events}
                orders={orders}
                tickets={tickets}
                scanLogs={scanLogs}
                settlements={settlements}
                auditLogs={auditLogs}
                onAddNewEvent={handleAddNewEvent}
                onIssueManualTicket={handleIssueManualTicket}
                onProcessRefund={handleProcessRefund}
              />
            )}

            {organizerSection === "scanner" && (
              <QRScannerSimulation 
                tickets={tickets}
                events={events}
                scanLogs={scanLogs}
                onLogScan={handleLogScan}
              />
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Sticky Bar (Matches mockups strictly for touch convenience) */}
      <nav className="fixed bottom-0 left-0 w-full z-40 bg-white border-t border-outline-variant/30 py-2.5 px-4 flex justify-around items-center md:hidden shadow-lg">
        {perspective === "attendee" ? (
          <>
            <button
              onClick={() => setAttendeeSection("home")}
              className={`flex flex-col items-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                attendeeSection === "home" ? "text-primary font-extrabold" : "text-on-surface-variant"
              }`}
            >
              <IdCard className="w-5 h-5" />
              <span>Home</span>
            </button>
            <button
              onClick={() => setAttendeeSection("request")}
              className={`flex flex-col items-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                attendeeSection === "request" ? "text-primary font-extrabold" : "text-on-surface-variant"
              }`}
            >
              <Calendar className="w-5 h-5" />
              <span>Requests</span>
            </button>
            <button
              onClick={() => setAttendeeSection("approvals")}
              className={`flex flex-col items-center gap-1 text-[10px] uppercase font-bold tracking-wider relative cursor-pointer ${
                attendeeSection === "approvals" ? "text-primary font-extrabold" : "text-on-surface-variant"
              }`}
            >
              <Bell className="w-5 h-5" />
              <span>Invites</span>
              {requests.filter(r => r.status === "pending").length > 0 && (
                <span className="absolute -top-1 right-2 w-4 h-4 bg-status-danger rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                  {requests.filter(r => r.status === "pending").length}
                </span>
              )}
            </button>
            <button
              onClick={() => setAttendeeSection("wallet")}
              className={`flex flex-col items-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                attendeeSection === "wallet" ? "text-primary font-extrabold" : "text-on-surface-variant"
              }`}
            >
              <Smartphone className="w-5 h-5" />
              <span>Wallet</span>
            </button>
            <button
              onClick={() => setAttendeeSection("events")}
              className={`flex flex-col items-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                attendeeSection === "events" ? "text-primary font-extrabold" : "text-on-surface-variant"
              }`}
            >
              <Sparkles className="w-5 h-5" />
              <span>Events</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setOrganizerSection("workspace")}
              className={`flex flex-col items-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                organizerSection === "workspace" ? "text-primary font-extrabold" : "text-on-surface-variant"
              }`}
            >
              <TrendingUp className="w-5 h-5" />
              <span>Control Room</span>
            </button>
            <button
              onClick={() => setOrganizerSection("scanner")}
              className={`flex flex-col items-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                organizerSection === "scanner" ? "text-primary font-extrabold" : "text-on-surface-variant"
              }`}
            >
              <Smartphone className="w-5 h-5" />
              <span>Scanner Gate</span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
}
