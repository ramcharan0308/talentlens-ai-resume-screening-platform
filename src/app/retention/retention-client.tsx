"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs } from "@/components/ui/tabs";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import { UserRole, DeletionRequestStatus } from "@prisma/client";
import {
  ShieldAlert,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  RotateCw,
  Plus,
  XCircle,
  Eye,
  Calendar,
  Lock,
  Shield,
  ShieldCheck,
  X,
  ExternalLink,
} from "lucide-react";

interface DeletionRequest {
  id: string;
  candidateId: string | null;
  candidateReference: string;
  candidateName: string | null;
  status: DeletionRequestStatus;
  reason: string;
  rejectionReason: string | null;
  requestedBy: { id: string; name: string; email: string };
  reviewedBy: { id: string; name: string; email: string } | null;
  approvedBy: { id: string; name: string; email: string } | null;
  executedBy: { id: string; name: string; email: string } | null;
  storageCleanupStatus: string | null;
  deletedFilesCount: number;
  totalFilesCount: number;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface RetentionPolicy {
  id: string;
  name: string;
  description: string | null;
  retentionDays: number;
  purpose: string;
  isActive: boolean;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

interface FlaggedCandidate {
  id: string;
  candidateReference: string;
  fullName: string | null;
  currentRole: string | null;
  createdAt: string;
  retentionExpiresAt: string | null;
  purgeStatus: string;
  consentRecords: Array<{ id: string; purpose: string; status: string; withdrawnAt: string | null }>;
  deletionRequests: Array<{ id: string; status: string }>;
}

export function RetentionClientView({
  userRole,
  userId,
  userName,
}: {
  userRole: string;
  userId: string;
  userName: string;
}) {
  const [activeTab, setActiveTab] = React.useState<"deletions" | "policies" | "review">("deletions");
  const [deletionRequests, setDeletionRequests] = React.useState<DeletionRequest[]>([]);
  const [policies, setPolicies] = React.useState<RetentionPolicy[]>([]);
  const [flaggedCandidates, setFlaggedCandidates] = React.useState<FlaggedCandidate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // New Policy Form State
  const [newPolicyName, setNewPolicyName] = React.useState("");
  const [newPolicyDays, setNewPolicyDays] = React.useState("365");
  const [newPolicyDesc, setNewPolicyDesc] = React.useState("");
  const [showNewPolicyModal, setShowNewPolicyModal] = React.useState(false);

  // Rejection Dialog State
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = React.useState("");

  const isDeliveryHead = userRole === UserRole.DELIVERY_HEAD;

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [delRes, polRes, revRes] = await Promise.all([
        fetch("/api/deletion-requests"),
        fetch("/api/retention/policies"),
        fetch("/api/retention/review"),
      ]);

      if (delRes.ok) {
        const dJson = await delRes.json();
        if (dJson.success) setDeletionRequests(dJson.requests || []);
      }
      if (polRes.ok) {
        const pJson = await polRes.json();
        if (pJson.success) setPolicies(pJson.policies || []);
      }
      if (revRes.ok) {
        const rJson = await revRes.json();
        if (rJson.success) setFlaggedCandidates(rJson.candidates || []);
      }
    } catch (err) {
      console.error("Failed to load governance data:", err);
      setError("Failed to load governance data. Please check network connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let isSubscribed = true;

    async function initialFetch() {
      try {
        const [delRes, polRes, revRes] = await Promise.all([
          fetch("/api/deletion-requests"),
          fetch("/api/retention/policies"),
          fetch("/api/retention/review"),
        ]);
        if (!isSubscribed) return;

        if (delRes.ok) {
          const dJson = await delRes.json();
          if (dJson.success) setDeletionRequests(dJson.requests || []);
        }
        if (polRes.ok) {
          const pJson = await polRes.json();
          if (pJson.success) setPolicies(pJson.policies || []);
        }
        if (revRes.ok) {
          const rJson = await revRes.json();
          if (rJson.success) setFlaggedCandidates(rJson.candidates || []);
        }
      } catch (err) {
        if (isSubscribed) {
          console.error("Failed to load governance data:", err);
          setError("Failed to load governance data. Please check network connection.");
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    initialFetch();

    return () => {
      isSubscribed = false;
    };
  }, []);

  const handleReviewAction = async (requestId: string, action: "START_REVIEW" | "APPROVE") => {
    setActionLoading(requestId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/deletion-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Request marked as ${action === "START_REVIEW" ? "UNDER_REVIEW" : "APPROVED"}.`);
        loadData();
      } else {
        setError(data.error || "Failed to update deletion request status.");
      }
    } catch {
      setError("Network error updating deletion request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectAction = async () => {
    if (!rejectingId) return;
    if (!rejectionReasonInput.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    setActionLoading(rejectingId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/deletion-requests/${rejectingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REJECT",
          rejectionReason: rejectionReasonInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg("Deletion request rejected.");
        setRejectingId(null);
        setRejectionReasonInput("");
        loadData();
      } else {
        setError(data.error || "Failed to reject deletion request.");
      }
    } catch {
      setError("Network error rejecting deletion request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecuteAction = async (requestId: string, candidateRef: string) => {
    const confirmed = window.confirm(
      `CRITICAL DELETION CONFIRMATION:\n\nAre you sure you want to permanently delete all personal data, uploaded CV documents, parsed profiles, and AI screening evaluations for candidate ${candidateRef}?\n\nThis operation is irreversible.`
    );
    if (!confirmed) return;

    setActionLoading(requestId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/deletion-requests/${requestId}/execute`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(
          `Deletion completed successfully. ${data.deletedFilesCount} physical files deleted and all database records scrubbed.`
        );
        loadData();
      } else {
        setError(data.error || "Deletion execution failed.");
      }
    } catch {
      setError("Network error executing deletion.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyName.trim() || !newPolicyDays) return;

    setActionLoading("new-policy");
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/retention/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPolicyName.trim(),
          retentionDays: parseInt(newPolicyDays, 10),
          description: newPolicyDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg("Retention policy configured successfully.");
        setShowNewPolicyModal(false);
        setNewPolicyName("");
        setNewPolicyDesc("");
        setNewPolicyDays("365");
        loadData();
      } else {
        setError(data.error || "Failed to create policy.");
      }
    } catch {
      setError("Network error creating retention policy.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleInitiateDeletionFromReview = async (candidateId: string, candidateRef: string) => {
    const reason = window.prompt(
      `Enter reason for initiating deletion request for candidate ${candidateRef}:`,
      "Candidate retention period expired with no active engagements."
    );
    if (!reason || !reason.trim()) return;

    setActionLoading(candidateId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/deletion-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Deletion request initiated for candidate ${candidateRef}.`);
        loadData();
      } else {
        setError(data.error || "Failed to initiate deletion request.");
      }
    } catch {
      setError("Network error initiating deletion request.");
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: DeletionRequestStatus) => {
    switch (status) {
      case DeletionRequestStatus.REQUESTED:
        return <Badge variant="warning" dot className="font-mono text-[10px]">REQUESTED</Badge>;
      case DeletionRequestStatus.UNDER_REVIEW:
        return <Badge variant="info" dot className="font-mono text-[10px]">UNDER_REVIEW</Badge>;
      case DeletionRequestStatus.APPROVED:
        return <Badge variant="success" dot className="font-mono text-[10px]">APPROVED</Badge>;
      case DeletionRequestStatus.PROCESSING:
        return <Badge variant="outline" dot className="font-mono text-[10px] animate-pulse">PROCESSING</Badge>;
      case DeletionRequestStatus.COMPLETED:
        return <Badge variant="neutral" dot className="font-mono text-[10px]">COMPLETED</Badge>;
      case DeletionRequestStatus.REJECTED:
        return <Badge variant="destructive" dot className="font-mono text-[10px]">REJECTED</Badge>;
      default:
        return <Badge variant="secondary" className="font-mono text-[10px]">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8 page-animate">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge variant="default" className="text-xs font-mono font-semibold">
              DPDP Section 12 Compliance
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-emerald-600" />
              <span>Right to Erasure & Purpose Separation</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Consent, Deletion & Retention Governance
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
            Manage traceable candidate consent records, authorized deletion lifecycles, and retention review policies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-xs h-9 gap-1.5 shadow-2xs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Deletion Requests"
          value={deletionRequests.length}
          subtext="Total candidate erasure requests"
          icon={<Trash2 className="h-4 w-4 text-rose-600" />}
        />
        <MetricCard
          label="Retention Policies"
          value={policies.length}
          subtext="Configured threshold rules"
          icon={<Lock className="h-4 w-4 text-primary" />}
        />
        <MetricCard
          label="Flagged for Review"
          value={flaggedCandidates.length}
          subtext="Candidates exceeding retention"
          variant={flaggedCandidates.length > 0 ? "warning" : "default"}
          icon={<Clock className="h-4 w-4 text-amber-600" />}
        />
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive flex items-start gap-2.5 animate-in fade-in duration-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5 animate-in fade-in duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          {
            id: "deletions",
            label: "Deletion Lifecycle",
            icon: <Trash2 className="h-4 w-4" />,
            count: deletionRequests.length,
          },
          {
            id: "policies",
            label: "Retention Policies",
            icon: <Lock className="h-4 w-4" />,
            count: policies.length,
          },
          {
            id: "review",
            label: "Retention Review",
            icon: <Clock className="h-4 w-4" />,
            count: flaggedCandidates.length,
          },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* TAB 1: Deletion Requests */}
      {activeTab === "deletions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Candidate Erasure & Deletion Requests</h2>
            <span className="text-xs text-muted-foreground font-mono">
              REQUESTED → UNDER_REVIEW → APPROVED → PROCESSING → COMPLETED
            </span>
          </div>

          {deletionRequests.length === 0 ? (
            <EmptyState
              icon={<Trash2 className="h-6 w-6 text-muted-foreground" />}
              title="No deletion requests recorded"
              description="Erasure requests submitted by recruiters or candidates will appear here for Delivery Head governance approval."
            />
          ) : (
            <div className="grid gap-3.5">
              {deletionRequests.map((req) => (
                <Card key={req.id} className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
                  <CardHeader className="pb-2.5 pt-3.5 px-4 sm:px-5 bg-muted/20 border-b border-border/60">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-background border border-border/80 rounded-md text-foreground">
                          {req.candidateReference}
                        </span>
                        {req.candidateName && (
                          <span className="text-xs font-bold text-foreground">
                            {req.candidateName}
                          </span>
                        )}
                        {getStatusBadge(req.status)}
                      </div>

                      <div className="text-[11px] text-muted-foreground font-mono">
                        Requested: {new Date(req.createdAt).toLocaleString()} by {req.requestedBy.name}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="px-4 sm:px-5 py-3.5 text-xs space-y-3 pt-3">
                    <div className="bg-muted/30 p-3 rounded-lg border border-border/60 space-y-1">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Deletion Justification / Legal Basis:
                      </span>
                      <p className="text-foreground leading-relaxed">{req.reason}</p>
                    </div>

                    {req.rejectionReason && (
                      <div className="bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-rose-800 dark:text-rose-300">
                        <span className="text-[11px] font-bold block">Rejection Reason:</span>
                        <p>{req.rejectionReason}</p>
                      </div>
                    )}

                    {req.failureReason && (
                      <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-amber-800 dark:text-amber-300">
                        <span className="text-[11px] font-bold block">Storage Cleanup Warning (Recoverable):</span>
                        <p>{req.failureReason}</p>
                      </div>
                    )}

                    {req.status === DeletionRequestStatus.COMPLETED && (
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-mono">
                        <span>Completed: {req.completedAt ? new Date(req.completedAt).toLocaleString() : "Yes"}</span>
                        <span>Files Purged: {req.deletedFilesCount} / {req.totalFilesCount}</span>
                        <span>Executed By: {req.executedBy?.name || "System"}</span>
                      </div>
                    )}

                    {/* Action Controls for Delivery Head */}
                    {isDeliveryHead && (
                      <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-border/60">
                        {req.status === DeletionRequestStatus.REQUESTED && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-8 shadow-2xs"
                              disabled={actionLoading === req.id}
                              onClick={() => handleReviewAction(req.id, "START_REVIEW")}
                            >
                              Start Review
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 shadow-2xs"
                              disabled={actionLoading === req.id}
                              onClick={() => handleReviewAction(req.id, "APPROVE")}
                            >
                              Approve Request
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs h-8 shadow-2xs"
                              disabled={actionLoading === req.id}
                              onClick={() => {
                                setRejectingId(req.id);
                                setRejectionReasonInput("");
                              }}
                            >
                              Reject Request
                            </Button>
                          </>
                        )}

                        {req.status === DeletionRequestStatus.UNDER_REVIEW && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 shadow-2xs"
                              disabled={actionLoading === req.id}
                              onClick={() => handleReviewAction(req.id, "APPROVE")}
                            >
                              Approve Request
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="text-xs h-8 shadow-2xs"
                              disabled={actionLoading === req.id}
                              onClick={() => {
                                setRejectingId(req.id);
                                setRejectionReasonInput("");
                              }}
                            >
                              Reject Request
                            </Button>
                          </>
                        )}

                        {(req.status === DeletionRequestStatus.APPROVED ||
                          (req.status === DeletionRequestStatus.PROCESSING && req.storageCleanupStatus === "FAILED")) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="text-xs h-8 gap-1.5 shadow-2xs"
                            disabled={actionLoading === req.id}
                            onClick={() => handleExecuteAction(req.id, req.candidateReference)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>
                              {req.status === DeletionRequestStatus.PROCESSING ? "Retry Deletion Execution" : "Execute Complete Data Erasure"}
                            </span>
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Rejection Prompt Modal */}
          {rejectingId && (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
              <Card className="w-full max-w-md shadow-xl border border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-foreground">Reject Deletion Request</CardTitle>
                  <CardDescription className="text-xs">
                    Please provide an explicit justification for rejecting this candidate erasure request.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Rejection Reason</Label>
                    <Input
                      placeholder="e.g. Active legal dispute, active placement contract requirement"
                      value={rejectionReasonInput}
                      onChange={(e) => setRejectionReasonInput(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-border/80">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRejectingId(null)}
                      disabled={actionLoading === rejectingId}
                      className="text-xs h-8"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRejectAction}
                      disabled={actionLoading === rejectingId || !rejectionReasonInput.trim()}
                      className="text-xs h-8"
                    >
                      Confirm Rejection
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Retention Policies */}
      {activeTab === "policies" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Configurable Retention Policies</h2>
              <p className="text-xs text-muted-foreground">
                Define agency data retention periods. Records are flagged for human review upon expiry; no automated silent deletions.
              </p>
            </div>

            {isDeliveryHead && (
              <Button
                size="sm"
                className="text-xs gap-1.5 h-8 shadow-2xs"
                onClick={() => setShowNewPolicyModal(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Configure Policy</span>
              </Button>
            )}
          </div>

          {policies.length === 0 ? (
            <EmptyState
              icon={<Lock className="h-6 w-6 text-muted-foreground" />}
              title="No retention policies configured"
              description="Delivery Heads can define retention thresholds (e.g. 365 days for recruitment processing) to track candidate data lifecycle."
              action={
                isDeliveryHead ? (
                  <Button
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => setShowNewPolicyModal(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Configure Policy</span>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policies.map((p) => (
                <Card key={p.id} className="border-border/80 shadow-2xs hover:border-primary/40 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <CardTitle className="text-sm font-bold">{p.name}</CardTitle>
                        <CardDescription className="text-xs font-mono">{p.purpose}</CardDescription>
                      </div>
                      <Badge variant="success" dot className="font-mono text-xs">
                        {p.retentionDays} Days
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2.5 pt-0">
                    <p className="text-muted-foreground leading-relaxed">{p.description || "No description provided."}</p>
                    <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/60 font-mono">
                      Configured by {p.createdBy?.name || "Delivery Head"} • {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* New Policy Dialog */}
          {showNewPolicyModal && (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
              <Card className="w-full max-w-md shadow-xl border border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-foreground">Configure Retention Policy</CardTitle>
                  <CardDescription className="text-xs">
                    Define an agency-specific retention threshold for candidate records.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleCreatePolicy}>
                  <CardContent className="space-y-3.5 text-xs">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Policy Name</Label>
                      <Input
                        placeholder="e.g. Standard 1-Year Recruitment Retention"
                        value={newPolicyName}
                        onChange={(e) => setNewPolicyName(e.target.value)}
                        required
                        className="text-xs h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Retention Period (Days)</Label>
                      <Input
                        type="number"
                        min="30"
                        max="3650"
                        value={newPolicyDays}
                        onChange={(e) => setNewPolicyDays(e.target.value)}
                        required
                        className="text-xs h-9 font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Description / Legal Notes</Label>
                      <Input
                        placeholder="e.g. Candidate consent active for 1 year per notice v1.0"
                        value={newPolicyDesc}
                        onChange={(e) => setNewPolicyDesc(e.target.value)}
                        className="text-xs h-9"
                      />
                    </div>

                    <div className="pt-2 border-t border-border/80 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowNewPolicyModal(false)}
                        className="text-xs h-8"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        isLoading={actionLoading === "new-policy"}
                        className="text-xs h-8"
                      >
                        Save Policy
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Retention Review */}
      {activeTab === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Expiring Candidate Records (Retention Review)</h2>
              <p className="text-xs text-muted-foreground">
                Candidates reaching or exceeding configured retention thresholds. Review for legitimate continued processing or initiate erasure.
              </p>
            </div>
          </div>

          {flaggedCandidates.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6 text-emerald-600" />}
              title="All candidate records are within active retention limits"
              description="No candidates have exceeded their data retention threshold."
            />
          ) : (
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 uppercase text-[10px] font-bold text-muted-foreground tracking-wider border-b border-border/80">
                  <tr>
                    <th className="py-3 px-3">Candidate</th>
                    <th className="py-3 px-3">Created</th>
                    <th className="py-3 px-3">Retention Expiry</th>
                    <th className="py-3 px-3">Consent Status</th>
                    <th className="py-3 px-3">Purge Status</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {flaggedCandidates.map((cand) => (
                    <tr key={cand.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-foreground font-mono">{cand.candidateReference}</div>
                        <div className="text-[11px] text-muted-foreground">{cand.fullName || "Confidential"}</div>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground font-mono">
                        {new Date(cand.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 font-mono text-amber-700 dark:text-amber-400 font-semibold">
                        {cand.retentionExpiresAt ? new Date(cand.retentionExpiresAt).toLocaleDateString() : "Expired"}
                      </td>
                      <td className="py-3 px-3">
                        {cand.consentRecords.length > 0 ? (
                          <Badge variant="success" dot className="text-[10px] py-0 font-mono">
                            {cand.consentRecords[0].status}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] py-0 font-mono text-muted-foreground">
                            None
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {cand.purgeStatus}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleInitiateDeletionFromReview(cand.id, cand.candidateReference)}
                          disabled={actionLoading === cand.id}
                          className="h-7 text-xs gap-1 shadow-2xs"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Initiate Erasure</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
