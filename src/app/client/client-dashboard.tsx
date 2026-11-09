"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Briefcase,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  RotateCw,
  Search,
  Filter,
  FileText,
  ShieldCheck,
  Building2,
  ChevronRight,
  Info,
  X,
} from "lucide-react";
import { AuthenticatedUser } from "@/lib/auth";

interface DashboardData {
  organization: {
    id: string;
    name: string;
    type: string;
  };
  metrics: {
    activeRequisitionsCount: number;
    totalSubmittedCandidates: number;
    pendingReviewCount: number;
    shortlistedCount: number;
    interviewProposedCount: number;
    rejectedCount: number;
  };
  recentSubmissions: Array<{
    id: string;
    status: string;
    submittedAt: string;
    clientDecisionAt: string | null;
    clientRejectionReason: string | null;
    proposedInterviewSlot: string | null;
    proposedInterviewNote: string | null;
    candidate: {
      id: string;
      candidateReference: string;
      currentRole: string | null;
      experienceYears: number | null;
      keySkills: string[];
      noticeDays: number | null;
    };
    requisition: {
      id: string;
      title: string;
      department: string | null;
      location: string | null;
    };
    screeningSummary: {
      evaluationId: string;
      overallScore: number | null;
      evidenceCoverage: number | null;
      hasMustHaveWarnings: boolean;
      mustHaveWarnings: string[];
    } | null;
  }>;
}

