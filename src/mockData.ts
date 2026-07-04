import {
  UserProfile,
  UserRole,
  EventItem,
  Order,
  Ticket,
  TicketStatus,
  AccessRequest,
  InvitePass,
  ScanLog,
  Settlement,
  AuditLog
} from "./types";

export const INITIAL_USER: UserProfile = {
  id: "u1",
  name: "Hardik Jain",
  email: "hardik.jain@college.edu",
  phone: "+91 98765 43210",
  role: UserRole.ATTENDEE,
  avatarUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuDj7mTK90opxu1ESzTxIAf19q8xnUwTA4P0ugcXJO9_Is5Uy6_piGMEBrMx_Oi5MutYjhOQAblGTptgy9VUGxN1yzuLSK7IhhIDwhzmsp_-aMuDDE9TTa5VH7Cj_qqTMAYpvlzJjzC4HU8iMK3ypBb2ThAipsumxWjwaVoj-tGKaQ5eT8OfmPTWsp8iiBP0qxxUTEMnbnzBEwTG8UkzY2Pse_6ZZzptt2z09qRDKuaSO3QIbPgvQJbtVQ",
  studentId: "894-32A",
  currentZone: "Main Campus",
  clearanceLevel: "Level 2"
};

export const INITIAL_ACCESS_REQUESTS: AccessRequest[] = [
  {
    id: "req1",
    requesterName: "Hardik Sharma",
    requesterAvatarUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuC0sxSL3fD9vyEuckIw6sbtDPhs8OQ3xaFV923IDdGXl8E4PFDFOFcsmIQnwFW_xX-Xj1-S9rF-7eJO-vKyofVvThpTYHnT27KDB8NjQnMDa9AmpC06Klpvg5LFtY9hFTxFLOebVDVOaPanZq23h7LKukGfrXbu5gR9HnoKZBMoApC0S6q1M8z9zvxmKLE76EET5GwXW2rhuOBy5P0t9I7RCGLOX5S4dT4cEpZ1NQ4WvPdLb_vuLc0RfA",
    zoneName: "Hostel B • Ground Floor",
    durationHours: "3 Hours",
    purpose: "Requested access for study group session in Common Room B.",
    status: "pending",
    requestTime: "Today, 11:15 AM"
  },
  {
    id: "req2",
    requesterName: "Anita Lopez",
    requesterAvatarUrl: "", // Displays 'AL' avatar
    zoneName: "Server Room A • Level 2",
    durationHours: "2 Hours",
    purpose: "Emergency maintenance. Temp access requested for 2 hours.",
    status: "pending",
    requestTime: "Today, 10:45 AM"
  }
];

export const INITIAL_INVITE_PASSES: InvitePass[] = [
  {
    id: "p1",
    title: "Guest Access",
    category: "INVITE",
    subCategory: "Hostel B",
    passIdCode: "HB-8842-VX",
    status: "APPROVED",
    validityText: "Expires in 3h",
    usageText: "1 OF 4 ENTRIES USED",
    usageType: "limited",
    entriesTotal: 4,
    entriesUsed: 1,
    qrToken: "TOKEN_HB_8842_VX"
  },
  {
    id: "p2",
    title: "Visitor Pass",
    category: "PRE-APPROVED",
    subCategory: "Main Campus",
    passIdCode: "MC-VIS-991",
    status: "APPROVED",
    validityText: "Valid Tomorrow",
    usageText: "UNLIMITED ENTRIES (24H)",
    usageType: "unlimited",
    qrToken: "TOKEN_MC_VIS_991"
  },
  {
    id: "p3",
    title: "Visitor Pass: Sarah Connor",
    category: "PRE-APPROVED",
    subCategory: "Main Campus",
    passIdCode: "VST-8924",
    status: "APPROVED",
    validityText: "Valid: Today, 2:00 PM - 6:00 PM",
    usageText: "SINGLE ENTRY",
    usageType: "limited",
    entriesTotal: 1,
    entriesUsed: 0,
    qrToken: "TOKEN_VST_8924"
  },
  {
    id: "p4",
    title: "Contractor: Elite Tech Services",
    category: "CONTRACTOR",
    subCategory: "Server Room A",
    passIdCode: "CTR-4412",
    status: "PENDING",
    validityText: "Requested for: Tomorrow, 9:00 AM",
    usageText: "UNLIMITED ENTRIES",
    usageType: "unlimited",
    qrToken: "TOKEN_CTR_4412"
  },
  {
    id: "p5",
    title: "Delivery: Amazon",
    category: "DELIVERY",
    subCategory: "Academic Block",
    passIdCode: "DLV-1029",
    status: "EXPIRED",
    validityText: "Expired: Oct 24, 2023",
    usageText: "SINGLE ENTRY (EXPIRED)",
    usageType: "limited",
    entriesTotal: 1,
    entriesUsed: 1,
    qrToken: "TOKEN_DLV_1029"
  }
];

