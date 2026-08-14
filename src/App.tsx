import React, { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from "react-router-dom";
import { 
  INITIAL_USER
} from "./mockData";
import { createInitialAppState, type AppStateSnapshot } from "./appState";
import { loadAppState, saveAppState } from "./api";
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
import CoverUploadPage from "./pages/CoverUploadPage";
import HomeUpdates from "./pages/Home";
import LandingPage from "./pages/LandingPage";
import LoadingScreen from "./components/LoadingScreen";
import PostLoginIntro from "./components/PostLoginIntro";
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
  LogOut
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

const reasonOf = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "please try again";

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
  const [isLoaderMounted, setIsLoaderMounted] = useState(true);
  const [showPostLoginIntro, setShowPostLoginIntro] = useState(false);

  // Auth state (Issue #1 & #4)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [canAccessScanner, setCanAccessScanner] = useState(false);

  // Toast notifications (Issue #2)
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Selected pass for Wallet details
  const [selectedWalletPass, setSelectedWalletPass] = useState<InvitePass | undefined>(undefined);

  // Scroll-morph navbar state
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 40;
      if (scrolled !== isScrolled) {
        setIsScrolled(scrolled);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isScrolled]);

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
    setShowPostLoginIntro(false);
    sessionStorage.removeItem("neon_auth_token");
    sessionStorage.removeItem("neon_auth_email");
    sessionStorage.removeItem("gatepass_post_login_intro_shown");
    addToast("info", "You have been signed out.");
  };

  const handlePostLoginIntroComplete = useCallback(() => {
    sessionStorage.setItem("gatepass_post_login_intro_shown", "true");
    setShowPostLoginIntro(false);
  }, []);

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
          if (sessionStorage.getItem("gatepass_post_login_intro_shown") !== "true") {
            setShowPostLoginIntro(true);
          }
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
  const handleAddNewEvent = async (newEvent: EventItem): Promise<boolean> => {
    const updated = [newEvent, ...events];

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
    const updatedSettlements = [newSettlement, ...settlements];

    const addedAudit: AuditLog = {
      id: "aud_" + Date.now(),
      timestamp: new Date().toISOString(),
      actor: "Event Coordinator",
      action: "Event Published",
      details: `Published "${newEvent.title}" (${newEvent.eventType}) at ${newEvent.venue}.`
    };
    const nextAudit = [addedAudit, ...auditLogs];

    try {
      await saveAppState({
        ...currentStateSnapshot(),
        events: updated,
        settlements: updatedSettlements,
        auditLogs: nextAudit,
      });
      const readBack = await loadAppState();
      const persisted = readBack?.events.find((event) => event.id === newEvent.id);
      if (!persisted || persisted.bannerUrl !== newEvent.bannerUrl) {
        throw new Error("Event cover read-back did not match the committed value");
      }

      persistState("gps_events", updated, setEvents);
      persistState("gps_settlements", updatedSettlements, setSettlements);
      persistState("gps_auditlogs", nextAudit, setAuditLogs);
      return true;
    } catch (error) {
      console.warn("Event database save failed:", error);
      addToast("error", `Failed to save "${newEvent.title}": ${reasonOf(error)}`);
      return false;
    }
  };

  // Resolves true only once the new cover is committed to the database. The
  // debounced autosave is fire-and-forget and swallows its failures, so a cover
  // reported as "updated" on the strength of local state alone was a false
  // success — the preview looked right until a refresh went back to the server.
  const handleUpdateEventCover = async (
    eventId: string,
    newCoverUrl: string,
    configUpdates?: Partial<import("./types").CoverUploadLinkConfig>
  ): Promise<boolean> => {
    const removingCover = configUpdates?.hasCustomCover === false;
    const updatedEvents = events.map((ev) => {
      if (ev.id === eventId) {
        const existingConfig = ev.coverUploadConfig || {
          token: "default",
          createdAt: new Date().toISOString()
        };
        return {
          ...ev,
          bannerUrl: newCoverUrl,
          coverUploadConfig: {
            ...existingConfig,
            ...configUpdates,
            hasCustomCover: !removingCover,
            lastUpdated: new Date().toISOString()
          }
        };
      }
      return ev;
    });
    const targetTitle = events.find(e => e.id === eventId)?.title || "Event";

    const addedAudit: AuditLog = {
      id: "aud_" + Date.now(),
      timestamp: new Date().toISOString(),
      actor: "Cover Upload Portal",
      action: removingCover ? "Cover Photo Removed" : "Cover Photo Updated",
      details: `${removingCover ? "Removed" : "Updated"} cover photo for event '${targetTitle}'.`
    };
    const updatedAuditLogs = [addedAudit, ...auditLogs];

    try {
      await saveAppState({
        ...currentStateSnapshot(),
        events: updatedEvents,
        auditLogs: updatedAuditLogs,
      });
      const readBack = await loadAppState();
      const persisted = readBack?.events.find((event) => event.id === eventId);
      if (!persisted || persisted.bannerUrl !== newCoverUrl) {
        throw new Error("Event cover read-back did not match the committed value");
      }

      persistState("gps_events", updatedEvents, setEvents);
      persistState("gps_auditlogs", updatedAuditLogs, setAuditLogs);
      addToast("success", `Cover photo ${removingCover ? "removed" : "updated"} for "${targetTitle}"!`);
      return true;
    } catch (error) {
      console.warn("Cover photo save failed:", error);
      addToast("error", `Cover photo for "${targetTitle}" could not be saved: ${reasonOf(error)}`);
      return false;
    }
  };

  const handleUpdateEventCoverConfig = (
    eventId: string,
    config: import("./types").CoverUploadLinkConfig
  ) => {
    const updatedEvents = events.map((ev) => {
      if (ev.id === eventId) {
        return {
          ...ev,
          coverUploadConfig: config
        };
      }
      return ev;
    });
    persistState("gps_events", updatedEvents, setEvents);
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

  if (showPostLoginIntro && isAuthenticated) {
    return (
      <PostLoginIntro
        userEmail={authEmail}
        onComplete={handlePostLoginIntroComplete}
      />
    );
  }

  if (isLoaderMounted) {
    return (
      <LoadingScreen
        isHydrated={isHydrated}
        onExitComplete={() => setIsLoaderMounted(false)}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background font-sans text-on-background animate-app-enter">
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
    <div className="min-h-screen xl:h-screen bg-background font-sans text-on-background flex flex-col xl:overflow-hidden pb-20 xl:pb-0 animate-app-enter">
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
      
      {/* Sticky Top Navbar Container (Reserves document flow height cleanly without overlapping page content) */}
      <header className={`sticky top-0 z-50 w-full bg-[#F3EEEB]/90 backdrop-blur-md border-b border-black/10 transition-all duration-300 ${
        isScrolled ? "h-[72px]" : "h-[88px]"
      }`}>
        {/* Mobile Top Header (shown on xl:hidden) */}
        <div className="w-full h-full px-4 sm:px-6 flex justify-between items-center xl:hidden">
          <div className="flex items-center gap-1.5">
            <div>
              <h1 className="text-base font-black text-[#171719] tracking-tight uppercase">GatePass</h1>
              <p className="text-[9px] uppercase tracking-wider text-[#938C87] font-bold">Organizer &amp; Entry OS</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canAccessOrganizer && (
              <button
                onClick={() => handlePerspectiveSwitch(perspective === "attendee" ? "organizer" : "attendee")}
                className="text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1 bg-[#171719] text-[#F8F5F2]"
              >
                {perspective === "attendee" ? "Organizer Mode" : "User Mode"}
              </button>
            )}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="grid size-11 place-items-center rounded-lg hover:bg-black/5 text-[#171719]"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="primary-navigation-drawer"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Desktop Reference-Style 3-Zone Navbar */}
        <div className="hidden xl:flex w-full h-full max-w-[1720px] mx-auto px-8 xl:px-12 items-center justify-between">
          {/* GROUP 1: LEFT AREA — BRAND LOGO + PERSPECTIVE MODE TOGGLE */}
          <div className="flex items-center gap-6 flex-shrink-0">
            {/* Logo and Connection Status */}
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl xl:text-3xl font-black text-[#171719] tracking-tighter uppercase leading-none">
                GatePass
              </h1>
              <div 
                className={`w-2.5 h-2.5 rounded-full ml-1 flex-shrink-0 ${
                  backendStatus === "connected" ? "bg-emerald-400" :
                  backendStatus === "offline" ? "bg-amber-400" :
                  "bg-gray-300 animate-pulse"
                }`} 
                title={backendStatus === "connected" ? "Connected" : backendStatus === "offline" ? "Offline mode" : "Connecting..."} 
              />
            </div>

            {/* Perspective Selector Swapper */}
            {canAccessOrganizer && (
              <div className="bg-[#F8F5F2]/80 p-1 rounded-xl flex items-center gap-1 border border-black/10 flex-shrink-0">
                <button
                  onClick={() => {
                    handlePerspectiveSwitch("attendee");
                    setMobileMenuOpen(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                    perspective === "attendee" 
                      ? "bg-[#171719] text-[#F8F5F2] shadow-sm" 
                      : "text-[#625B57] hover:text-[#171719]"
                  }`}
                >
                  Attendee
                </button>
                <button
                  onClick={() => {
                    handlePerspectiveSwitch("organizer");
                    setMobileMenuOpen(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                    perspective === "organizer"
                      ? "bg-[#171719] text-[#F8F5F2] shadow-sm"
                      : "text-[#625B57] hover:text-[#171719]"
                  }`}
                >
                  Organizer
                </button>
              </div>
            )}
          </div>

          {/* GROUP 2: CENTER AREA — COMPACT REAL FROSTED GLASS NAVIGATION CAPSULE */}
          <nav className={`w-fit mx-auto h-[42px] p-[4px] rounded-[19px] border border-white/26 backdrop-blur-[18px] backdrop-saturate-[125%] shadow-[0_6px_24px_rgba(32,27,24,0.05),inset_0_1px_0_rgba(255,255,255,0.30),inset_0_-1px_0_rgba(255,255,255,0.08)] flex items-center gap-1 transition-all duration-300 ${
            isScrolled 
              ? "bg-gradient-to-br from-white/26 to-white/14 backdrop-blur-[20px] backdrop-saturate-[130%] shadow-[0_8px_28px_rgba(32,27,24,0.08),inset_0_1px_0_rgba(255,255,255,0.36)]" 
              : "bg-gradient-to-br from-white/22 to-white/10"
          }`}>
            {perspective === "attendee" ? (
              /* ATTENDEE ROUTES */
              <>
                <NavLink
                  to="/"
                  end
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `h-[32px] px-3 rounded-[13px] flex items-center justify-center text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-160 cursor-pointer ${
                      isActive 
                        ? "bg-white/34 text-[#171719] border border-white/24 shadow-[0_2px_8px_rgba(32,27,24,0.04),inset_0_1px_0_rgba(255,255,255,0.36)] font-extrabold" 
                        : "text-[#171719]/65 hover:text-[#171719] hover:bg-white/18"
                    }`
                  }
                >
                  <span>Home</span>
                </NavLink>

                <NavLink
                  to="/request"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `h-[32px] px-3 rounded-[13px] flex items-center justify-center text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-160 cursor-pointer ${
                      isActive 
                        ? "bg-white/34 text-[#171719] border border-white/24 shadow-[0_2px_8px_rgba(32,27,24,0.04),inset_0_1px_0_rgba(255,255,255,0.36)] font-extrabold" 
                        : "text-[#171719]/65 hover:text-[#171719] hover:bg-white/18"
                    }`
                  }
                >
                  <span>Request Temp Access</span>
                </NavLink>

                <NavLink
                  to="/approvals"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `h-[32px] px-3 rounded-[13px] flex items-center justify-center text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-160 cursor-pointer relative ${
                      isActive 
                        ? "bg-white/34 text-[#171719] border border-white/24 shadow-[0_2px_8px_rgba(32,27,24,0.04),inset_0_1px_0_rgba(255,255,255,0.36)] font-extrabold" 
                        : "text-[#171719]/65 hover:text-[#171719] hover:bg-white/18"
                    }`
                  }
                >
                  <span>Approvals &amp; Invites</span>
                  {pendingApprovalsCount > 0 && (
                    <span className="absolute -right-1 -top-1 w-4 h-4 bg-status-danger rounded-full text-[9px] font-bold text-white flex items-center justify-center animate-bounce border border-white">
                      <AnimatedNumber value={pendingApprovalsCount} className="text-[9px]" />
                    </span>
                  )}
                </NavLink>

                <NavLink
                  to="/events"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `h-[32px] px-3 rounded-[13px] flex items-center justify-center text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-160 cursor-pointer ${
                      isActive 
                        ? "bg-white/34 text-[#171719] border border-white/24 shadow-[0_2px_8px_rgba(32,27,24,0.04),inset_0_1px_0_rgba(255,255,255,0.36)] font-extrabold" 
                        : "text-[#171719]/65 hover:text-[#171719] hover:bg-white/18"
                    }`
                  }
                >
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
                    `h-[32px] px-3 rounded-[13px] flex items-center justify-center text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-160 cursor-pointer ${
                      isActive 
                        ? "bg-white/34 text-[#171719] border border-white/24 shadow-[0_2px_8px_rgba(32,27,24,0.04),inset_0_1px_0_rgba(255,255,255,0.36)] font-extrabold" 
                        : "text-[#171719]/65 hover:text-[#171719] hover:bg-white/18"
                    }`
                  }
                >
                  <span>Control Room &amp; Workspace</span>
                </NavLink>

                <NavLink
                  to="/scanner"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `h-[32px] px-3 rounded-[13px] flex items-center justify-center text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-160 cursor-pointer ${
                      isActive 
                        ? "bg-white/34 text-[#171719] border border-white/24 shadow-[0_2px_8px_rgba(32,27,24,0.04),inset_0_1px_0_rgba(255,255,255,0.36)] font-extrabold" 
                        : "text-[#171719]/65 hover:text-[#171719] hover:bg-white/18"
                    }`
                  }
                >
                  <span>Gate Checkout Scanner</span>
                </NavLink>
              </>
            )}
          </nav>

          {/* GROUP 3: RIGHT AREA — GATES FLIP CONTROLS + USER PROFILE */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* GATES Interactive Control */}
            <div className="hidden 2xl:block flex-shrink-0">
              <SocialFlipButton
                items={[
                  { letter: "G", icon: <FaGithub />, label: "GitHub", href: "https://github.com" },
                  { letter: "A", icon: <FaLinkedin />, label: "LinkedIn", href: "https://linkedin.com" },
                  { letter: "T", icon: <FaInstagram />, label: "Instagram", href: "https://instagram.com" },
                  { letter: "E", icon: <FaEnvelope />, label: "Email", href: "mailto:hello@gatepass.io" },
                  { letter: "S", icon: <FaGlobe />, label: "Website", href: "#" },
                ]}
                className="!p-0"
                containerClassName="!p-[6px] !px-2.5 !gap-[5px] !rounded-[15px] !bg-[#171719] !border-white/10 h-[46px] shadow-sm"
                itemClassName="!w-[31px] !h-[31px]"
                frontClassName="!bg-white/8 !text-[#F8F5F2] !text-[16px] !font-extrabold !rounded-[9px] !border !border-white/5"
                backClassName="!bg-black !text-white !text-sm !rounded-[9px]"
              />
            </div>

            {/* User Avatar + Profile details */}
            <button
              type="button"
              onClick={() => {
                if (perspective === "attendee") {
                  navigate("/identity");
                }
              }}
              disabled={perspective !== "attendee"}
              className="flex items-center gap-3 cursor-pointer group hover:opacity-80 transition-opacity disabled:cursor-default"
            >
              <div className="text-right">
                <h4 className="text-xs font-bold text-[#171719] group-hover:text-[#42566E] transition-colors">{user.name}</h4>
                <p className="text-[10px] text-[#938C87] uppercase font-semibold">Verified Member</p>
              </div>
              <img 
                src={user.avatarUrl} 
                alt={user.name} 
                className="w-11 h-11 rounded-full object-cover border border-black/10 group-hover:border-[#42566E] transition-all duration-300"
              />
            </button>
          </div>
        </div>
      </header>

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
                onUpdateEventCoverConfig={handleUpdateEventCoverConfig}
                onUpdateEventCover={handleUpdateEventCover}
              /> : <Navigate to="/" replace />
            } 
          />
          <Route
            path="/event/:eventId/cover-upload"
            element={
              <CoverUploadPage
                events={events}
                onUpdateEventCover={handleUpdateEventCover}
              />
            }
          />
          <Route
            path="/cover-upload/:eventId"
            element={
              <CoverUploadPage
                events={events}
                onUpdateEventCover={handleUpdateEventCover}
              />
            }
          />
          <Route
            path="/scanner" 
            element={<QRScannerSimulation onToast={addToast} />}
          />
          <Route 
            path="/security-simulator" 
            element={<Navigate to="/organizer?tab=security" replace />}
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
