import React, { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from "react-router-dom";
import { 
  INITIAL_USER
} from "./mockData";
import { createInitialAppState, type AppStateSnapshot } from "./appState";
import { loadAppState, saveAppState, createEventApi } from "./api";
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
  TicketStatus
} from "./types";
import { authClient, getAuthToken } from "./auth";
import { hasOrganizerAccess, roleForAuthenticatedEmail } from "./permissions";
import { fetchScannerAccess } from "./scannerApi";
import { fetchTransfers } from "./transferApi";
import IdentityCard from "./pages/Profile";
import RequestAccessForm from "./pages/RequestAccess";
import ApprovalsInvites from "./pages/Approvals";
import WalletSync from "./pages/Wallet";
import QRScannerSimulation from "./pages/Scanner";
import OrganizerWorkspace from "./pages/Organizer";
import AttendeeEventsList from "./pages/Events";
import HomeUpdates from "./pages/Home";
import LandingPage from "./pages/LandingPage";
import { MorphText } from "./components/ui/morph-text";
import AnimatedButton from "./components/ui/animated-button";
import SocialFlipButton from "./components/ui/social-flip-button";
import { AnimatedNumber } from "./components/ui/animated-number";
import { FaGithub, FaLinkedin, FaInstagram, FaEnvelope, FaGlobe } from "react-icons/fa";
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
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  LogOut,
  Ticket as TicketIcon
} from "lucide-react";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

interface ToastMessage {
  id: number;
  type: "success" | "error" | "warning" | "info";
  text: string;
}