export const INITIAL_EVENTS: EventItem[] = [
  {
    id: "ev1",
    title: "Aura Fest 2026",
    description: "The grand annual cultural festival featuring music bands, design showcases, dance face-offs, and fine arts exhibits.",
    eventType: "College Fest",
    venue: "Main Stadium & OAT",
    startTime: "2026-07-05T09:00",
    endTime: "2026-07-05T22:00",
    bannerUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80",
    capacity: 2000,
    ticketCategories: [
      { id: "cat1_1", eventId: "ev1", name: "General Pass", description: "Regular festival access", price: 299, capacity: 1500, soldCount: 1142 },
      { id: "cat1_2", eventId: "ev1", name: "VIP Backstage Pass", description: "Front-row seats + food coupon", price: 999, capacity: 200, soldCount: 185 },
      { id: "cat1_3", eventId: "ev1", name: "Faculty / Staff", description: "Complimentary access for personnel", price: 0, capacity: 300, soldCount: 120 }
    ]
  },
  {
    id: "ev2",
    title: "Greenfield 10K Marathon",
    description: "Annual green city run promoting fitness and climate awareness. High-performance RFID bib mapping included.",
    eventType: "Marathon",
    venue: "South Campus Outer Ring",
    startTime: "2026-07-12T06:00",
    endTime: "2026-07-12T11:00",
    bannerUrl: "https://images.unsplash.com/photo-1502224562085-639556652f33?w=800&auto=format&fit=crop&q=80",
    capacity: 1000,
    ticketCategories: [
      { id: "cat2_1", eventId: "ev2", name: "Marathon 10K Run", description: "Official bib + timing chip + T-shirt", price: 450, capacity: 600, soldCount: 420 },
      { id: "cat2_2", eventId: "ev2", name: "Marathon 5K Run", description: "Fun run category, finisher medal", price: 250, capacity: 400, soldCount: 310 }
    ]
  },
  {
    id: "ev3",
    title: "GenAI Product Workshop",
    description: "Hands-on engineering workshop using Google Gemini Flash SDK and building low-latency production applications.",
    eventType: "Workshop",
    venue: "Auditorium Hall B",
    startTime: "2026-07-18T10:00",
    endTime: "2026-07-18T16:00",
    bannerUrl: "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&auto=format&fit=crop&q=80",
    capacity: 150,
    ticketCategories: [
      { id: "cat3_1", eventId: "ev3", name: "Developer Ticket", description: "Include digital certificate and resource kit", price: 199, capacity: 120, soldCount: 95 },
      { id: "cat3_2", eventId: "ev3", name: "Student Sponsorship Pass", description: "Free for verified students on approval", price: 0, capacity: 30, soldCount: 28 }
    ]
  },
  {
    id: "ev4",
    title: "Rock En Seine (featuring Billie Eilish)",
    description: "The premier Parisian music festival featuring an exclusive headline performance by Billie Eilish at Domaine Saint-Cloud.",
    eventType: "Concert",
    venue: "Domaine Saint-Cloud, Paris",
    startTime: "2026-11-24T18:00",
    endTime: "2026-11-24T23:30",
    bannerUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80",
    capacity: 15000,
    ticketCategories: [
      { id: "cat4_1", eventId: "ev4", name: "General Admission", description: "Standard access to all festival stages", price: 5500, capacity: 14000, soldCount: 11400 },
      { id: "cat4_2", eventId: "ev4", name: "VIP Platform Pass", description: "Elevated stage view + exclusive lounge bar", price: 12000, capacity: 1000, soldCount: 890 }
    ]
  },
  {
    id: "ev5",
    title: "We Love Green (featuring SZA)",
    description: "The eco-pioneering festival in Bois de Vincennes. Dynamic alternative indie, electronic music, and r&b featuring SZA.",
    eventType: "Concert",
    venue: "Bois de Vincennes, Paris",
    startTime: "2026-12-01T17:00",
    endTime: "2026-12-01T23:00",
    bannerUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop&q=80",
    capacity: 12000,
    ticketCategories: [
      { id: "cat5_1", eventId: "ev5", name: "Pass 1-Day Standard", description: "Regular 1-day eco admission", price: 4900, capacity: 11000, soldCount: 9200 },
      { id: "cat5_2", eventId: "ev5", name: "Pass Eco-Premium", description: "Dedicated express gate line + premium stalls", price: 9500, capacity: 1000, soldCount: 750 }
    ]
  },
  {
    id: "ev6",
    title: "Afterlife: Tale Of Us, Adriatique, KAS:ST & Colyn",
    description: "An immersive audiovisual odyssey by Afterlife records at the monumental Roman ruins of Theatre Antique, Orange.",
    eventType: "Concert",
    venue: "Theatre Antique, Orange",
    startTime: "2026-08-21T18:00",
    endTime: "2026-08-22T01:30",
    bannerUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200&auto=format&fit=crop&q=80",
    capacity: 8000,
    ticketCategories: [
      { id: "cat6_1", eventId: "ev6", name: "Arena General Access", description: "Standing arena tier pass", price: 6500, capacity: 7500, soldCount: 6800 },
      { id: "cat6_2", eventId: "ev6", name: "VIP Ancient Terraces", description: "Premium elevated seats on ancient ruins + VIP bars", price: 15000, capacity: 500, soldCount: 420 }
    ]
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: "ord_101",
    eventId: "ev1",
    buyerName: "Hardik Jain",
    buyerEmail: "hardik.jain@college.edu",
    buyerPhone: "+91 98765 43210",
    paymentStatus: "paid",
    grossAmount: 299,
    platformFee: 10,
    gatewayFee: 4.5,
    netAmount: 284.5,
    paymentMethod: "online",
    created_at: "2026-07-04T09:30:00Z"
  },
  {
    id: "ord_102",
    eventId: "ev1",
    buyerName: "Sarah Connor",
    buyerEmail: "sarah.connor@sky.net",
    buyerPhone: "+91 98989 12345",
    paymentStatus: "paid",
    grossAmount: 999,
    platformFee: 10,
    gatewayFee: 15.0,
    netAmount: 974.0,
    paymentMethod: "online",
    created_at: "2026-07-04T09:42:00Z"
  },
  {
    id: "ord_103",
    eventId: "ev2",
    buyerName: "Siddharth Mehta",
    buyerEmail: "sid.mehta@gmail.com",
    buyerPhone: "+91 95432 98765",
    paymentStatus: "paid",
    grossAmount: 450,
    platformFee: 10,
    gatewayFee: 6.75,
    netAmount: 433.25,
    paymentMethod: "online",
    created_at: "2026-07-04T10:15:00Z"
  },
  {
    id: "ord_104",
    eventId: "ev3",
    buyerName: "Rohan Gupta",
    buyerEmail: "rohan.gupta@outlook.com",
    buyerPhone: "+91 91234 56789",
    paymentStatus: "paid",
    grossAmount: 199,
    platformFee: 10,
    gatewayFee: 3.0,
    netAmount: 186.0,
    paymentMethod: "cash",
    created_at: "2026-07-04T11:00:00Z"
  }
];

