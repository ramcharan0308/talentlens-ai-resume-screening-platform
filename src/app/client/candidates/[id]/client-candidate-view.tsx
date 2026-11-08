"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Users,
  Briefcase,
  MapPin,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RotateCw,
  Clock,
  ShieldCheck,
  Quote,
  Info,
  ChevronLeft,
} from "lucide-react";
import { AuthenticatedUser } from "@/lib/auth";

interface Props {
  user: AuthenticatedUser;
  candidateId: string;
}

export function ClientCandidateDetailView({ user, candidateId }: Props) {
  const [data, setData] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Decision State
  const [decisionType, setDecisionType] = React.useState<"SHORTLIST" | "REJECT" | "PROPOSE_INTERVIEW" | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [proposedSlot, setProposedSlot] = React.useState("");
  const [proposedNote, setProposedNote] = React.useState("");
  const [submittingAction, setSubmittingAction] = React.useState(false);
  const [actionFeedback, setActionFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchCandidate = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/client/candidates/${candidateId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load candidate dossier.");
      }
    } catch {
      setError("Network error loading candidate.");
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchCandidate();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchCandidate]);

  const handleDecisionSubmit = async () => {
    if (!data?.applicationId || !decisionType) return;
    setSubmittingAction(true);
    setActionFeedback(null);

    try {
      const res = await fetch(`/api/client/applications/${data.applicationId}/decision`, {
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
              ? "Candidate rejected with reason recorded."
              : "Interview proposed!",
        });
        setTimeout(() => {
          setDecisionType(null);
          setRejectionReason("");
          setProposedSlot("");
          setProposedNote("");
          fetchCandidate();
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED_TO_CLIENT":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300">Pending Client Review</Badge>;
      case "CLIENT_SHORTLISTED":
        return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300">Shortlisted</Badge>;
      case "INTERVIEW_PROPOSED":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300">Interview Proposed</Badge>;
      case "CLIENT_REJECTED":
        return <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading && !data) {
    return (
      <div className="container py-12 max-w-4xl space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3"></div>
        <div className="h-32 bg-muted rounded"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="container py-12 max-w-4xl">
        <Card className="p-6 text-center border-destructive/40 bg-destructive/5">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <h2 className="text-lg font-bold text-destructive">Candidate Not Found</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">{error}</p>
          <Link href="/client">
            <Button variant="outline" size="sm">Return to Dashboard</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const { candidate, requisition, aiScreeningAssessment, status } = data;

  return (
    <div className="container py-8 max-w-4xl space-y-6 page-animate">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs">
            <Link href="/client" className="text-muted-foreground hover:text-foreground">
              ← Client Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">Candidate Dossier</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {candidate.candidateReference}
            </h1>
            {getStatusBadge(status)}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Submitted for: <span className="font-semibold text-foreground">{requisition.title}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={fetchCandidate} variant="ghost" size="sm" className="h-8 w-8 p-0">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Masked Info Notice */}
      <div className="rounded-lg border bg-muted/40 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-foreground">Anti-Bias Data Protection: </span>
          Direct contact information (full name, phone, email, address) and raw CV documents are shielded to maintain objective, merit-grounded evaluations.
        </div>
      </div>

      {/* Candidate Profile Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Professional Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted/30 p-3 rounded-lg">
            <div>
              <span className="text-[10px] text-muted-foreground block">Current / Target Role</span>
              <span className="font-semibold text-sm">{candidate.currentRole || "Not specified"}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Total Experience</span>
              <span className="font-semibold text-sm">
                {candidate.experienceYears ? `${candidate.experienceYears} Years` : "Not stated"}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Stated Notice Period</span>
              <span className="font-semibold text-sm">
                {candidate.noticeDays ? `${candidate.noticeDays} Days` : "Immediate Availability"}
              </span>
            </div>
          </div>

          {candidate.keySkills?.length > 0 && (
            <div>
              <span className="text-[11px] font-medium text-muted-foreground block mb-1.5">
                Verified Technical Skills:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {candidate.keySkills.map((skill: string) => (
                  <Badge key={skill} variant="secondary" className="text-xs px-2 py-0.5 font-medium">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Screening Assessment */}
      {aiScreeningAssessment && (
        <Card className="border-blue-500/30">
          <CardHeader className="pb-3 border-b bg-blue-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-sm font-bold text-foreground">
                  AI Screening Assessment
                </CardTitle>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-lg font-bold font-mono text-foreground">
                    {Math.round(aiScreeningAssessment.overallScore ?? 0)}
                  </span>
                  <span className="text-xs text-muted-foreground"> / 100</span>
                </div>
                <Badge variant="outline" className="text-xs bg-background">
                  {Math.round(aiScreeningAssessment.evidenceCoverage ?? 0)}% Evidence Coverage
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-4 text-xs">
            {aiScreeningAssessment.hasMustHaveWarnings && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 p-3 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <span className="font-semibold block">Must-Have Criteria Warnings:</span>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    {aiScreeningAssessment.mustHaveWarnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Criteria Breakdown */}
            <div className="space-y-3">
              <span className="font-semibold text-foreground block">
                Criterion-Level Rubric & Evidence Quotations:
              </span>

              {aiScreeningAssessment.criterionScores?.map((crit: any) => (
                <div key={crit.id} className="border rounded-md p-3.5 bg-card space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-foreground">{crit.criterionName}</span>
                        {crit.isMustHave && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0">Must Have</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono">
                          (Weight: {crit.weight}%)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-xs">
                        {crit.score} / 10
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          crit.status === "SUPPORTED"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                            : crit.status === "PARTIAL"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                            : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30"
                        }`}
                      >
                        {crit.status}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-muted-foreground leading-relaxed">
                    {crit.explanation}
                  </p>

                  {/* Grounded Quotations */}
                  {Array.isArray(crit.quotes) && crit.quotes.length > 0 && (
                    <div className="bg-muted/40 p-2.5 rounded text-[11px] space-y-1">
                      <span className="font-medium text-foreground flex items-center gap-1">
                        <Quote className="h-3 w-3 text-muted-foreground" /> Grounded Evidence:
                      </span>
                      {crit.quotes.map((q: any, qi: number) => (
                        <blockquote key={qi} className="italic text-muted-foreground pl-3 border-l-2 border-primary/40">
                          &ldquo;{typeof q === "string" ? q : q.quote}&rdquo;
                        </blockquote>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Disclaimer */}
            <p className="text-[11px] text-muted-foreground italic border-t pt-2">
              {aiScreeningAssessment.disclaimer}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Decision Card */}
      <Card className="border-primary/30 shadow-md">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-sm font-bold text-foreground">
            Hiring Manager Decision & Actions
          </CardTitle>
          <CardDescription className="text-xs">
            Review decisions are recorded for audit compliance and direct notification to your agency recruiter.
          </CardDescription>
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

          {/* Current Decision Status */}
          {status === "CLIENT_REJECTED" ? (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 p-4 rounded-lg space-y-1">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Candidate Rejected by Client</span>
              </div>
              <p className="text-xs">
                <span className="font-semibold">Recorded Reason: </span>
                {data.clientRejectionReason}
              </p>
              <p className="text-[10px] text-muted-foreground pt-1">
                Decided on {data.clientDecisionAt ? new Date(data.clientDecisionAt).toLocaleString() : "N/A"}.
                Client rejection is a final decision and cannot be modified.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {status === "CLIENT_SHORTLISTED" && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 p-3 rounded-md flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>This candidate is currently shortlisted. You can propose an interview slot below.</span>
                </div>
              )}

              {status === "INTERVIEW_PROPOSED" && data.proposedInterviewSlot && (
                <div className="bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 p-3 rounded-md flex items-center gap-2">
                  <Calendar className="h-4 w-4 shrink-0 text-blue-600" />
                  <span>
                    Interview Proposed for: {new Date(data.proposedInterviewSlot).toLocaleString()}
                    {data.proposedInterviewNote ? ` ("${data.proposedInterviewNote}")` : ""}
                  </span>
                </div>
              )}

              {/* Action Selection Tabs */}
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
                  Shortlist Candidate
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
                  Propose Interview Slot
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
                  Reject Candidate
                </button>
              </div>

              {/* Decision Forms */}
              {decisionType === "SHORTLIST" && (
                <div className="bg-muted/20 p-3 rounded-md space-y-2">
                  <p className="text-muted-foreground">
                    Shortlisting acknowledges candidate suitability. You can propose an interview slot now or request your recruiter coordinate availability.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleDecisionSubmit}
                    disabled={submittingAction}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {submittingAction ? "Submitting..." : "Confirm Shortlist"}
                  </Button>
                </div>
              )}

              {decisionType === "PROPOSE_INTERVIEW" && (
                <div className="bg-muted/20 p-3 rounded-md space-y-3">
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
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      Treated as a requested time slot for recruiter coordination.
                    </span>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Optional Note for Recruiter</label>
                    <Textarea
                      placeholder="e.g. Technical panel with team lead..."
                      value={proposedNote}
                      onChange={(e) => setProposedNote(e.target.value)}
                      rows={2}
                      className="text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleDecisionSubmit}
                    disabled={submittingAction || !proposedSlot}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {submittingAction ? "Submitting..." : "Submit Interview Slot"}
                  </Button>
                </div>
              )}

              {decisionType === "REJECT" && (
                <div className="bg-rose-500/5 border border-rose-500/20 p-3 rounded-md space-y-3">
                  <div>
                    <label className="text-xs font-medium text-rose-900 dark:text-rose-200 block mb-1">
                      Mandatory Rejection Reason <span className="text-destructive">*</span>
                    </label>
                    <Textarea
                      placeholder="Explain the specific qualification or fit gaps (minimum 3 characters)..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                      className="text-xs"
                      required
                    />
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      A clear reason is required to maintain recruiter calibration and compliance.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleDecisionSubmit}
                    disabled={submittingAction || rejectionReason.trim().length < 3}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {submittingAction ? "Submitting..." : "Confirm Rejection"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
