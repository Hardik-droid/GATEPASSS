import {
  INITIAL_ACCESS_REQUESTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_EVENTS,
  INITIAL_INVITE_PASSES,
  INITIAL_ORDERS,
  INITIAL_SCAN_LOGS,
  INITIAL_SETTLEMENTS,
  INITIAL_TICKETS,
  INITIAL_USER,
} from "./mockData";
import type {
  AccessRequest,
  AuditLog,
  EventItem,
  InvitePass,
  Order,
  ScanLog,
  Settlement,
  Ticket,
  UserProfile,
} from "./types";

export interface AppStateSnapshot {
  user: UserProfile;
  requests: AccessRequest[];
  invitePasses: InvitePass[];
  events: EventItem[];
  orders: Order[];
  tickets: Ticket[];
  scanLogs: ScanLog[];
  settlements: Settlement[];
  auditLogs: AuditLog[];
}

export function createInitialAppState(): AppStateSnapshot {
  return structuredClone({
    user: INITIAL_USER,
    requests: INITIAL_ACCESS_REQUESTS,
    invitePasses: INITIAL_INVITE_PASSES,
    events: INITIAL_EVENTS,
    orders: INITIAL_ORDERS,
    tickets: INITIAL_TICKETS,
    scanLogs: INITIAL_SCAN_LOGS,
    settlements: INITIAL_SETTLEMENTS,
    auditLogs: INITIAL_AUDIT_LOGS,
  });
}

