import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccessRequest, InvitePass } from "../types";
import {
  createTransfer,
  fetchMyTickets,
  fetchTransfers,
  respondToTransfer,
  type MyTicket,
  type TransferLists,
} from "../transferApi";
import { 
  CheckCircle, 
  XCircle, 
  Info, 
  Clock, 
  QrCode, 
  Mail, 
  ShieldAlert, 
  User, 
  Bell,
  Trash2,
  RefreshCw,
  Sparkles,
  ArrowLeft
} from "lucide-react";

interface ApprovalsInvitesProps {
  requests: AccessRequest[];
  invites: InvitePass[];
  onApproveRequest: (id: string) => void;
  onDenyRequest: (id: string) => void;
  onRevokeInvite: (id: string) => void;
  onResendInvite: (id: string) => void;
  onToast?: (type: "success" | "error" | "warning" | "info", text: string) => void;
}

export default function ApprovalsInvites({
  requests,
  invites,
  onApproveRequest,
  onDenyRequest,
  onRevokeInvite,
  onResendInvite,
  onToast
}: ApprovalsInvitesProps) {
  const [activeTab, setActiveTab] = useState<"requests" | "invites" | "tickets">("requests");
  const [toastMessage, setToastMessage] = useState("");

  const [myTickets, setMyTickets] = useState<MyTicket[]>([]);
  const [transfers, setTransfers] = useState<TransferLists>({ incoming: [], outgoing: [] });
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferTarget, setTransferTarget] = useState<MyTicket | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");

  const pendingRequests = requests.filter(r => r.status === "pending");
  const pendingIncoming = transfers.incoming.filter(t => t.status === "pending");

  const loadTransferData = async () => {
    try {
      const [tickets, lists] = await Promise.all([fetchMyTickets(), fetchTransfers()]);
      setMyTickets(tickets);
      setTransfers(lists);
    } catch (error) {
      onToast?.("error", error instanceof Error ? error.message : "Could not load tickets.");
    }
  };

  useEffect(() => {
    void loadTransferData();
  }, []);

  const handleCreateTransfer = async () => {
    if (!transferTarget || !recipientEmail.trim()) return;
    setTransferBusy(true);
    try {
      await createTransfer(transferTarget.id, recipientEmail.trim());
      onToast?.("success", `Transfer request sent to ${recipientEmail.trim()}.`);
      setTransferTarget(null);
      setRecipientEmail("");
      await loadTransferData();
    } catch (error) {
      onToast?.("error", error instanceof Error ? error.message : "Transfer failed.");
    } finally {
      setTransferBusy(false);
    }
  };

  const handleCancelTransfer = async (transferId: string) => {
    setTransferBusy(true);
    try {
      await respondToTransfer(transferId, "cancel");
      onToast?.("info", "Transfer cancelled.");
      await loadTransferData();
    } catch (error) {
      onToast?.("error", error instanceof Error ? error.message : "Could not cancel.");
    } finally {
      setTransferBusy(false);
    }
  };

  const handleRespondToTransfer = async (
    transferId: string,
    action: "accept" | "decline",
    eventName: string,
  ) => {
    setTransferBusy(true);
    try {
      await respondToTransfer(transferId, action);
      onToast?.(
        action === "accept" ? "success" : "info",
        action === "accept"
          ? `Ticket for ${eventName} is now yours.`
          : `Declined the ticket for ${eventName}.`,
      );
      await loadTransferData();
    } catch (error) {
      onToast?.("error", error instanceof Error ? error.message : "Could not respond.");
    } finally {
      setTransferBusy(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const handleApprove = (id: string, name: string) => {
    onApproveRequest(id);
    showToast(`Approved access request for ${name}! Pass generated.`);
  };

  const handleDeny = (id: string, name: string) => {
    onDenyRequest(id);
    showToast(`Access request for ${name} has been denied.`);
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn" id="approvals-section">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-charcoal-dark text-white px-4 py-3 rounded-xl shadow-lg border border-primary/20 flex items-center gap-2 animate-bounce">
          <Sparkles className="w-5 h-5 text-status-warning" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Info */}
      <div className="flex items-center gap-3">
        <Link to="/" className="p-2 rounded-xl bg-white hover:bg-neutral-100 text-charcoal-dark border border-outline-variant/30 transition-all flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h2 className="text-2xl font-black text-charcoal-dark tracking-tight">Approvals &amp; Invites</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Manage pending security access requests and active visitor passes.
          </p>
        </div>
      </div>

      {/* Custom Tabbed Switcher */}
      <div className="w-full bg-surface-container-highest p-1 rounded-xl flex">
        <button
          id="btn-requests-tab"
          onClick={() => setActiveTab("requests")}
          className={`flex-1 py-3 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "requests"
              ? "bg-white text-primary shadow-sm"
              : "text-on-surface-variant hover:text-charcoal-dark"
          }`}
        >
          INCOMING ({pendingRequests.length + pendingIncoming.length})
        </button>
        <button
          id="btn-tickets-tab"
          onClick={() => setActiveTab("tickets")}
          className={`flex-1 py-3 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "tickets"
              ? "bg-white text-primary shadow-sm"
              : "text-on-surface-variant hover:text-charcoal-dark"
          }`}
        >
          MY TICKETS ({myTickets.length})
        </button>
        <button
          id="btn-invites-tab"
          onClick={() => setActiveTab("invites")}
          className={`flex-1 py-3 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
            activeTab === "invites"
              ? "bg-white text-primary shadow-sm"
              : "text-on-surface-variant hover:text-charcoal-dark"
          }`}
        >
          MY INVITES ({invites.length})
        </button>
      </div>

      {/* Tab Content: Incoming Requests */}
      {activeTab === "requests" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="requests-list-container">
          {/* Incoming ticket transfers — the notification surface for a transfer
              the recipient must accept or decline. */}
          {pendingIncoming.map((transfer) => (
            <div
              key={transfer.id}
              className="bg-white rounded-2xl p-5 border-2 border-primary/30 flex flex-col gap-3"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                  Ticket transfer
                </span>
                <h3 className="font-extrabold text-charcoal-dark text-base mt-1">
                  {transfer.event_name}
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {transfer.ticket_type} · from {transfer.from_name}
                </p>
                <p className="text-[11px] text-outline mt-1">
                  Expires {new Date(transfer.expires_at).toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => void handleRespondToTransfer(transfer.id, "decline", transfer.event_name)}
                  disabled={transferBusy}
                  className="min-h-11 rounded-lg border border-outline-variant text-xs font-bold disabled:opacity-40"
                >
                  Decline
                </button>
                <button
                  onClick={() => void handleRespondToTransfer(transfer.id, "accept", transfer.event_name)}
                  disabled={transferBusy}
                  className="min-h-11 rounded-lg bg-primary text-white text-xs font-black disabled:opacity-40"
                >
                  Accept
                </button>
              </div>
            </div>
          ))}
          {pendingRequests.length === 0 && pendingIncoming.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl p-12 text-center border border-outline-variant/20 flex flex-col items-center gap-3">
              <CheckCircle className="w-12 h-12 text-status-success" />
              <h3 className="font-bold text-charcoal-dark">All Caught Up!</h3>
              <p className="text-xs text-on-surface-variant max-w-sm leading-relaxed">
                There are no pending gate entry or temporary room access requests requiring authorization.
              </p>
            </div>
          ) : (
            pendingRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white rounded-2xl shadow-sm p-5 flex flex-col justify-between border border-outline-variant/30 transition-all hover:border-primary/20"
              >
                <div>
                  {/* Requester Profile Info */}
                  <div className="flex items-center gap-3.5 mb-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-container flex items-center justify-center border border-outline-variant">
                      {req.requesterAvatarUrl ? (
                        <img 
                          src={req.requesterAvatarUrl} 
                          alt={req.requesterName} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="font-extrabold text-primary text-sm tracking-wider uppercase">
                          {req.requesterName.split(" ").map(n => n[0]).join("")}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-charcoal-dark text-base leading-tight">
                        {req.requesterName}
                      </h3>
                      <p className="text-xs text-on-surface-variant font-medium mt-0.5">
                        {req.zoneName}
                      </p>
                    </div>
                  </div>

                  {/* Gray block explanation */}
                  <div className="bg-surface-container-low p-3 rounded-xl mb-5 border border-outline-variant/15">
                    <div className="flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-outline flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-on-surface leading-relaxed font-medium">
                        {req.purpose}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer Action buttons */}
                <div className="flex gap-3 pt-3 border-t border-surface-container-high">
                  <button
                    onClick={() => handleApprove(req.id, req.requesterName)}
                    className="flex-1 py-2.5 bg-primary hover:bg-opacity-90 text-white text-xs font-bold tracking-widest uppercase rounded-lg transition-all cursor-pointer"
                  >
                    APPROVE
                  </button>
                  <button
                    onClick={() => handleDeny(req.id, req.requesterName)}
                    className="flex-1 py-2.5 bg-white hover:bg-surface-container text-charcoal-dark border border-outline-variant text-xs font-bold tracking-widest uppercase rounded-lg transition-all cursor-pointer"
                  >
                    DENY
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content: My Invites */}
      {activeTab === "invites" && (
        <div className="flex flex-col gap-4 animate-fadeIn" id="invites-list-container">
          {invites.map((pass) => (
            <div
              key={pass.id}
              className={`bg-white rounded-2xl shadow-sm p-5 border border-outline-variant/20 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between transition-all ${
                pass.status === "EXPIRED" || pass.status === "REVOKED" ? "opacity-65" : ""
              }`}
            >
              {/* Left Column Description */}
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border flex-shrink-0 ${
                  pass.status === "APPROVED" 
                    ? "bg-pass-temporary text-primary border-primary/20" 
                    : pass.status === "PENDING"
                    ? "bg-status-warning/10 text-status-warning border-status-warning/20"
                    : "bg-surface-container text-outline-variant border-outline-variant/35"
                }`}>
                  {pass.category === "INVITE" || pass.category === "PRE-APPROVED" ? (
                    <QrCode className="w-6 h-6" />
                  ) : pass.status === "PENDING" ? (
                    <Mail className="w-5 h-5 animate-pulse" />
                  ) : (
                    <ShieldAlert className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-charcoal-dark text-base">
                    {pass.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs text-on-surface-variant tracking-wider font-semibold">
                      ID: {pass.passIdCode}
                    </span>
                    <span className="text-xs text-outline">•</span>
                    <span className="text-xs text-on-surface-variant font-medium">
                      {pass.validityText}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column Action Badge & Action buttons */}
              <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-3 w-full sm:w-auto pt-4 sm:pt-0 border-t sm:border-t-0 border-surface-container">
                <span className={`text-[10px] font-black tracking-wider uppercase px-3 py-1.5 rounded-full ${
                  pass.status === "APPROVED"
                    ? "bg-status-success text-white"
                    : pass.status === "PENDING"
                    ? "bg-status-warning text-white"
                    : pass.status === "REVOKED"
                    ? "bg-status-danger text-white"
                    : "bg-status-inactive text-white"
                }`}>
                  {pass.status}
                </span>

                {pass.status === "APPROVED" && (
                  <button
                    onClick={() => {
                      onRevokeInvite(pass.id);
                      showToast(`Revoked pass ${pass.passIdCode}.`);
                    }}
                    className="text-[10px] font-bold text-status-danger hover:underline uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>REVOKE</span>
                  </button>
                )}

                {pass.status === "PENDING" && (
                  <button
                    onClick={() => {
                      onResendInvite(pass.id);
                      showToast(`Resent invitation notification link for ${pass.title}.`);
                    }}
                    className="text-[10px] font-bold text-primary hover:underline uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                    <span>RESEND</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Content: My Tickets */}
      {activeTab === "tickets" && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myTickets.length === 0 ? (
              <div className="col-span-full bg-white rounded-2xl p-12 text-center border border-outline-variant/20">
                <h3 className="font-bold text-charcoal-dark">No tickets yet</h3>
                <p className="text-sm text-on-surface-variant mt-1">
                  Tickets you buy or receive will appear here.
                </p>
              </div>
            ) : (
              myTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="bg-white rounded-2xl p-5 border border-outline-variant/20 flex flex-col gap-3"
                >
                  <div>
                    <h3 className="font-extrabold text-charcoal-dark text-base">
                      {ticket.event_name}
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {ticket.ticket_type} · {ticket.venue}
                    </p>
                    <p className="text-xs text-outline mt-0.5">
                      {new Date(ticket.starts_at).toLocaleString()}
                    </p>
                  </div>
                  {ticket.pending_transfer ? (
                    <div className="flex items-center justify-between gap-2 border-t border-surface-container pt-3">
                      <span className="text-xs font-bold text-status-warning">
                        Transfer pending → {ticket.pending_transfer.to_email}
                      </span>
                      <button
                        onClick={() => void handleCancelTransfer(ticket.pending_transfer!.id)}
                        disabled={transferBusy}
                        className="px-3 py-2 rounded-lg text-xs font-bold border border-outline-variant text-charcoal-dark disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setTransferTarget(ticket)}
                      className="min-h-11 rounded-lg bg-charcoal-dark text-white text-xs font-black uppercase tracking-wider"
                    >
                      Transfer ticket
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Outgoing transfers: how the sender learns the outcome. */}
          {transfers.outgoing.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-black uppercase tracking-wider text-outline mb-3">
                Transfers you sent
              </h3>
              <div className="flex flex-col gap-2">
                {transfers.outgoing.map((transfer) => (
                  <div
                    key={transfer.id}
                    className="bg-white rounded-xl p-4 border border-outline-variant/20 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-charcoal-dark truncate">
                        {transfer.event_name}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">
                        To {transfer.to_email} · {new Date(transfer.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        transfer.status === "accepted"
                          ? "bg-status-success/10 text-status-success"
                          : transfer.status === "pending"
                            ? "bg-status-warning/10 text-status-warning"
                            : "bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      {transfer.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transfer modal */}
      {transferTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-black text-charcoal-dark">Transfer ticket</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                {transferTarget.event_name} · {transferTarget.ticket_type}
              </p>
            </div>
            <label className="text-xs font-bold text-outline uppercase" htmlFor="recipient-email">
              Recipient&apos;s GatePass email
            </label>
            <input
              id="recipient-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="friend@example.com"
              className="min-h-12 w-full border border-outline-variant rounded-lg px-3 text-sm font-semibold"
            />
            <p className="text-[11px] text-on-surface-variant">
              They do not need a GatePass account yet — if they sign up with this
              email later, the ticket will be waiting for them. It stays yours
              until they accept.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setTransferTarget(null); setRecipientEmail(""); }}
                className="min-h-11 rounded-lg border border-outline-variant text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCreateTransfer()}
                disabled={transferBusy || !recipientEmail.trim()}
                className="min-h-11 rounded-lg bg-primary text-white text-xs font-black disabled:opacity-40"
              >
                Send request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