export const INITIAL_TICKETS: Ticket[] = [
  {
    id: "tkt_101_1",
    eventId: "ev1",
    orderId: "ord_101",
    categoryName: "General Pass",
    price: 299,
    attendeeName: "Hardik Jain",
    attendeePhone: "+91 98765 43210",
    attendeeEmail: "hardik.jain@college.edu",
    qrToken: "TKT_E1_C1_984A_101",
    status: TicketStatus.ISSUED,
    issuedAt: "2026-07-04T09:30:10Z"
  },
  {
    id: "tkt_102_1",
    eventId: "ev1",
    orderId: "ord_102",
    categoryName: "VIP Backstage Pass",
    price: 999,
    attendeeName: "Sarah Connor",
    attendeePhone: "+91 98989 12345",
    attendeeEmail: "sarah.connor@sky.net",
    qrToken: "TKT_E1_C2_736C_102",
    status: TicketStatus.CHECKED_IN,
    issuedAt: "2026-07-04T09:42:15Z",
    checkedInAt: "2026-07-04T11:15:00-07:00",
    gateScanned: "Main Gate",
    scannedBy: "Officer Mehra"
  },
  {
    id: "tkt_103_1",
    eventId: "ev2",
    orderId: "ord_103",
    categoryName: "Marathon 10K Run",
    price: 450,
    attendeeName: "Siddharth Mehta",
    attendeePhone: "+91 95432 98765",
    attendeeEmail: "sid.mehta@gmail.com",
    qrToken: "TKT_E2_C1_851F_103",
    status: TicketStatus.ISSUED,
    issuedAt: "2026-07-04T10:15:10Z"
  },
  {
    id: "tkt_104_1",
    eventId: "ev3",
    orderId: "ord_104",
    categoryName: "Developer Ticket",
    price: 199,
    attendeeName: "Rohan Gupta",
    attendeePhone: "+91 91234 56789",
    attendeeEmail: "rohan.gupta@outlook.com",
    qrToken: "TKT_E3_C1_429A_104",
    status: TicketStatus.ISSUED,
    issuedAt: "2026-07-04T11:00:05Z"
  }
];

