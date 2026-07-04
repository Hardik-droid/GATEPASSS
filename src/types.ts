export interface Organization {
  id: string;
  name: string;
  type: string;
  contactEmail: string;
  contactPhone: string;
  created_at: string;
}

export enum UserRole {
  OWNER = "Owner",
  EVENT_MANAGER = "Event Manager",
  FINANCE_MANAGER = "Finance Manager",
  GATE_STAFF = "Gate Staff",
  SCANNER_STAFF = "Scanner Staff",
  ATTENDEE = "Attendee",
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatarUrl: string;
  studentId?: string;
  currentZone?: string;
  clearanceLevel?: string;
}

export enum TicketStatus {
  DRAFT = "draft",
  AVAILABLE = "available",
  RESERVED = "reserved",
  PAID = "paid",
  ISSUED = "issued",
  CHECKED_IN = "checked_in",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
  EXPIRED = "expired",
}

export interface TicketCategory {
  id: string;
  eventId: string;
  name: string;
  description: string;
  price: number; // 0 for free
  capacity: number;
  soldCount: number;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  eventType: string; // e.g. "College Fest", "Marathon", "Workshop", "Open Mic"
  venue: string;
  startTime: string;
  endTime: string;
  bannerUrl: string;
  capacity: number;
  ticketCategories: TicketCategory[];
}

export interface Order {
  id: string;
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  paymentStatus: "pending" | "paid" | "failed";
  grossAmount: number;
  platformFee: number;
  gatewayFee: number;
  netAmount: number;
  paymentMethod: "online" | "cash" | "free";
  created_at: string;
}

export interface Ticket {
  id: string;
  eventId: string;
  orderId: string;
  categoryName: string;
  price: number;
  attendeeName: string;
  attendeePhone: string;
  attendeeEmail: string;
  qrToken: string;
  status: TicketStatus;
  issuedAt: string;
  checkedInAt?: string;
  gateScanned?: string;
  scannedBy?: string;
}

export interface AccessRequest {
  id: string;
  requesterName: string;
  requesterAvatarUrl?: string;
  zoneName: string;
  durationHours: string;
  purpose: string;
  status: "pending" | "approved" | "denied";
  requestTime: string;
}

export interface InvitePass {
  id: string;
  title: string;
  category: "INVITE" | "PRE-APPROVED" | "CONTRACTOR" | "DELIVERY" | "EVENT";
  subCategory: string; // e.g. "Hostel B", "Main Campus"
  passIdCode: string;
  status: "APPROVED" | "PENDING" | "EXPIRED" | "REVOKED";
  validityText: string;
  usageText: string;
  usageType: "limited" | "unlimited";
  entriesTotal?: number;
  entriesUsed?: number;
  qrToken: string;
}

export interface ScanLog {
  id: string;
  ticketId: string;
  eventId: string;
  eventName: string;
  attendeeName: string;
  categoryName: string;
  scanResult: "VALID" | "ALREADY_USED" | "INVALID" | "WRONG_EVENT" | "CANCELLED" | "REFUNDED";
  scanTime: string;
  gateName: string;
  scannedBy: string;
}

export interface Settlement {
  id: string;
  eventId: string;
  eventName: string;
  grossSales: number;
  totalRefunds: number;
  platformFees: number;
  gatewayFees: number;
  manualCollections: number;
  netSettlement: number;
  status: "pending" | "processing" | "settled";
  settledAt?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
}
