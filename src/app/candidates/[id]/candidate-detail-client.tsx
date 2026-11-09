"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { UserRole } from "@prisma/client";
import {
  ArrowLeft,
  Briefcase,
  FileText,
  Download,
  ShieldCheck,
  Sparkles,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Lock,
} from "lucide-react";

interface CandidateDetail {
  id: string;
  candidateReference: string;
  fullName: string | null;
  currentRole: string | null;
  experienceYears: number | null;
  keySkills: string[];
  noticeDays: number | null;
  isFixture: boolean;
  createdAt: string;
  applications: Array<{
    id: string;
    status: string;
    requisition: {
      id: string;
      title: string;
      status: string;
      department: string | null;
      location: string | null;
    };
  }>;
  uploadedDocuments: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number | null;
    fileHash: string;
    processingStatus: string;
    createdAt: string;
  }>;
}

export function CandidateDetailClientView({
  id,
  initialData,
  userRole,
}: {
  id: string;
  initialData?: any;
  userRole?: string;
}) {
  const [candidate, setCandidate] = React.useState<CandidateDetail | null>(initialData ?? null);
  const [isLoading, setIsLoading] = React.useState(!initialData);
  const [error, setError] = React.useState<string | null>(null);
  const [governanceSuccess, setGovernanceSuccess] = React.useState<string | null>(null);
  const [governanceError, setGovernanceError] = React.useState<string | null>(null);
  const [consentRecords, setConsentRecords] = React.useState<any[]>([]);
  const [deletionRequests, setDeletionRequests] = React.useState<any[]>([]);
  const [actionInProgress, setActionInProgress] = React.useState(false);

  const isClientRole = userRole === UserRole.CLIENT_HIRING_MGR;

  const reloadGovernanceData = React.useCallback(async () => {
    if (isClientRole || !id) return;
    try {
      const [consentRes, delRes] = await Promise.all([
        fetch(`/api/candidates/${id}/consent`),
        fetch(`/api/candidates/${id}/deletion-requests`),
      ]);
      if (consentRes.ok) {
        const cJson = await consentRes.json();
        if (cJson.success) setConsentRecords(cJson.records || []);
      }
      if (delRes.ok) {
        const dJson = await delRes.json();
        if (dJson.success) setDeletionRequests(dJson.requests || []);
      }
    } catch (e) {
      console.error("Failed to load consent/deletion data:", e);
    }
  }, [id, isClientRole]);

  React.useEffect(() => {
    if (isClientRole || !id) return;
    let isSubscribed = true;

    async function fetchGov() {
      try {
        const [consentRes, delRes] = await Promise.all([
          fetch(`/api/candidates/${id}/consent`),
          fetch(`/api/candidates/${id}/deletion-requests`),
        ]);
        if (!isSubscribed) return;
        if (consentRes.ok) {
          const cJson = await consentRes.json();
          if (cJson.success) setConsentRecords(cJson.records || []);
        }
        if (delRes.ok) {
          const dJson = await delRes.json();
          if (dJson.success) setDeletionRequests(dJson.requests || []);
        }
      } catch (e) {
        console.error("Failed to load consent/deletion data:", e);
      }
    }

    fetchGov();

    return () => {
      isSubscribed = false;
    };
  }, [id, isClientRole]);

  const handleRecordConsent = async () => {
    const purpose = window.prompt("Enter Consent Purpose:", "RECRUITMENT_PROCESSING");
    if (!purpose) return;
    setActionInProgress(true);
    setGovernanceError(null);
    setGovernanceSuccess(null);
    try {
      const res = await fetch(`/api/candidates/${id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose,
          noticeVersion: "v1.0",
          source: "DIRECT_APPLICATION",
          legalBasis: "CONSENT",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGovernanceSuccess("Consent successfully recorded.");
        reloadGovernanceData();
      } else {
        setGovernanceError(data.error || "Failed to record consent.");
      }
    } catch {
      setGovernanceError("Network error recording consent.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleWithdrawConsent = async () => {
    const reason = window.prompt("Enter Reason for Consent Withdrawal:", "Candidate requested withdrawal of processing consent.");
    if (!reason || !reason.trim()) return;
    setActionInProgress(true);
    setGovernanceError(null);
    setGovernanceSuccess(null);
    try {
      const res = await fetch(`/api/candidates/${id}/consent/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGovernanceSuccess("Consent withdrawn. Screening and client submissions are now blocked.");
        reloadGovernanceData();
      } else {
        setGovernanceError(data.error || "Failed to withdraw consent.");
      }
    } catch {
      setGovernanceError("Network error withdrawing consent.");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRequestDeletion = async () => {
    const reason = window.prompt("Enter Reason for Deletion / Erasure Request:", "Right to erasure / candidate requested permanent deletion.");
    if (!reason || !reason.trim()) return;
    setActionInProgress(true);
    setGovernanceError(null);
    setGovernanceSuccess(null);
    try {
      const res = await fetch(`/api/candidates/${id}/deletion-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGovernanceSuccess("Deletion request registered. Candidate processing is now blocked pending Delivery Head approval.");
        reloadGovernanceData();
      } else {
        setGovernanceError(data.error || "Failed to submit deletion request.");
      }
    } catch {
      setGovernanceError("Network error submitting deletion request.");
    } finally {
      setActionInProgress(false);
    }
  };

  React.useEffect(() => {
    if (initialData) return;
    let isSubscribed = true;

    async function loadData() {
      if (!id) return;
      try {
        const res = await fetch(`/api/candidates/${id}`);
        const json = await res.json();
        if (isSubscribed) {
          if (json.success && json.data) {
            setCandidate(json.data);
          } else {
            setError(json.error || "Failed to load candidate profile.");
          }
        }
      } catch (err) {
        if (isSubscribed) {
          console.error("Failed to load candidate:", err);
          setError("Network error loading candidate profile.");
        }
      } finally {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isSubscribed = false;
    };
  }, [id, initialData]);

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-10 w-80 bg-muted rounded" />
          <div className="h-48 w-full bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold">Candidate Not Found</h2>
        <p className="text-xs text-muted-foreground">{error || "Candidate profile does not exist."}</p>
        <Link href="/candidates">
          <Button size="sm">Back to Candidates</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6 page-animate">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/candidates" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Candidate Pool</span>
        </Link>
        <span>/</span>
        <span className="font-semibold text-foreground font-mono">
          {candidate.candidateReference}
        </span>
      </div>

      {/* Main Profile Header */}
      <Card className="border-border/90 shadow-2xs bg-card/95">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-muted border border-border/60 text-foreground">
                  {candidate.candidateReference}
                </span>

                {candidate.isFixture ? (
                  <Badge variant="warning" dot className="text-xs gap-1 font-mono">
                    Benchmark Fixture
                  </Badge>
                ) : (
                  <Badge variant="success" dot className="text-xs gap-1 font-mono">
                    Parsed from Resume Document
                  </Badge>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {isClientRole ? candidate.candidateReference : (candidate.fullName || candidate.candidateReference)}
              </h1>
              <p className="text-xs text-muted-foreground">
                {candidate.currentRole || "Current Role Unspecified"} • Added{" "}
                {new Date(candidate.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1.5 rounded-lg border border-border/60">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>{isClientRole ? "Client Portal Masked Profile" : "Anti-Bias Masked in Client View"}</span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Key Hiring Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Total Experience"
              value={candidate.experienceYears !== null ? `${candidate.experienceYears} Years` : "Unspecified"}
              subtext="Verified work history"
            />
            <MetricCard
              label="Notice Period"
              value={candidate.noticeDays !== null ? `${candidate.noticeDays} Days` : "Unspecified"}
              subtext="Availability to join"
            />
            <MetricCard
              label="Requisition Submissions"
              value={`${candidate.applications.length} Role${candidate.applications.length !== 1 ? "s" : ""}`}
              subtext="Attached pipeline applications"
            />
          </div>

          {/* Key Skills */}
          {candidate.keySkills.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Verified Technical Competencies:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {candidate.keySkills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs font-mono py-1 px-2.5">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Governance Alerts */}
      {governanceError && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive flex items-start gap-2.5 shadow-2xs animate-in fade-in duration-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="font-medium">{governanceError}</span>
        </div>
      )}

      {governanceSuccess && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5 shadow-2xs animate-in fade-in duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{governanceSuccess}</span>
        </div>
      )}

      {/* Pending Deletion Warning Banner */}
      {!isClientRole && deletionRequests.some((d) => ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"].includes(d.status)) && (
        <div className="p-4 bg-amber-500/10 border-2 border-amber-500/40 rounded-xl text-xs space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4" />
            <span>Active Deletion Request in Progress</span>
          </div>
          <p className="text-amber-700 dark:text-amber-400">
            Candidate erasure has been requested and is under governance review. AI screening and client submissions are blocked.
          </p>
        </div>
      )}

      {/* Consent & Deletion Governance Card (Agency only) */}
      {!isClientRole && (
        <Card className="border-border/90 shadow-2xs">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>Candidate Consent & Privacy Lifecycle</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Traceable processing consent records, withdrawal tracking, and right to erasure lifecycle.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 shadow-2xs"
                  isLoading={actionInProgress}
                  onClick={handleRecordConsent}
                >
                  Record Consent
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 text-amber-600 border-amber-300 hover:bg-amber-50 shadow-2xs"
                  isLoading={actionInProgress}
                  onClick={handleWithdrawConsent}
                >
                  Withdraw Consent
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="text-xs h-8 gap-1.5 shadow-2xs"
                  disabled={actionInProgress || deletionRequests.some((d) => ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"].includes(d.status))}
                  onClick={handleRequestDeletion}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Request Erasure</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {consentRecords.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1 italic">
                No explicit consent record registered yet. Ingestion does not automatically establish consent.
              </p>
            ) : (
              <div className="space-y-2">
                {consentRecords.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg border border-border/70 bg-card/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{c.purpose}</span>
                        <Badge
                          variant={c.status === "ACTIVE" ? "success" : "destructive"}
                          dot
                          className="font-mono text-[10px]"
                        >
                          {c.status}
                        </Badge>
                        <span className="text-muted-foreground text-[11px] font-mono">Ver: {c.noticeVersion}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground block mt-1 font-mono">
                        Source: {c.source} • Legal Basis: {c.legalBasis || "CONSENT"} • Recorded: {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                      {c.withdrawnAt && (
                        <span className="text-[11px] text-red-600 block mt-1 font-medium">
                          Withdrawn on {new Date(c.withdrawnAt).toLocaleString()} ({c.withdrawalReason || "No reason stated"})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Associated Requisitions */}
      <Card className="border-border/90 shadow-2xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            <span>Requisition Allocations & Pipeline Status</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Staffing firm pipeline submissions and evaluation states.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidate.applications.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">
              Candidate is not currently attached to any active requisition.
            </p>
          ) : (
            <div className="space-y-2">
              {candidate.applications.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between p-3.5 rounded-lg border border-border/70 bg-card text-xs shadow-2xs hover:border-primary/40 transition-colors"
                >
                  <div className="space-y-0.5">
                    <Link
                      href={`/requisitions/${app.requisition.id}`}
                      className="font-bold text-foreground hover:text-primary transition-colors text-sm"
                    >
                      {app.requisition.title}
                    </Link>
                    <span className="text-muted-foreground block text-[11px]">
                      {app.requisition.department || "Staffing Pipeline"} • {app.requisition.location || "Noida"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs font-semibold">
                      {app.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attached Source Resumes (Agency only) */}
      {!isClientRole && (
        <Card className="border-border/90 shadow-2xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span>Source Documents & Parsing Records</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Binary files stored securely outside the web root with SHA-256 fingerprinting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {candidate.uploadedDocuments.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 italic">
                No physical document attached (benchmark candidate fixture).
              </p>
            ) : (
              <div className="space-y-3">
                {candidate.uploadedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-border/70 bg-muted/20 text-xs shadow-2xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="font-bold text-foreground truncate block">
                        {doc.fileName}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                        <span>Hash: {doc.fileHash.slice(0, 16)}...</span>
                        {doc.fileSizeBytes && (
                          <span>• {(doc.fileSizeBytes / 1024).toFixed(1)} KB</span>
                        )}
                        <span>• Status: {doc.processingStatus}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/api/documents/${doc.id}/download`}
                        target="_blank"
                      >
                        <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5 shadow-2xs">
                          <Download className="h-3.5 w-3.5 text-primary" />
                          <span>Download CV</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