export const INITIAL_SCAN_LOGS: ScanLog[] = [
  {
    id: "slog_1",
    ticketId: "tkt_102_1",
    eventId: "ev1",
    eventName: "Aura Fest 2026",
    attendeeName: "Sarah Connor",
    categoryName: "VIP Backstage Pass",
    scanResult: "VALID",
    scanTime: "2026-07-04T11:15:00-07:00",
    gateName: "Main Gate",
    scannedBy: "Officer Mehra"
  }
];

export const INITIAL_SETTLEMENTS: Settlement[] = [
  {
    id: "set_1",
    eventId: "ev1",
    eventName: "Aura Fest 2026",
    grossSales: 341400,
    totalRefunds: 2990,
    platformFees: 5710,
    gatewayFees: 5121,
    manualCollections: 4500,
    netSettlement: 332079,
    status: "processing"
  },
  {
    id: "set_2",
    eventId: "ev2",
    eventName: "Greenfield 10K Marathon",
    grossSales: 266500,
    totalRefunds: 0,
    platformFees: 3650,
    gatewayFees: 3997,
    manualCollections: 0,
    netSettlement: 258853,
    status: "settled",
    settledAt: "2026-07-02T16:00:00-07:00"
  },
  {
    id: "set_3",
    eventId: "ev3",
    eventName: "GenAI Product Workshop",
    grossSales: 18905,
    totalRefunds: 0,
    platformFees: 950,
    gatewayFees: 283,
    manualCollections: 1990,
    netSettlement: 17672,
    status: "pending"
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: "aud_1",
    timestamp: "2026-07-04T09:00:00-07:00",
    actor: "Admin (Ophardik)",
    action: "Workspace Created",
    details: "Default system workspace 'GatePass India' successfully provisioned."
  },
  {
    id: "aud_2",
    timestamp: "2026-07-04T09:15:00-07:00",
    actor: "Staff Mehra",
    action: "Assigned Scanner Role",
    details: "Assigned as scanner for Aura Fest 2026 at Main Gate."
  },
  {
    id: "aud_3",
    timestamp: "2026-07-04T09:30:10-07:00",
    actor: "System API",
    action: "Ticket Issued",
    details: "Ticket 'tkt_101_1' issued to Hardik Jain after verified transaction 'ord_101'."
  }
];

// Helper helper to initialize localStorage safely
export function getOrCreateStore<T>(key: string, initialData: T): T {
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored) as T;
    } catch {
      // fallback
    }
  }
  localStorage.setItem(key, JSON.stringify(initialData));
  return initialData;
}

export function saveStore<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}
