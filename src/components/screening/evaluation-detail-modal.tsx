"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  X,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  Info,
  Quote,
  Loader2,
  Calendar,
  Calculator,
  Eye,
  Check,
} from "lucide-react";

interface EvaluationDetailModalProps {
  evaluationId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onReviewUpdated?: () => void;
}

export function EvaluationDetailModal({
  evaluationId,
  isOpen,
  onClose,
  onReviewUpdated,
}: EvaluationDetailModalProps) {
  const [evaluation, setEvaluation] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = React.useState("");
  const [submittingReview, setSubmittingReview] = React.useState(false);
  const [reviewFeedback, setReviewFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [hasViewedCV, setHasViewedCV] = React.useState(false);
  const [submittingToClient, setSubmittingToClient] = React.useState(false);
  const [submissionFeedback, setSubmissionFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isSubmittedToClient, setIsSubmittedToClient] = React.useState(false);

  const handleClose = () => {
    setEvaluation(null);
    setError(null);
    setReviewNotes("");
    setReviewFeedback(null);
    setSubmissionFeedback(null);
    setIsSubmittedToClient(false);
    setHasViewedCV(false);
    onClose();
  };

  React.useEffect(() => {
    if (!isOpen || !evaluationId) return;

    let isSubscribed = true;

    async function fetchEvaluation() {
      try {
        const res = await fetch(`/api/evaluations/${evaluationId}`);
        const data = await res.json();
        if (isSubscribed) {
          if (data.success && data.evaluation) {
            setEvaluation(data.evaluation);
            setHasViewedCV(!!data.evaluation.hasCVBeenViewed);
          } else {
            setError(data.error || "Failed to load evaluation details.");
          }
        }
      } catch {
        if (isSubscribed) {
          setError("Network error fetching evaluation.");
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    fetchEvaluation();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, evaluationId]);

  if (!isOpen) return null;

  const handleInspectCV = (inline: boolean = true) => {
    if (!evaluation?.documentId) return;
    const url = `/api/documents/${evaluation.documentId}/download${
      inline ? "?view=inline" : ""
    }`;
    window.open(url, "_blank", "noopener,noreferrer");
    setHasViewedCV(true);
  };

  const handleMarkAsReviewed = async () => {
    if (!evaluationId || submittingReview) return;

    if (!hasViewedCV) {
      setReviewFeedback({
        type: "error",
        message:
          "Prerequisite check: Recruiter must inspect candidate's original CV before marking as reviewed.",
      });
      return;
    }

    setSubmittingReview(true);
    setReviewFeedback(null);

    try {
      const res = await fetch(`/api/evaluations/${evaluationId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: reviewNotes }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setReviewFeedback({
          type: "error",
          message: data.error || "Failed to record recruiter review.",
        });
      } else {
        setReviewFeedback({
          type: "success",
          message: "Evaluation successfully marked as reviewed.",
        });
        setEvaluation((prev: any) =>
          prev
            ? {
                ...prev,
                isReviewedByRecruiter: true,
                reviewedAt: new Date().toISOString(),
                reviewedBy: data.evaluation?.reviewedBy || prev.reviewedBy,
              }
            : null
        );
        if (onReviewUpdated) {
          onReviewUpdated();
        }
      }
    } catch {
      setReviewFeedback({
        type: "error",
        message: "Network error submitting review.",
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSubmitToClient = async () => {
    if (!evaluationId || submittingToClient) return;
    setSubmittingToClient(true);
    setSubmissionFeedback(null);

    try {
      const res = await fetch(`/api/evaluations/${evaluationId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmissionFeedback({
          type: "error",
          message: data.error || "Failed to submit candidate to client.",
        });
      } else {
        setIsSubmittedToClient(true);
        setSubmissionFeedback({
          type: "success",
          message: data.data?.isAlreadySubmitted
            ? "Candidate dossier was already submitted to this client."
            : `Candidate successfully submitted to ${data.data?.clientOrganizationName || "client"}!`,
        });
        if (onReviewUpdated) {
          onReviewUpdated();
        }
      }
    } catch {
      setSubmissionFeedback({
        type: "error",
        message: "Network error submitting candidate to client.",
      });
    } finally {
      setSubmittingToClient(false);
    }
  };

  const candidate = evaluation?.candidate;
  const criterionScores: any[] = evaluation?.criterionScores || [];
  const overallScore = Math.round(evaluation?.overallScore ?? 0);
  const evidenceCoverage = Math.round(evaluation?.evidenceCoverage ?? 0);

  const scoreColor =
    overallScore >= 75
      ? "text-emerald-500 border-emerald-500/40 bg-emerald-500/10"
      : overallScore >= 50
      ? "text-amber-500 border-amber-500/40 bg-amber-500/10"
      : "text-rose-500 border-rose-500/40 bg-rose-500/10";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/80 p-5 bg-card/60 backdrop-blur-sm">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-foreground tracking-tight">
                {candidate?.fullName || "Confidential Candidate"}
              </h2>
              <Badge variant="outline" className="font-mono text-xs">
                {candidate?.candidateReference}
              </Badge>
              {evaluation?.isReviewedByRecruiter ? (
                <Badge variant="success" className="text-xs gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Recruiter Reviewed</span>
                </Badge>
              ) : (
                <Badge variant="warning" className="text-xs gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Pending Recruiter Review</span>
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {candidate?.currentRole && (
                <span><strong>Role:</strong> {candidate.currentRole}</span>
              )}
              {candidate?.experienceYears !== null && (
                <span><strong>Experience:</strong> {candidate.experienceYears} yrs</span>
              )}
              {candidate?.noticeDays !== null && (
                <span><strong>Notice:</strong> {candidate.noticeDays} days</span>
              )}
              {evaluation?.createdAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Evaluated {new Date(evaluation.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading evaluation dossier...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-xs text-destructive">
              {error}
            </div>
          ) : (
            <>
              {/* Mandatory Must-Have Alert Banner */}
              {evaluation?.hasMustHaveWarnings ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                    <ShieldAlert className="h-5 w-5" />
                    <span>Mandatory Must-Have Requirement Warning</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    This candidate does not satisfy one or more mandatory screening gates configured for this requisition. Human recruiter review is required before client submission.
                  </p>
                  {evaluation.mustHaveWarnings && evaluation.mustHaveWarnings.length > 0 && (
                    <ul className="text-xs text-amber-800 dark:text-amber-300 list-disc list-inside space-y-0.5 font-medium">
                      {evaluation.mustHaveWarnings.map((warning: string, idx: number) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span><strong>All Must-Have Gates Met:</strong> Candidate satisfies all mandatory requisition criteria.</span>
                </div>
              )}

              {/* High-Level Score Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Overall Score */}
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${scoreColor}`}>
                  <span className="text-xs uppercase tracking-wider font-bold opacity-90">
                    AI Match Score
                  </span>
                  <div className="flex items-baseline gap-2 my-2">
                    <span className="text-4xl font-extrabold font-mono">{overallScore}</span>
                    <span className="text-sm font-medium opacity-80">/ 100</span>
                  </div>
                  <p className="text-[11px] opacity-80">
                    Deterministic weighted score computed across all criteria.
                  </p>
                </div>

                {/* Evidence Coverage */}
                <div className="p-4 rounded-xl border border-border bg-card flex flex-col justify-between">
                  <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                    Evidence Coverage
                  </span>
                  <div className="flex items-baseline gap-2 my-2">
                    <span className="text-4xl font-extrabold text-foreground font-mono">{evidenceCoverage}%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {evaluation?.supportedCount || 0} Supported • {evaluation?.partialCount || 0} Partial • {evaluation?.insufficientCount || 0} Insufficient
                  </p>
                </div>

                {/* CV Access Status */}
                <div className="p-4 rounded-xl border border-border bg-card flex flex-col justify-between">
                  <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                    Original Resume CV
                  </span>
                  <div className="my-2">
                    {hasViewedCV ? (
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                        <Check className="h-5 w-5" />
                        <span>CV Inspected</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold text-sm">
                        <AlertTriangle className="h-5 w-5" />
                        <span>Inspection Required</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleInspectCV(true)}
                      className="text-xs h-7 px-2.5 gap-1.5"
                    >
                      <Eye className="h-3 w-3" />
                      <span>View CV</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleInspectCV(false)}
                      className="text-xs h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
                      title="Download file"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Scoring Formula Transparency Box */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Calculator className="h-4 w-4 text-primary" />
                  <span>Transparent Scoring Formula:</span>
                </div>
                <p className="text-xs font-mono text-muted-foreground">
                  Score = &Sigma; (Criterion Score [1-10] &times; Weight %) / 10 = {overallScore}/100
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Weights sum to exactly 100%. Scores are strictly deterministic from verified evidence quotes.
                </p>
              </div>

              {/* Criterion-Level Detailed Dossier */}
              <div className="space-y-3.5">
                <h3 className="text-sm font-bold text-foreground tracking-tight">
                  Evaluation Criteria & Quoted Evidence
                </h3>

                <div className="space-y-3">
                  {criterionScores.map((c, idx) => {
                    const quotes = Array.isArray(c.quotes) ? c.quotes : [];
                    const isSupported = c.status === "SUPPORTED";
                    const isPartial = c.status === "PARTIAL";

                    return (
                      <div
                        key={c.id || idx}
                        className={`rounded-xl border p-4 space-y-3 ${
                          c.isMustHave && !isSupported
                            ? "border-amber-500/40 bg-amber-500/[0.02]"
                            : "border-border/80 bg-card"
                        }`}
                      >
                        {/* Criterion Title Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[10px] font-bold">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-sm text-foreground">
                              {c.criterionName}
                            </span>
                            {c.isMustHave && (
                              <Badge variant="warning" className="text-[10px] gap-1 py-0 font-semibold">
                                <ShieldAlert className="h-3 w-3" />
                                <span>Must-Have</span>
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono text-xs">
                              Weight: {c.weight}%
                            </Badge>
                            <Badge
                              variant={
                                isSupported
                                  ? "success"
                                  : isPartial
                                  ? "warning"
                                  : "outline"
                              }
                              className="text-xs font-semibold"
                            >
                              {c.status}
                            </Badge>
                            <span className="font-mono font-bold text-xs bg-muted/80 px-2 py-0.5 rounded border border-border/60">
                              {c.score} / 10
                            </span>
                          </div>
                        </div>

                        {/* Explanation */}
                        {c.explanation && (
                          <div className="text-xs text-foreground/90 leading-relaxed">
                            {c.explanation}
                          </div>
                        )}

                        {/* Verified Quotes */}
                        {quotes.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                              <Quote className="h-3 w-3 text-emerald-500" />
                              <span>Verified Quoted Evidence from Resume:</span>
                            </span>
                            <div className="space-y-1.5">
                              {quotes.map((q: any, qIdx: number) => (
                                <div
                                   key={qIdx}
                                  className="flex items-start gap-2 rounded-lg bg-emerald-500/[0.07] border border-emerald-500/20 p-2.5 text-xs text-foreground font-mono"
                                >
                                  <span className="text-emerald-500 font-bold">&ldquo;</span>
                                  <div className="flex-1 space-y-1">
                                    <p className="leading-relaxed">{q.quote}</p>
                                    <div className="flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-sans">
                                      <span className="flex items-center gap-1 font-medium">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Verified in original resume
                                      </span>
                                      {q.startOffset !== undefined && q.endOffset !== undefined && (
                                        <span className="text-muted-foreground font-mono">
                                          (Offset {q.startOffset}–{q.endOffset})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-emerald-500 font-bold">&rdquo;</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Missing Gaps */}
                        {c.missingGaps && c.missingGaps.length > 0 && (
                          <div className="rounded-lg bg-muted/40 p-2.5 text-xs space-y-1">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                              Identified Missing Gaps:
                            </span>
                            <ul className="list-disc list-inside text-muted-foreground text-[11px] space-y-0.5">
                              {c.missingGaps.map((gap: string, gIdx: number) => (
                                <li key={gIdx}>{gap}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Safety Disclaimer Banner */}
              <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-muted/40 p-4 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-foreground">
                    Safety & Non-Discrimination Policy
                  </p>
                  <p>
                    An <strong>INSUFFICIENT</strong> status indicates an absence of explicit mention in the candidate&apos;s submitted resume. It does not constitute proof that the candidate lacks the skill. Recruiter verification and candidate interview remain authoritative.
                  </p>
                </div>
              </div>

              {/* Recruiter Review Action Box */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-foreground">
                      Human Recruiter Review Sign-Off
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Recruiters must inspect the original CV before marking this evaluation as reviewed.
                    </p>
                  </div>
                  {evaluation?.isReviewedByRecruiter && evaluation?.reviewedBy && (
                    <div className="text-right text-xs text-muted-foreground">
                      <span>Reviewed by <strong>{evaluation.reviewedBy.name}</strong></span>
                      {evaluation.reviewedAt && (
                        <p className="text-[10px]">
                          {new Date(evaluation.reviewedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {reviewFeedback && (
                  <div
                    className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
                      reviewFeedback.type === "success"
                        ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                        : "bg-destructive/10 border border-destructive/30 text-destructive"
                    }`}
                  >
                    {reviewFeedback.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>{reviewFeedback.message}</span>
                  </div>
                )}

                {!hasViewedCV && !evaluation?.isReviewedByRecruiter && (
                  <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-800 dark:text-amber-300">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        You have not yet viewed the original candidate CV. Inspection is required before recording review.
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleInspectCV(true)}
                      className="text-xs h-7 gap-1"
                    >
                      <Eye className="h-3 w-3" />
                      <span>Inspect CV Now</span>
                    </Button>
                  </div>
                )}

                {!evaluation?.isReviewedByRecruiter && (
                  <div className="space-y-3">
                    <Textarea
                      placeholder="Add optional notes for this review (e.g. verified AWS cert via LinkedIn, candidate confirmed Kubernetes experience during prescreen)..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="text-xs min-h-[70px]"
                      disabled={submittingReview}
                    />

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        onClick={handleMarkAsReviewed}
                        disabled={submittingReview || !hasViewedCV}
                        className="gap-1.5"
                      >
                        {submittingReview ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Recording Review...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Mark as Reviewed by Recruiter</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Recruiter Submission to Client */}
              {evaluation?.isReviewedByRecruiter && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">
                        Submit Candidate to Client Organization
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Release this reviewed candidate dossier to the hiring manager portal.
                      </p>
                    </div>
                    {isSubmittedToClient && (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs">
                        Submitted to Client
                      </Badge>
                    )}
                  </div>

                  {submissionFeedback && (
                    <div
                      className={`rounded-xl p-3 text-xs flex items-center gap-2 ${
                        submissionFeedback.type === "success"
                          ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                          : "bg-destructive/10 border border-destructive/30 text-destructive"
                      }`}
                    >
                      {submissionFeedback.type === "success" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0" />
                      )}
                      <span>{submissionFeedback.message}</span>
                    </div>
                  )}

                  {!isSubmittedToClient && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        Client will receive masked candidate qualifications and grounded screening evidence.
                      </span>
                      <Button
                        onClick={handleSubmitToClient}
                        disabled={submittingToClient}
                        className="gap-1.5 text-xs bg-primary text-primary-foreground"
                      >
                        {submittingToClient ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Submitting to Client...</span>
                          </>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Submit to Client</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/80 p-4 bg-muted/20">
          <div className="flex items-center gap-2">
            {evaluation?.documentId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleInspectCV(true)}
                className="text-xs gap-1.5"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>View Original CV</span>
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Close Dossier
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