export function ClientDashboardView({ user }: { user: AuthenticatedUser }) {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");

  // Decision Modal State
  const [selectedApp, setSelectedApp] = React.useState<any | null>(null);
  const [decisionType, setDecisionType] = React.useState<"SHORTLIST" | "REJECT" | "PROPOSE_INTERVIEW" | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [proposedSlot, setProposedSlot] = React.useState("");
  const [proposedNote, setProposedNote] = React.useState("");
  const [submittingAction, setSubmittingAction] = React.useState(false);
  const [actionFeedback, setActionFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchDashboard = React.useCallback(async () => {
    try {
      const res = await fetch("/api/client/dashboard");
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load client dashboard.");
      }
    } catch {
      setError("Network error loading dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchDashboard();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDashboard]);

  const handleDecisionSubmit = async () => {
    if (!selectedApp || !decisionType) return;
    setSubmittingAction(true);
    setActionFeedback(null);

    try {
      const res = await fetch(`/api/client/applications/${selectedApp.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: decisionType,
          rejectionReason: decisionType === "REJECT" ? rejectionReason : undefined,
          proposedSlot: decisionType === "PROPOSE_INTERVIEW" ? proposedSlot : undefined,
          note: decisionType === "PROPOSE_INTERVIEW" ? proposedNote : undefined,
        }),
      });

      const resData = await res.json();
      if (resData.success) {
        setActionFeedback({
          type: "success",
          message:
            decisionType === "SHORTLIST"
              ? "Candidate successfully shortlisted!"
              : decisionType === "REJECT"
              ? "Candidate rejected with reason recorded."
              : "Interview slot proposal successfully submitted!",
        });
        setTimeout(() => {
          setSelectedApp(null);
          setDecisionType(null);
          setRejectionReason("");
          setProposedSlot("");
          setProposedNote("");
          setActionFeedback(null);
          fetchDashboard();
        }, 1200);
      } else {
        setActionFeedback({
          type: "error",
          message: resData.error || "Failed to process decision.",
        });
      }
    } catch {
      setActionFeedback({
        type: "error",
        message: "Network error processing decision.",
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  const filteredSubmissions = (data?.recentSubmissions || []).filter((app) => {
    if (statusFilter !== "ALL" && app.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      app.candidate.candidateReference.toLowerCase().includes(q) ||
      (app.candidate.currentRole && app.candidate.currentRole.toLowerCase().includes(q)) ||
      app.requisition.title.toLowerCase().includes(q) ||
      app.candidate.keySkills.some((s) => s.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED_TO_CLIENT":
        return <Badge variant="warning" dot className="font-mono text-[10px]">Pending Review</Badge>;
      case "CLIENT_SHORTLISTED":
        return <Badge variant="success" dot className="font-mono text-[10px]">Shortlisted</Badge>;
      case "INTERVIEW_PROPOSED":
        return <Badge variant="info" dot className="font-mono text-[10px]">Interview Proposed</Badge>;
      case "CLIENT_REJECTED":
        return <Badge variant="destructive" dot className="font-mono text-[10px]">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="font-mono text-[10px]">{status}</Badge>;
    }
  };

  if (loading && !data) {
    return (
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-12 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-12">
        <Card className="border-destructive/40 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <h2 className="text-lg font-bold text-destructive">Failed to Load Dashboard</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-4">{error}</p>
          <Button onClick={fetchDashboard} variant="outline" className="gap-2 mx-auto text-xs">
            <RotateCw className="h-4 w-4" /> Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8 page-animate">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge variant="default" className="text-xs flex items-center gap-1 font-sans">
              <Building2 className="h-3.5 w-3.5" />
              <span>{data?.organization.name}</span>
            </Badge>
            <Badge variant="outline" className="text-xs font-mono">Client Hiring Portal</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Masked Candidate Privacy</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Candidate Review & Shortlist Decisions
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Review candidate dossiers submitted by your staffing partner with grounded AI evaluations.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/client/requisitions">
            <Button variant="outline" className="gap-1.5 text-xs h-9 shadow-2xs">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span>Assigned Requisitions</span>
            </Button>
          </Link>
          <Button onClick={fetchDashboard} variant="ghost" size="sm" className="h-9 w-9 p-0" title="Refresh">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Assigned Reqs"
          value={data?.metrics.activeRequisitionsCount ?? 0}
          subtext="Active positions"
          icon={<Briefcase className="h-4 w-4 text-primary" />}
        />
        <MetricCard
          label="Submissions"
          value={data?.metrics.totalSubmittedCandidates ?? 0}
          subtext="Total received"
          icon={<Users className="h-4 w-4 text-foreground/70" />}
        />
        <MetricCard
          label="Pending Review"
          value={data?.metrics.pendingReviewCount ?? 0}
          subtext="Awaiting decision"
          variant="warning"
          icon={<Clock className="h-4 w-4 text-amber-600" />}
        />
        <MetricCard
          label="Shortlisted"
          value={data?.metrics.shortlistedCount ?? 0}
          subtext="Client accepted"
          variant="success"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        />
        <MetricCard
          label="Interviews"
          value={data?.metrics.interviewProposedCount ?? 0}
          subtext="Slots proposed"
          variant="highlight"
          icon={<Calendar className="h-4 w-4 text-primary" />}
        />
        <MetricCard
          label="Rejected"
          value={data?.metrics.rejectedCount ?? 0}
          subtext="With recorded reasons"
          variant="danger"
          icon={<XCircle className="h-4 w-4 text-rose-600" />}
        />
      </div>

      {/* AI Assistance Notice */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3 text-xs shadow-2xs">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-primary block">
            Client Review Ethics & Privacy Notice:
          </span>
          <p className="text-muted-foreground leading-relaxed">
            Screening scores and verified quotations assist your review by highlighting match evidence from candidate resumes.
            They do not constitute automated decisions. Personal contact information is masked to preserve screening objectivity.
          </p>
        </div>
      </div>

      {/* Candidates Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Submitted Candidates</h2>
            <p className="text-xs text-muted-foreground">
              Showing candidate dossiers submitted specifically to {data?.organization.name}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
              <Input
                placeholder="Search reference, role, skill..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/60 text-xs font-medium">
              {[
                { key: "ALL", label: "All" },
                { key: "SUBMITTED_TO_CLIENT", label: "Pending" },
                { key: "CLIENT_SHORTLISTED", label: "Shortlisted" },
                { key: "INTERVIEW_PROPOSED", label: "Interviews" },
                { key: "CLIENT_REJECTED", label: "Rejected" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all select-none ${
                    statusFilter === tab.key
                      ? "bg-card text-foreground shadow-2xs border border-border/70"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submissions List */}
        {filteredSubmissions.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6 text-muted-foreground" />}
            title="No candidate submissions found"
            description="New candidate dossiers submitted by your staffing partner will appear here automatically."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSubmissions.map((app) => (
              <Card key={app.id} className="hover:border-primary/50 transition-all duration-200 shadow-2xs">
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-foreground">
                          {app.candidate.candidateReference}
                        </span>
                        {getStatusBadge(app.status)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        For: <span className="font-semibold text-foreground">{app.requisition.title}</span>
                      </div>
                    </div>

                    {app.screeningSummary && (
                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end font-mono">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="font-bold text-base text-foreground">
                            {Math.round(app.screeningSummary.overallScore ?? 0)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">/100</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {Math.round(app.screeningSummary.evidenceCoverage ?? 0)}% coverage
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-xs pt-0">
                  <div className="grid grid-cols-3 gap-2 bg-muted/30 p-2.5 rounded-lg border border-border/50 font-mono">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-sans block">Role</span>
                      <span className="font-semibold text-foreground truncate block">{app.candidate.currentRole || "Not specified"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-sans block">Experience</span>
                      <span className="font-semibold text-foreground">{app.candidate.experienceYears ? `${app.candidate.experienceYears} yrs` : "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-sans block">Notice</span>
                      <span className="font-semibold text-foreground">{app.candidate.noticeDays ? `${app.candidate.noticeDays} days` : "Immediate"}</span>
                    </div>
                  </div>

                  {app.candidate.keySkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {app.candidate.keySkills.slice(0, 5).map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-[10px] font-mono px-2 py-0.5">
                          {skill}
                        </Badge>
                      ))}
                      {app.candidate.keySkills.length > 5 && (
                        <span className="text-[10px] font-mono text-muted-foreground self-center">
                          +{app.candidate.keySkills.length - 5} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Decision History Notes */}
                  {app.status === "CLIENT_REJECTED" && app.clientRejectionReason && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 p-2.5 rounded-lg text-[11px]">
                      <span className="font-semibold">Rejection reason: </span>
                      &ldquo;{app.clientRejectionReason}&rdquo;
                    </div>
                  )}

                  {app.status === "INTERVIEW_PROPOSED" && app.proposedInterviewSlot && (
                    <div className="bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 p-2.5 rounded-lg text-[11px] flex items-center gap-1.5 font-mono">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        Slot: {new Date(app.proposedInterviewSlot).toLocaleString()}
                        {app.proposedInterviewNote ? ` — "${app.proposedInterviewNote}"` : ""}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2.5 border-t border-border/60">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Submitted {new Date(app.submittedAt).toLocaleDateString()}
                    </span>

                    <div className="flex items-center gap-2">
                      <Link href={`/client/candidates/${app.candidate.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1">
                          <span>View Dossier</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>

                      {app.status !== "CLIENT_REJECTED" && (
                        <Button
                          size="sm"
                          className="h-8 text-xs shadow-2xs"
                          onClick={() => {
                            setSelectedApp(app);
                            setDecisionType("SHORTLIST");
                          }}
                        >
                          Review / Action
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Decision Action Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <Card className="w-full max-w-lg shadow-xl border border-border bg-card">
            <CardHeader className="pb-3 border-b border-border/80">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">
                    Review Decision: {selectedApp.candidate.candidateReference}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Requisition: {selectedApp.requisition.title}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedApp(null);
                    setDecisionType(null);
                    setActionFeedback(null);
                  }}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4 text-xs">
              {actionFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium animate-in fade-in duration-200 ${
                    actionFeedback.type === "success"
                      ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20"
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}
                >
                  {actionFeedback.message}
                </div>
              )}

              <div className="space-y-1.5">
                <span className="font-semibold text-foreground">Select Decision Action:</span>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={decisionType === "SHORTLIST" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDecisionType("SHORTLIST")}
                    className="text-xs h-9 font-semibold"
                  >
                    Shortlist
                  </Button>
                  <Button
                    type="button"
                    variant={decisionType === "PROPOSE_INTERVIEW" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDecisionType("PROPOSE_INTERVIEW")}
                    className="text-xs h-9 font-semibold"
                  >
                    Interview Slot
                  </Button>
                  <Button
                    type="button"
                    variant={decisionType === "REJECT" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => setDecisionType("REJECT")}
                    className="text-xs h-9 font-semibold"
                  >
                    Reject
                  </Button>
                </div>
              </div>

              {decisionType === "REJECT" && (
                <div className="space-y-1.5">
                  <span className="font-semibold text-foreground">Rejection Reason (Required):</span>
                  <Textarea
                    placeholder="Provide constructive feedback regarding skills, experience, or requirements..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="text-xs min-h-[90px]"
                  />
                </div>
              )}

              {decisionType === "PROPOSE_INTERVIEW" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <span className="font-semibold text-foreground">Proposed Date & Time:</span>
                    <Input
                      type="datetime-local"
                      value={proposedSlot}
                      onChange={(e) => setProposedSlot(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="font-semibold text-foreground">Interview Notes / Instructions:</span>
                    <Input
                      placeholder="e.g. 45-minute technical screen via Google Meet"
                      value={proposedNote}
                      onChange={(e) => setProposedNote(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-border/80 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedApp(null);
                    setDecisionType(null);
                    setActionFeedback(null);
                  }}
                  className="text-xs h-8"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleDecisionSubmit}
                  isLoading={submittingAction}
                  disabled={
                    submittingAction ||
                    !decisionType ||
                    (decisionType === "REJECT" && !rejectionReason.trim()) ||
                    (decisionType === "PROPOSE_INTERVIEW" && !proposedSlot)
                  }
                  className="text-xs h-8"
                >
                  Confirm Decision
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
