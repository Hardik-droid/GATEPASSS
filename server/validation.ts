import { z } from "zod";

const requiredString = z.string().trim().min(1).max(5000);
const optionalString = z.string().max(5000).optional();
const money = z.coerce.number().finite().min(0);
const count = z.coerce.number().int().min(0);

const userSchema = z.object({
  id: requiredString.max(160),
  name: requiredString.max(200),
  email: z.string().email().max(320),
  phone: requiredString.max(80),
  role: z.enum(["Owner", "Event Manager", "Finance Manager", "Gate Staff", "Scanner Staff", "Attendee"]),
  avatarUrl: z.string().url().max(3000),
  studentId: optionalString,
  currentZone: optionalString,
  clearanceLevel: optionalString,
});

const ticketCategorySchema = z.object({
  id: requiredString.max(160),
  eventId: requiredString.max(160),
  name: requiredString.max(200),
  description: requiredString,
  price: money,
  capacity: count,
  soldCount: count,
});

const eventSchema = z.object({
  id: requiredString.max(160),
  title: requiredString.max(240),
  description: requiredString,
  eventType: requiredString.max(120),
  venue: requiredString.max(240),
  startTime: requiredString.max(80),
  endTime: requiredString.max(80),
  bannerUrl: z.string().url().max(3000),
  capacity: count,
  ticketCategories: z.array(ticketCategorySchema).max(100),
});

const orderSchema = z.object({
  id: requiredString.max(160),
  eventId: requiredString.max(160),
  buyerName: requiredString.max(200),
  buyerEmail: z.string().email().max(320),
  buyerPhone: requiredString.max(80),
  paymentStatus: z.enum(["pending", "paid", "failed"]),
  grossAmount: money,
  platformFee: money,
  gatewayFee: money,
  netAmount: z.coerce.number().finite(),
  paymentMethod: z.enum(["online", "cash", "free", "upi"]).transform((value) => (value === "upi" ? "online" : value)),
  created_at: requiredString.max(80),
});

const ticketSchema = z.object({
  id: requiredString.max(160),
  eventId: requiredString.max(160),
  orderId: requiredString.max(160),
  categoryName: requiredString.max(200),
  price: money,
  attendeeName: requiredString.max(200),
  attendeePhone: requiredString.max(80),
  attendeeEmail: z.string().email().max(320),
  qrToken: requiredString.max(500),
  status: z.enum(["draft", "available", "reserved", "paid", "issued", "checked_in", "cancelled", "refunded", "expired"]),
  issuedAt: requiredString.max(80),
  checkedInAt: optionalString,
  gateScanned: optionalString,
  scannedBy: optionalString,
});

const accessRequestSchema = z.object({
  id: requiredString.max(160),
  requesterName: requiredString.max(200),
  requesterAvatarUrl: z.string().max(3000).optional(),
  zoneName: requiredString.max(240),
  durationHours: requiredString.max(80),
  purpose: requiredString,
  status: z.enum(["pending", "approved", "denied"]),
  requestTime: requiredString.max(120),
});

const invitePassSchema = z.object({
  id: requiredString.max(160),
  title: requiredString.max(240),
  category: z.enum(["INVITE", "PRE-APPROVED", "CONTRACTOR", "DELIVERY", "EVENT"]),
  subCategory: requiredString.max(200),
  passIdCode: requiredString.max(160),
  status: z.enum(["APPROVED", "PENDING", "EXPIRED", "REVOKED"]),
  validityText: requiredString.max(240),
  usageText: requiredString.max(240),
  usageType: z.enum(["limited", "unlimited"]),
  entriesTotal: count.optional(),
  entriesUsed: count.optional(),
  qrToken: requiredString.max(500),
});

const scanLogSchema = z.object({
  id: requiredString.max(160),
  ticketId: requiredString.max(160),
  eventId: requiredString.max(160),
  eventName: requiredString.max(240),
  attendeeName: requiredString.max(200),
  categoryName: requiredString.max(200),
  scanResult: z.enum(["VALID", "ALREADY_USED", "INVALID", "WRONG_EVENT", "CANCELLED", "REFUNDED"]),
  scanTime: requiredString.max(120),
  gateName: requiredString.max(160),
  scannedBy: requiredString.max(200),
});

const settlementSchema = z.object({
  id: requiredString.max(160),
  eventId: requiredString.max(160),
  eventName: requiredString.max(240),
  grossSales: money,
  totalRefunds: money,
  platformFees: money,
  gatewayFees: money,
  manualCollections: money,
  netSettlement: z.coerce.number().finite(),
  status: z.enum(["pending", "processing", "settled"]),
  settledAt: optionalString,
});

const auditLogSchema = z.object({
  id: requiredString.max(160),
  timestamp: requiredString.max(120),
  actor: requiredString.max(200),
  action: requiredString.max(240),
  details: requiredString,
});

export const appStateSchema = z.object({
  user: userSchema,
  requests: z.array(accessRequestSchema).max(1000),
  invitePasses: z.array(invitePassSchema).max(5000),
  events: z.array(eventSchema).max(1000),
  orders: z.array(orderSchema).max(10000),
  tickets: z.array(ticketSchema).max(20000),
  scanLogs: z.array(scanLogSchema).max(50000),
  settlements: z.array(settlementSchema).max(2000),
  auditLogs: z.array(auditLogSchema).max(50000),
});

export const statePayloadSchema = z.object({
  state: appStateSchema,
});

export type ValidAppState = z.infer<typeof appStateSchema>;