// "jane.doe@x.com" -> "Jane Doe". Used when the OAuth provider gives us an
// account with no display name; falling through to the seed profile's name
// would show the placeholder identity to a real signed-in user.
function nameFromEmail(email: string): string {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function identityFromSession(u: {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}): Partial<UserProfile> {
  const email = u.email?.trim() ?? "";
  const identity: Partial<UserProfile> = {
    role: roleForAuthenticatedEmail(email || undefined),
  };
  if (u.id) identity.id = u.id;
  if (email) identity.email = email;
  const name = u.name?.trim() || (email ? nameFromEmail(email) : "");
  if (name) identity.name = name;
  if (u.image) identity.avatarUrl = u.image;
  return identity;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Perspectives
  const [perspective, setPerspective] = useState<"attendee" | "organizer">("attendee");
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
  const [backendStatus, setBackendStatus] = useState<"loading" | "connected" | "offline">("loading");
  const [isHydrated, setIsHydrated] = useState(false);

  // Auth state (Issue #1 & #4)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [canAccessScanner, setCanAccessScanner] = useState(false);

  // Toast notifications (Issue #2)
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Selected pass for Wallet details
  const [selectedWalletPass, setSelectedWalletPass] = useState<InvitePass | undefined>(undefined);

  const addToast = useCallback((type: ToastMessage["type"], text: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // The stored snapshot is a single record shared by every signed-in user, so
  // its `user` field is whoever saved last — it must NEVER be treated as the
  // current viewer's identity. Always re-apply the verified session identity
  // over it, otherwise the previous saver's name/avatar/student ID is shown
  // to everyone (the email/role were already corrected below, which is why
  // only those two ever looked right).
  const applyStateSnapshot = (
    state: AppStateSnapshot,
    identity?: Partial<UserProfile> | null,
  ) => {
    setUser(identity ? { ...state.user, ...identity } : state.user);
    setRequests(state.requests);
    setInvitePasses(state.invitePasses);
    setEvents(state.events);
    setOrders(state.orders);
    setTickets(state.tickets);
    setScanLogs(state.scanLogs);
    setSettlements(state.settlements);
    setAuditLogs(state.auditLogs);
  };

  const currentStateSnapshot = (): AppStateSnapshot => ({
    user,
    requests,
    invitePasses,
    events,
    orders,
    tickets,
    scanLogs,
    settlements,
    auditLogs,
  });

  const handleGoogleLoginSuccess = async (credentialResponse: any) => {
    addToast("info", "Authenticating via Neon Auth...");
  };

  const handleGoogleLoginError = () => {
    addToast("error", "Neon Auth Google sign-in failed or was cancelled.");
  };

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error("Neon Auth sign out error:", err);
    }
    setIsAuthenticated(false);
    setAuthEmail(null);
    setCanAccessScanner(false);
    sessionStorage.removeItem("neon_auth_token");
    sessionStorage.removeItem("neon_auth_email");
    addToast("info", "You have been signed out.");
  };

  const canAccessOrganizer = hasOrganizerAccess(user, authEmail);
  const hasScannerAccess = canAccessOrganizer || canAccessScanner;

  // Incoming ticket transfers waiting on this user share the Approvals badge
  // with access requests — both are "something is waiting for you".
  const [pendingTransferCount, setPendingTransferCount] = useState(0);
  const pendingApprovalsCount =
    requests.filter((r) => r.status === "pending").length + pendingTransferCount;

  useEffect(() => {
    if (!isAuthenticated) {
      setPendingTransferCount(0);
      return;
    }
    let cancelled = false;
    fetchTransfers()
      .then((lists) => {
        if (!cancelled) {
          setPendingTransferCount(lists.incoming.filter((t) => t.status === "pending").length);
        }
      })
      .catch(() => {
        if (!cancelled) setPendingTransferCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authEmail) return;
    const role = roleForAuthenticatedEmail(authEmail);
    if (user.email === authEmail && user.role === role) return;
    setUser((current) => ({ ...current, email: authEmail, role }));
  }, [authEmail, user.email, user.role]);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || !authEmail) {
      setCanAccessScanner(false);
      return;
    }
    fetchScannerAccess()
      .then((access) => {
        if (!cancelled) setCanAccessScanner(access.can_scan);
      })
      .catch(() => {
        if (!cancelled) setCanAccessScanner(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authEmail]);

  useEffect(() => {
    const organizerPath = location.pathname.startsWith("/organizer")
      || location.pathname.startsWith("/scanner");
    setPerspective(organizerPath && canAccessOrganizer ? "organizer" : "attendee");
  }, [location.pathname, canAccessOrganizer]);

  const handlePerspectiveSwitch = (target: "attendee" | "organizer") => {
    if (target === "organizer" && !canAccessOrganizer) {
      addToast("warning", "You don't have organizer permissions. Contact an administrator.");
      return;
    }
    setPerspective(target);
    if (target === "organizer") {
      navigate("/organizer");
    } else {
      navigate("/");
    }
  };

  // Neon Auth Session Synchronization + App State Hydration.
  //
  // These must run as ONE sequence, not two independent effects. sessionStorage
  // starts empty on every fresh tab/reload and is only populated after the
  // async getSession()/getAuthToken() round-trip below resolves. A separate
  // "load app state" effect that reads sessionStorage synchronously on mount
  // would almost always see no token yet — even for an already-logged-in
  // user — fall back to mock data, and mark itself "connected". The very next
  // debounced autosave would then overwrite the real shared server state with
  // that mock snapshot. Resolving the token first, then hydrating with it
  // directly (never via a sessionStorage read-back), removes the race.
  useEffect(() => {
    let cancelled = false;

    const syncSessionAndHydrate = async () => {
      let token: string | null = null;
      let identity: Partial<UserProfile> | null = null;
      try {
        const sessionRes = await authClient.getSession();
        if (cancelled) return;
        if (sessionRes?.data?.user) {
          const u = sessionRes.data.user;
          // Store the verifiable Neon Auth JWT (from /token), never the opaque
          // session-cookie string. Backends verify this via JWKS.
          token = await getAuthToken();
          if (cancelled) return;
          if (token) sessionStorage.setItem("neon_auth_token", token);
          identity = identityFromSession(u);
          setUser((prev) => ({ ...prev, ...identity }));
          setIsAuthenticated(true);
          setAuthEmail(u.email || null);
          if (u.email) sessionStorage.setItem("neon_auth_email", u.email);
        }
      } catch (err) {
        console.warn("Neon Auth session check warning:", err);
      }

      if (cancelled) return;

      try {
        if (!token) {
          // No auth token — try loading persisted events from the public endpoint
          // so previously created events still appear after refresh.
          const fallback = createInitialAppState();
          try {
            const eventsRes = await fetch(`${API_BASE_URL}/api/events`);
            if (eventsRes.ok) {
              const { events: dbEvents } = await eventsRes.json();
              if (Array.isArray(dbEvents) && dbEvents.length > 0) {
                fallback.events = dbEvents;
              }
            }
          } catch (evtErr) {
            console.warn("Public events fetch skipped:", evtErr);
          }
          if (cancelled) return;
          applyStateSnapshot(fallback, identity);
          setBackendStatus("offline");
          return;
        }

        const remoteState = await loadAppState();
        if (cancelled) return;
        applyStateSnapshot(remoteState ?? createInitialAppState(), identity);
        setBackendStatus("connected");
      } catch (error) {
        console.error("Backend state load failed, trying public events fallback.", error);
        if (cancelled) return;
        const fallback = createInitialAppState();
        try {
          const eventsRes = await fetch(`${API_BASE_URL}/api/events`);
          if (eventsRes.ok) {
            const { events: dbEvents } = await eventsRes.json();
            if (Array.isArray(dbEvents) && dbEvents.length > 0) {
              fallback.events = dbEvents;
            }
          }
        } catch (evtErr) {
          console.warn("Public events fetch skipped:", evtErr);
        }
        applyStateSnapshot(fallback, identity);
        setBackendStatus("offline");
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    syncSessionAndHydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist state changes — retry-friendly: a transient save failure does NOT
  // permanently disable autosave. The effect keeps firing on every state change
  // so the next mutation has a chance to succeed.
  useEffect(() => {
    if (!isHydrated) return;

    const timeoutId = window.setTimeout(() => {
      saveAppState(currentStateSnapshot()).then(() => {
        // If we were offline, a successful save means we recovered.
        setBackendStatus("connected");
      }).catch((error) => {
        console.warn("Backend state save failed (will retry on next change).", error);
        // Do NOT set backendStatus to "offline" — that would permanently
        // disable autosave until a full page reload.
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [user, requests, invitePasses, events, orders, tickets, scanLogs, settlements, auditLogs, isHydrated]);

  // State setter shim retained so existing workflows stay scoped to their current components.
  const persistState = (key: string, data: any, stateSetter: Function) => {
    stateSetter(data);
  };

  // Callback: Request Access submitted (Screen 4 Form)
  const handleAddRequest = (newReq: Omit<AccessRequest, "id" | "status" | "requestTime">) => {
    const id = "req_" + Date.now();
    const addedReq: AccessRequest = {
      ...newReq,
      requesterName: user.name,
      requesterAvatarUrl: user.avatarUrl,
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
      actor: `${user.name} (${user.role})`,
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
    // 1. Optimistic UI update — show the event immediately.
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
    const nextAudit = [addedAudit, ...auditLogs];
    persistState("gps_auditlogs", nextAudit, setAuditLogs);

    // 2. PERSIST to Neon PostgreSQL — try BOTH paths and ensure at least one succeeds.
    //    Path A: POST /api/events (dedicated atomic insert)
    //    Path B: PUT  /api/state  (full state blob save → syncReportingTables)
    const persistA = createEventApi(newEvent)
      .then((res) => {
        if (res?.event?.id) {
          setEvents((current) =>
            current.map((e) => (e.id === newEvent.id ? { ...e, id: res.event.id } : e)),
          );
        }
        return true;
      })
      .catch((err) => {
        console.warn("POST /api/events failed:", err);
        return false;
      });

    const persistB = saveAppState({
      ...currentStateSnapshot(),
      events: updated,
    }).then(() => true).catch((err) => {
      console.warn("PUT /api/state failed:", err);
      return false;
    });

    Promise.all([persistA, persistB]).then(([a, b]) => {
      if (!a && !b) {
        addToast("error", `Failed to save "${newEvent.title}" to database. Your event will be lost on refresh. Please check your connection and try again.`);
      }
    });
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

  if (!isHydrated) {
    return (
      <div className="fixed inset-0 z-[90] bg-background flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg">
          <Fingerprint className="w-9 h-9" />
        </div>
        <MorphText
          words={["GATEPASS", "SECURE", "VERIFIED", "ACCESS"]}
          interval={1800}
          fontSize="clamp(1.8rem, 5vw, 3rem)"
          fontFamily='"Inter", sans-serif'
          className="text-charcoal-dark"
        />
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Connecting to server…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background font-sans text-on-background">
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto animate-fadeIn flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold max-w-sm ${
                toast.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : toast.type === "error"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : toast.type === "warning"
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
            >
              {toast.type === "success" && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
              {toast.type === "error" && <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
              {toast.type === "warning" && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
              {toast.type === "info" && <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />}
              <span>{toast.text}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="ml-auto text-current opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <LandingPage 
          onLoginSuccess={handleGoogleLoginSuccess} 
          onLoginError={handleGoogleLoginError} 
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen xl:h-screen bg-background font-sans text-on-background flex flex-col xl:overflow-hidden pb-20 xl:pb-0">
      {/* Toast Notifications (Issue #2) */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-fadeIn flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold max-w-sm ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : toast.type === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : toast.type === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
            }`}
          >
            {toast.type === "success" && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
            {toast.type === "error" && <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
            {toast.type === "warning" && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
            {toast.type === "info" && <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />}
            <span>{toast.text}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="ml-auto text-current opacity-50 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      
      {/* Top Bar Navigation (Responsive Sidebar Drawer Trigger) */}
      <header className="w-full bg-white border-b border-outline-variant/30 sticky top-0 z-40 px-4 sm:px-6 py-4 flex justify-between items-center xl:hidden">
        <div className="flex items-center gap-1">
          <div>
            <h1 className="text-base font-black text-charcoal-dark tracking-tight">GatePass</h1>
            <p className="text-[9px] uppercase tracking-wider text-outline font-bold">Organizer &amp; Entry Operating System</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canAccessOrganizer && (
            <button
              onClick={() => handlePerspectiveSwitch(perspective === "attendee" ? "organizer" : "attendee")}
              className="text-[10px] font-black uppercase px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1 bg-primary-container text-on-primary-container"
            >
              {perspective === "attendee" ? "Organizer Mode" : "User Mode"}
            </button>
          )}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="grid size-11 place-items-center rounded-lg hover:bg-surface-container text-charcoal-dark"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="primary-navigation-drawer"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Responsive Left Sidebar Navigation (Desktop view + Mobile Overlay Drawer) */}
      <aside id="primary-navigation-drawer" className={`fixed xl:sticky top-0 left-0 h-screen xl:h-auto w-64 xl:w-full bg-white border-r xl:border-r-0 xl:border-b border-outline-variant/40 flex flex-col xl:flex-row xl:items-center justify-between py-6 xl:py-4 px-4 xl:px-10 shadow-sm z-50 transition-transform duration-300 ${
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full xl:translate-x-0"
      }`}>
        <div className="flex flex-col xl:flex-row xl:items-center gap-6 xl:gap-8">
          {/* Logo and Branding header */}
          <div className="flex items-center gap-1.5 px-2 xl:px-0">
            <h1 className="text-xl xl:text-3xl font-black text-charcoal-dark tracking-tighter uppercase leading-none">GatePass</h1>
            {/* Connection status indicator (Issue #9) */}
            <div className={`w-2.5 h-2.5 rounded-full ml-1.5 flex-shrink-0 ${
              backendStatus === "connected" ? "bg-emerald-400" :
              backendStatus === "offline" ? "bg-amber-400" :
              "bg-gray-300 animate-pulse"
            }`} title={backendStatus === "connected" ? "Connected" : backendStatus === "offline" ? "Offline mode" : "Connecting..."} />
          </div>

          {/* Perspective Selector Swapper */}
          {canAccessOrganizer && (
            <div className="bg-surface-container p-1 rounded-xl flex flex-col xl:flex-row xl:items-center gap-1 xl:ml-4 border-2 border-outline-variant/30">
              <span className="text-[9px] font-black text-outline uppercase px-2 py-1 tracking-wider xl:hidden">Perspective Node</span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    handlePerspectiveSwitch("attendee");
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
                    handlePerspectiveSwitch("organizer");
                    setMobileMenuOpen(false);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    perspective === "organizer"
                      ? "bg-primary text-white shadow font-bold"
                      : "text-on-surface-variant hover:text-charcoal-dark"
                  }`}
                >
                  Organizer
                </button>
              </div>
            </div>
          )}

          {/* Perspective specific Navigation Routes */}
          <nav className="flex flex-col xl:flex-row xl:items-center gap-1.5 xl:gap-6 mt-2 xl:mt-0">
            {perspective === "attendee" ? (
              /* ATTENDEE ROUTES */
              <>
                <NavLink
                  to="/"
                  end
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3.5 xl:gap-2 px-4 xl:px-0 py-3 xl:py-0 rounded-xl xl:rounded-none transition-all cursor-pointer text-sm xl:text-xs font-bold xl:uppercase xl:tracking-widest ${
                      isActive 
                        ? "bg-primary-container/10 xl:bg-transparent text-primary xl:text-charcoal-dark xl:underline xl:decoration-2 xl:underline-offset-4 border-l-4 xl:border-l-0 border-l-primary"
                        : "text-on-surface-variant hover:bg-surface-container xl:hover:bg-transparent xl:hover:text-charcoal-dark xl:opacity-60 xl:hover:opacity-100"
                    }`
                  }
                >
                  <Sparkles className="w-4 h-4 xl:hidden" />
                  <span>Home</span>
                </NavLink>

                <NavLink
                  to="/request"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3.5 xl:gap-2 px-4 xl:px-0 py-3 xl:py-0 rounded-xl xl:rounded-none transition-all cursor-pointer text-sm xl:text-xs font-bold xl:uppercase xl:tracking-widest ${
                      isActive 
                        ? "bg-primary-container/10 xl:bg-transparent text-primary xl:text-charcoal-dark xl:underline xl:decoration-2 xl:underline-offset-4 border-l-4 xl:border-l-0 border-l-primary"
                        : "text-on-surface-variant hover:bg-surface-container xl:hover:bg-transparent xl:hover:text-charcoal-dark xl:opacity-60 xl:hover:opacity-100"
                    }`
                  }
                >
                  <Calendar className="w-4 h-4 xl:hidden" />
                  <span>Request Temp Access</span>
                </NavLink>

                <NavLink
                  to="/approvals"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3.5 xl:gap-2 px-4 xl:px-0 py-3 xl:py-0 rounded-xl xl:rounded-none transition-all cursor-pointer text-sm xl:text-xs font-bold xl:uppercase xl:tracking-widest relative ${
                      isActive 
                        ? "bg-primary-container/10 xl:bg-transparent text-primary xl:text-charcoal-dark xl:underline xl:decoration-2 xl:underline-offset-4 border-l-4 xl:border-l-0 border-l-primary"
                        : "text-on-surface-variant hover:bg-surface-container xl:hover:bg-transparent xl:hover:text-charcoal-dark xl:opacity-60 xl:hover:opacity-100"
                    }`
                  }
                >
                  <Bell className="w-4 h-4 xl:hidden" />
                  <span>Approvals &amp; Invites</span>
                  {pendingApprovalsCount > 0 && (
                    <span className="absolute right-4 xl:-right-4 xl:-top-2 w-5 h-5 xl:w-4 xl:h-4 bg-status-danger rounded-full text-[9px] font-bold text-white flex items-center justify-center animate-bounce border border-charcoal-dark">
                      <AnimatedNumber value={pendingApprovalsCount} className="text-[9px]" />
                    </span>
                  )}
                </NavLink>


                <NavLink
                  to="/events"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3.5 xl:gap-2 px-4 xl:px-0 py-3 xl:py-0 rounded-xl xl:rounded-none transition-all cursor-pointer text-sm xl:text-xs font-bold xl:uppercase xl:tracking-widest ${
                      isActive 
                        ? "bg-primary-container/10 xl:bg-transparent text-primary xl:text-charcoal-dark xl:underline xl:decoration-2 xl:underline-offset-4 border-l-4 xl:border-l-0 border-l-primary"
                        : "text-on-surface-variant hover:bg-surface-container xl:hover:bg-transparent xl:hover:text-charcoal-dark xl:opacity-60 xl:hover:opacity-100"
                    }`
                  }
                >
                  <TicketIcon className="w-4 h-4 xl:hidden" />
                  <span>Events &amp; Concerts</span>
                </NavLink>
              </>
            ) : (
              /* ORGANIZER ROUTES */
              <>
                <NavLink
                  to="/organizer"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3.5 xl:gap-2 px-4 xl:px-0 py-3 xl:py-0 rounded-xl xl:rounded-none transition-all cursor-pointer text-sm xl:text-xs font-bold xl:uppercase xl:tracking-widest ${
                      isActive 
                        ? "bg-primary-container/10 xl:bg-transparent text-primary xl:text-charcoal-dark xl:underline xl:decoration-2 xl:underline-offset-4 border-l-4 xl:border-l-0 border-l-primary"
                        : "text-on-surface-variant hover:bg-surface-container xl:hover:bg-transparent xl:hover:text-charcoal-dark xl:opacity-60 xl:hover:opacity-100"
                    }`
                  }
                >
                  <TrendingUp className="w-4 h-4 xl:hidden" />
                  <span>Control Room &amp; Workspace</span>
                </NavLink>

                <NavLink
                  to="/scanner"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center gap-3.5 xl:gap-2 px-4 xl:px-0 py-3 xl:py-0 rounded-xl xl:rounded-none transition-all cursor-pointer text-sm xl:text-xs font-bold xl:uppercase xl:tracking-widest ${
                      isActive 
                        ? "bg-primary-container/10 xl:bg-transparent text-primary xl:text-charcoal-dark xl:underline xl:decoration-2 xl:underline-offset-4 border-l-4 xl:border-l-0 border-l-primary"
                        : "text-on-surface-variant hover:bg-surface-container xl:hover:bg-transparent xl:hover:text-charcoal-dark xl:opacity-60 xl:hover:opacity-100"
                    }`
                  }
                >
                  <Smartphone className="w-4 h-4 xl:hidden" />
                  <span>Gate Checkout Scanner</span>
                </NavLink>
              </>
            )}
          </nav>
        </div>

        {/* Desktop Sidebar Footer -> Now Header Avatar + Social Links */}
        <div className="border-t border-surface-container xl:border-t-0 pt-4 xl:pt-0 mt-auto xl:mt-0 flex flex-col xl:flex-row gap-2 xl:items-center">
          {/* Social Flip Buttons — hidden on mobile, shown on desktop */}
          <div className="hidden 2xl:block">
            <SocialFlipButton
              items={[
                { letter: "G", icon: <FaGithub />, label: "GitHub", href: "https://github.com" },
                { letter: "A", icon: <FaLinkedin />, label: "LinkedIn", href: "https://linkedin.com" },
                { letter: "T", icon: <FaInstagram />, label: "Instagram", href: "https://instagram.com" },
                { letter: "E", icon: <FaEnvelope />, label: "Email", href: "mailto:hello@gatepass.io" },
                { letter: "S", icon: <FaGlobe />, label: "Website", href: "#" },
              ]}
              className="!p-0 !gap-1"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (perspective === "attendee") {
                navigate("/identity");
              }
            }}
            disabled={perspective !== "attendee"}
            className="flex items-center gap-3 px-2 xl:px-0 cursor-pointer group hover:opacity-80 transition-opacity disabled:cursor-default"
          >
            <div className="hidden xl:block text-right">
              <h4 className="text-xs font-bold text-charcoal-dark group-hover:text-primary transition-colors">{user.name}</h4>
              <p className="text-[10px] text-outline uppercase font-semibold">Verified Member</p>
            </div>
            <img 
              src={user.avatarUrl} 
              alt={user.name} 
              className="w-10 h-10 xl:w-12 xl:h-12 rounded-full object-cover border border-outline-variant group-hover:border-primary transition-colors"
            />
            <div className="truncate xl:hidden">
              <h4 className="text-xs font-bold text-charcoal-dark truncate">{user.name}</h4>
              <p className="text-[10px] text-outline uppercase font-semibold">Verified Member</p>
            </div>
          </button>
        </div>
      </aside>

      {/* Screen background blocking mask on mobile view when menu is active */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 xl:hidden"
        />
      )}

      {/* Primary Layout Center */}
      <main className={`flex-1 max-w-full overflow-x-hidden xl:overflow-y-auto ${location.pathname === "/" || location.pathname === "/events" ? "p-0" : location.pathname === "/scanner" ? "px-4 py-4 sm:px-6 sm:py-6 xl:px-10 xl:py-10" : "px-6 py-6 xl:px-10 xl:py-10"}`}>
        
        {/* Dynamic Route Switching block */}
        <Routes>
          <Route path="/" element={<HomeUpdates onViewEvent={() => navigate("/events")} />} />
          <Route 
            path="/identity" 
            element={
              <IdentityCard 
                user={user}
                invitePasses={invitePasses}
                onNavigateToRequest={() => navigate("/request")}
                onNavigateToWallet={(pass) => {
                  setSelectedWalletPass(pass);
                  navigate("/wallet");
                }}
                onLoginSuccess={handleGoogleLoginSuccess}
                onLoginError={handleGoogleLoginError}
                onLogout={handleLogout}
                isAuthenticated={isAuthenticated}
                authEmail={authEmail}
              />
            } 
          />
          <Route 
            path="/request" 
            element={
              <RequestAccessForm 
                onBack={() => navigate("/")}
                onSubmitRequest={handleAddRequest}
              />
            } 
          />
          <Route 
            path="/approvals" 
            element={
              <ApprovalsInvites 
                requests={requests}
                invites={invitePasses}
                onApproveRequest={handleApproveRequest}
                onDenyRequest={handleDenyRequest}
                onRevokeInvite={handleRevokeInvite}
                onResendInvite={handleResendInvite}
                onToast={addToast}
              />
            } 
          />
          <Route 
            path="/wallet" 
            element={
              <WalletSync 
                user={user}
                selectedPass={selectedWalletPass}
              />
            } 
          />
          <Route 
            path="/events" 
            element={
              <AttendeeEventsList 
                events={events}
                user={user}
                onBookTicket={handleBookTicket}
              />
            } 
          />
          <Route 
            path="/organizer" 
            element={
              canAccessOrganizer ? <OrganizerWorkspace
                events={events}
                orders={orders}
                tickets={tickets}
                scanLogs={scanLogs}
                settlements={settlements}
                auditLogs={auditLogs}
                onAddNewEvent={handleAddNewEvent}
                onIssueManualTicket={handleIssueManualTicket}
                onProcessRefund={handleProcessRefund}
              /> : <Navigate to="/" replace />
            } 
          />
          <Route 
            path="/scanner" 
            element={<QRScannerSimulation onToast={addToast} />}
          />
          {/* Catch-all redirect to / */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Mobile Bottom Navigation Sticky Bar (Matches mockups strictly for touch convenience) */}
      <nav className="fixed bottom-0 left-0 w-full z-40 bg-white border-t border-outline-variant/30 py-2.5 px-4 flex justify-around items-center xl:hidden shadow-lg">
        {perspective === "attendee" ? (
          <>
            <NavLink
              to="/"
              end
              className={({ isActive }) => 
                `flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                  isActive ? "text-primary font-extrabold" : "text-on-surface-variant"
                }`
              }
            >
              <Sparkles className="w-5 h-5" />
              <span>Home</span>
            </NavLink>
            <NavLink
              to="/request"
              className={({ isActive }) => 
                `flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                  isActive ? "text-primary font-extrabold" : "text-on-surface-variant"
                }`
              }
            >
              <Calendar className="w-5 h-5" />
              <span>Requests</span>
            </NavLink>
            <NavLink
              to="/approvals"
              className={({ isActive }) => 
                `relative flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                  isActive ? "text-primary font-extrabold" : "text-on-surface-variant"
                }`
              }
            >
              <Bell className="w-5 h-5" />
              <span>Invites</span>
              {pendingApprovalsCount > 0 && (
                <span className="absolute -top-1 right-2 w-4 h-4 bg-status-danger rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                  {pendingApprovalsCount}
                </span>
              )}
            </NavLink>

            <NavLink
              to="/events"
              className={({ isActive }) => 
                `flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                  isActive ? "text-primary font-extrabold" : "text-on-surface-variant"
                }`
              }
            >
              <Sparkles className="w-5 h-5" />
              <span>Events</span>
            </NavLink>
            {hasScannerAccess && (
              <NavLink
                to="/scanner"
                className={({ isActive }) =>
                  `flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                    isActive ? "text-primary font-extrabold" : "text-on-surface-variant"
                  }`
                }
              >
                <Smartphone className="w-5 h-5" />
                <span>Scanner</span>
              </NavLink>
            )}
          </>
        ) : (
          <>
            <NavLink
              to="/organizer"
              className={({ isActive }) => 
                `flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                  isActive ? "text-primary font-extrabold" : "text-on-surface-variant"
                }`
              }
            >
              <TrendingUp className="w-5 h-5" />
              <span>Control Room</span>
            </NavLink>
            <NavLink
              to="/scanner"
              className={({ isActive }) => 
                `flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                  isActive ? "text-primary font-extrabold" : "text-on-surface-variant"
                }`
              }
            >
              <Smartphone className="w-5 h-5" />
              <span>Scanner Gate</span>
            </NavLink>
          </>
        )}
      </nav>
    </div>
  );
}
