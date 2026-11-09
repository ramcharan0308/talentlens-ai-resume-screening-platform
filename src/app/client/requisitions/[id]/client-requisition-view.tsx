"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  MapPin,
  Briefcase,
  Users,
  Sparkles,
  ChevronRight,
  RotateCw,
  Search,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Info,
} from "lucide-react";
import { AuthenticatedUser } from "@/lib/auth";

interface Props {
  user: AuthenticatedUser;
  requisitionId: string;
}

export function ClientRequisitionDetailView({ user, requisitionId }: Props) {
  const [data, setData] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");

  // Decision Modal State
  const [selectedApp, setSelectedApp] = React.useState<any | null>(null);
  const [decisionType, setDecisionType] = React.useState<"SHORTLIST" | "REJECT" | "PROPOSE_INTERVIEW" | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [proposedSlot, setProposedSlot] = React.useState("");
  const [proposedNote, setProposedNote] = React.useState("");
  const [submittingAction, setSubmittingAction] = React.useState(false);
  const [actionFeedback, setActionFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchDetail = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/client/requisitions/${requisitionId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load requisition details.");
      }
    } catch {
      setError("Network error loading requisition.");
    } finally {
      setLoading(false);
    }
  }, [requisitionId]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchDetail();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDetail]);

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
              ? "Candidate shortlisted!"
              : decisionType === "REJECT"
              ? "Rejection recorded."
              : "Interview proposed!",
        });
        setTimeout(() => {
          setSelectedApp(null);
          setDecisionType(null);
          setRejectionReason("");
          setProposedSlot("");
          setProposedNote("");
          setActionFeedback(null);
          fetchDetail();
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

  const applications = data?.applications || [];
  const filteredApps = applications.filter((app: any) => {
    if (statusFilter !== "ALL" && app.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      app.candidate.candidateReference.toLowerCase().includes(q) ||
      (app.candidate.currentRole && app.candidate.currentRole.toLowerCase().includes(q)) ||
      app.candidate.keySkills.some((s: string) => s.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED_TO_CLIENT":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 text-[10px]">Pending Review</Badge>;
      case "CLIENT_SHORTLISTED":
        return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 text-[10px]">Shortlisted</Badge>;
      case "INTERVIEW_PROPOSED":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 text-[10px]">Interview Proposed</Badge>;
      case "CLIENT_REJECTED":
        return <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 text-[10px]">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  if (loading && !data) {
    return (
      <div className="container py-12 max-w-6xl space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3"></div>
        <div className="h-24 bg-muted rounded"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="container py-12 max-w-6xl">
        <Card className="p-6 text-center border-destructive/40 bg-destructive/5">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-sm font-semibold text-destructive">{error}</p>
          <Button onClick={fetchDetail} variant="outline" size="sm" className="mt-3">
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const req = data.requisition;

  return (
    <div className="container py-8 max-w-6xl space-y-6 page-animate">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/client/requisitions" className="text-xs text-muted-foreground hover:text-foreground">
              ← Assigned Requisitions
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <Badge variant="outline" className="text-[10px]">{req.status}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{req.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
            {req.department && <span>🏢 {req.department}</span>}
            {req.location && <span>📍 {req.location}</span>}
            {req.targetSalaryRange && <span>💰 {req.targetSalaryRange}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/client">
            <Button variant="outline" size="sm" className="text-xs">Dashboard</Button>
          </Link>
          <Button onClick={fetchDetail} variant="ghost" size="sm" className="h-8 w-8 p-0">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Role Summary Accordion/Card */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 space-y-3 text-xs">
          <div>
            <span className="font-semibold text-foreground block mb-1">Job Description Overview:</span>
            <p className="text-muted-foreground line-clamp-3 whitespace-pre-line leading-relaxed">
              {req.jobDescription}
            </p>
          </div>
          {req.coreSkills?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-muted-foreground font-medium">Core Skills:</span>
              {req.coreSkills.map((skill: string) => (
                <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {skill}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Candidates Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Submitted Candidates ({applications.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Candidates reviewed and submitted by your staffing partner for this position.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search reference, role, skill..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>

            <div className="flex items-center gap-1 bg-muted p-0.5 rounded-md text-xs">
              {["ALL", "SUBMITTED_TO_CLIENT", "CLIENT_SHORTLISTED", "INTERVIEW_PROPOSED", "CLIENT_REJECTED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    statusFilter === st ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st === "ALL"
                    ? "All"
                    : st === "SUBMITTED_TO_CLIENT"
                    ? "Pending"
                    : st === "CLIENT_SHORTLISTED"
                    ? "Shortlisted"
                    : st === "INTERVIEW_PROPOSED"
                    ? "Interviews"
                    : "Rejected"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredApps.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No candidates found for this filter.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredApps.map((app: any) => (
              <Card key={app.id} className="hover:border-primary/40 transition-colors shadow-sm">
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-foreground">
                          {app.candidate.candidateReference}
                        </span>
                        {getStatusBadge(app.status)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {app.candidate.currentRole || "Candidate"}
                      </span>
                    </div>

                    {app.evaluation && (
                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                          <span className="font-mono font-bold text-base text-foreground">
                            {Math.round(app.evaluation.overallScore ?? 0)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">/100</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {Math.round(app.evaluation.evidenceCoverage ?? 0)}% coverage
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2 bg-muted/40 p-2.5 rounded-md">
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Experience</span>
                      <span className="font-medium">
                        {app.candidate.experienceYears ? `${app.candidate.experienceYears} yrs` : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Notice Period</span>
                      <span className="font-medium">
                        {app.candidate.noticeDays ? `${app.candidate.noticeDays} days` : "Immediate"}
                      </span>
                    </div>
                  </div>

                  {app.candidate.keySkills?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {app.candidate.keySkills.slice(0, 5).map((skill: string) => (
                        <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Decision History Notes */}
                  {app.status === "CLIENT_REJECTED" && app.clientRejectionReason && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 p-2 rounded text-[11px]">
                      <span className="font-semibold">Rejection reason: </span>
                      {app.clientRejectionReason}
                    </div>
                  )}

                  {app.status === "INTERVIEW_PROPOSED" && app.proposedInterviewSlot && (
                    <div className="bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 p-2 rounded text-[11px] flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Slot: {new Date(app.proposedInterviewSlot).toLocaleString()}
                        {app.proposedInterviewNote ? ` — "${app.proposedInterviewNote}"` : ""}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-[10px] text-muted-foreground">
                      Submitted {new Date(app.submittedAt).toLocaleDateString()}
                    </span>

                    <div className="flex items-center gap-2">
                      <Link href={`/client/candidates/${app.candidate.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          Full Dossier <ChevronRight className="h-3 w-3" />
                        </Button>
                      </Link>

                      {app.status !== "CLIENT_REJECTED" && (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
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

      {/* Decision Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-lg shadow-xl border bg-card">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">
                    Review Decision: {selectedApp.candidate.candidateReference}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Requisition: {req.title}
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
                  ✕
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4 text-xs">
              {actionFeedback && (
                <div
                  className={`p-3 rounded-md text-xs font-medium ${
                    actionFeedback.type === "success"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}
                >
                  {actionFeedback.message}
                </div>
              )}

              {/* Action Tabs */}
              <div className="flex rounded-md bg-muted p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setDecisionType("SHORTLIST")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
                    decisionType === "SHORTLIST"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Shortlist
                </button>
                <button
                  type="button"
                  onClick={() => setDecisionType("PROPOSE_INTERVIEW")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
                    decisionType === "PROPOSE_INTERVIEW"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Propose Interview
                </button>
                <button
                  type="button"
                  onClick={() => setDecisionType("REJECT")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
                    decisionType === "REJECT"
                      ? "bg-background text-foreground shadow-sm text-rose-600 dark:text-rose-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Reject
                </button>
              </div>

              {decisionType === "SHORTLIST" && (
                <div className="space-y-2 py-2">
                  <p className="text-muted-foreground">
                    Shortlisting approves this candidate for further processing by your staffing team.
                  </p>
                </div>
              )}

              {decisionType === "PROPOSE_INTERVIEW" && (
                <div className="space-y-3 py-1">
                  <div>
                    <label className="text-xs font-medium block mb-1">
                      Proposed Interview Date & Time <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type="datetime-local"
                      value={proposedSlot}
                      onChange={(e) => setProposedSlot(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Optional Note for Recruiter</label>
                    <Textarea
                      placeholder="e.g. Please arrange a 1-hour panel interview..."
                      value={proposedNote}
                      onChange={(e) => setProposedNote(e.target.value)}
                      rows={2}
                      className="text-xs"
                    />
                  </div>
                </div>
              )}

              {decisionType === "REJECT" && (
                <div className="space-y-3 py-1">
                  <div>
                    <label className="text-xs font-medium block mb-1">
                      Mandatory Rejection Reason <span className="text-destructive">*</span>
                    </label>
                    <Textarea
                      placeholder="e.g. Missing required system architecture experience..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                      className="text-xs"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedApp(null);
                    setDecisionType(null);
                    setActionFeedback(null);
                  }}
                  disabled={submittingAction}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleDecisionSubmit}
                  disabled={
                    submittingAction ||
                    (decisionType === "REJECT" && rejectionReason.trim().length < 3) ||
                    (decisionType === "PROPOSE_INTERVIEW" && !proposedSlot)
                  }
                  className={
                    decisionType === "REJECT"
                      ? "bg-rose-600 hover:bg-rose-700 text-white"
                      : "bg-primary text-primary-foreground"
                  }
                >
                  {submittingAction ? "Submitting..." : "Confirm Decision"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
