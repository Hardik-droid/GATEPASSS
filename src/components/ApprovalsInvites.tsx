import React, { useState } from "react";
import { AccessRequest, InvitePass } from "../types";
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
  Sparkles
} from "lucide-react";

interface ApprovalsInvitesProps {
  requests: AccessRequest[];
  invites: InvitePass[];
  onApproveRequest: (id: string) => void;
  onDenyRequest: (id: string) => void;
  onRevokeInvite: (id: string) => void;
  onResendInvite: (id: string) => void;
}

export default function ApprovalsInvites({
  requests,
  invites,
  onApproveRequest,
  onDenyRequest,
  onRevokeInvite,
  onResendInvite
}: ApprovalsInvitesProps) {
  const [activeTab, setActiveTab] = useState<"requests" | "invites">("requests");
  const [toastMessage, setToastMessage] = useState("");

  const pendingRequests = requests.filter(r => r.status === "pending");

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
      <div>
        <h2 className="text-2xl font-black text-charcoal-dark tracking-tight">Approvals &amp; Invites</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Manage pending security access requests and active visitor passes.
        </p>
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
          INCOMING REQUESTS ({pendingRequests.length})
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
          {pendingRequests.length === 0 ? (
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
    </div>
  );
}
