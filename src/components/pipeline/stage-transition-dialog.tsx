"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ApplicationStatus, UserRole } from "@prisma/client";
import {
  X,
  ArrowRight,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Clock,
  Briefcase,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { ALLOWED_TRANSITIONS } from "@/lib/pipeline/transition-service";

interface StageTransitionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  application: {
    id: string;
    candidateReference: string;
    fullName?: string;
    currentRole?: string | null;
    status: ApplicationStatus;
    proposedInterviewSlot?: string | null;
  } | null;
  userRole?: string;
  onTransitionSuccess: () => void;
}

const STAGE_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.SOURCED]: "Sourced",
  [ApplicationStatus.SCREENED]: "Screened",
  [ApplicationStatus.SUBMITTED_TO_CLIENT]: "Submitted to Client",
  [ApplicationStatus.CLIENT_SHORTLISTED]: "Client Shortlisted",
  [ApplicationStatus.CLIENT_REJECTED]: "Client Rejected",
  [ApplicationStatus.INTERVIEW_PROPOSED]: "Interview Proposed",
  [ApplicationStatus.INTERVIEW_SCHEDULED]: "Interview Scheduled",
  [ApplicationStatus.INTERVIEW_COMPLETED]: "Interview Completed",
  [ApplicationStatus.OFFERED]: "Offered",
  [ApplicationStatus.JOINED]: "Joined",
  [ApplicationStatus.REJECTED]: "Rejected",
};

export function StageTransitionDialog({
  isOpen,
  onClose,
  application,
  userRole,
  onTransitionSuccess,
}: StageTransitionDialogProps) {
  if (!isOpen || !application) return null;

  return (
    <StageTransitionDialogContent
      key={application.id}
      application={application}
      onClose={onClose}
      userRole={userRole}
      onTransitionSuccess={onTransitionSuccess}
    />
  );
}

function StageTransitionDialogContent({
  application,
  onClose,
  userRole,
  onTransitionSuccess,
}: {
  application: NonNullable<StageTransitionDialogProps["application"]>;
  onClose: () => void;
  userRole?: string;
  onTransitionSuccess: () => void;
}) {
  const [targetStatus, setTargetStatus] = React.useState<ApplicationStatus | "">("");
  const [reason, setReason] = React.useState("");
  const [scheduledSlot, setScheduledSlot] = React.useState(
    application.proposedInterviewSlot
      ? new Date(application.proposedInterviewSlot).toISOString().slice(0, 16)
      : ""
  );
  const [scheduledNote, setScheduledNote] = React.useState("");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const allowedNext = ALLOWED_TRANSITIONS[application.status] || [];
  // Filter out client decisions if recruiter/delivery head
  const isClientRole = userRole === UserRole.CLIENT_HIRING_MGR;
  const clientAllowedStatuses: ApplicationStatus[] = [
    ApplicationStatus.CLIENT_SHORTLISTED,
    ApplicationStatus.CLIENT_REJECTED,
    ApplicationStatus.INTERVIEW_PROPOSED,
  ];
  const agencyBlockedStatuses: ApplicationStatus[] = [
    ApplicationStatus.CLIENT_SHORTLISTED,
    ApplicationStatus.CLIENT_REJECTED,
  ];

  const filteredNext = allowedNext.filter((status) => {
    if (isClientRole) {
      return clientAllowedStatuses.includes(status);
    } else {
      return !agencyBlockedStatuses.includes(status);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStatus) {
      setFeedback({ type: "error", message: "Please select a target stage." });
      return;
    }

    if (
      (targetStatus === ApplicationStatus.REJECTED || targetStatus === ApplicationStatus.CLIENT_REJECTED) &&
      (!reason || reason.trim().length < 3)
    ) {
      setFeedback({ type: "error", message: "A mandatory rejection reason of at least 3 characters is required." });
      return;
    }

    if (targetStatus === ApplicationStatus.INTERVIEW_SCHEDULED && !scheduledSlot) {
      setFeedback({ type: "error", message: "A valid scheduled interview date and time is required." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/applications/${application.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetStatus,
          reason: reason.trim() || undefined,
          scheduledSlot: scheduledSlot ? new Date(scheduledSlot).toISOString() : undefined,
          scheduledNote: scheduledNote.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({
          type: "error",
          message: data.error || "Failed to transition candidate stage.",
        });
      } else {
        setFeedback({
          type: "success",
          message: `Candidate successfully moved to ${STAGE_LABELS[targetStatus]}.`,
        });
        setTimeout(() => {
          onTransitionSuccess();
          onClose();
        }, 800);
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Network error transitioning candidate." });
    } finally {
      setSubmitting(false);
    }
  };

  const isTerminalRejection =
    targetStatus === ApplicationStatus.REJECTED || targetStatus === ApplicationStatus.CLIENT_REJECTED;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-xl bg-card border border-border shadow-2xl p-6 space-y-5 animate-in fade-in-0 zoom-in-95">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {application.candidateReference}
            </Badge>
            {application.fullName && (
              <span className="font-semibold text-sm text-foreground">{application.fullName}</span>
            )}
          </div>
          <h2 className="text-lg font-bold text-foreground">Advance Candidate Stage</h2>
          <p className="text-xs text-muted-foreground">
            Current Stage: <span className="font-semibold text-foreground">{STAGE_LABELS[application.status]}</span>
          </p>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : "bg-destructive/10 border border-destructive/30 text-destructive"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {filteredNext.length === 0 ? (
          <div className="p-4 bg-muted/40 rounded-lg text-xs text-muted-foreground text-center space-y-2">
            <ShieldAlert className="h-5 w-5 mx-auto text-amber-500" />
            <p className="font-semibold text-foreground">No outgoing transitions available</p>
            <p>
              This candidate application is in a terminal state (
              <span className="font-medium text-foreground">{STAGE_LABELS[application.status]}</span>) and cannot be
              reopened or transitioned further.
            </p>
            <Button size="sm" variant="outline" onClick={onClose} className="mt-2">
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Target Status Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground block">Select Target Stage:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredNext.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTargetStatus(st)}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-all flex items-center justify-between ${
                      targetStatus === st
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <span>{STAGE_LABELS[st]}</span>
                    {targetStatus === st && <ArrowRight className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Stage-Specific Fields */}
            {targetStatus === ApplicationStatus.INTERVIEW_SCHEDULED && (
              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  <Calendar className="h-4 w-4" />
                  <span>Interview Schedule Details</span>
                </div>
                {application.proposedInterviewSlot && (
                  <p className="text-[11px] text-muted-foreground">
                    Client proposed slot:{" "}
                    <strong className="text-foreground">
                      {new Date(application.proposedInterviewSlot).toLocaleString()}
                    </strong>
                  </p>
                )}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">Scheduled Date & Time *</label>
                  <Input
                    type="datetime-local"
                    value={scheduledSlot}
                    onChange={(e) => setScheduledSlot(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">Interview Agenda / Notes</label>
                  <Textarea
                    placeholder="e.g. Round 1 Technical Architecture Screen with Principal Engineer (Google Meet / Zoom)"
                    value={scheduledNote}
                    onChange={(e) => setScheduledNote(e.target.value)}
                    className="text-xs min-h-[60px]"
                  />
                </div>
              </div>
            )}

            {isTerminalRejection && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Terminal Rejection Confirmation</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Rejection is an explicit terminal action. Once rejected, the candidate cannot be reopened or transitioned
                  to active stages.
                </p>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-destructive">Mandatory Rejection Reason *</label>
                  <Textarea
                    placeholder="Explain why the candidate is being rejected (minimum 3 characters)..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    className="text-xs min-h-[70px] border-destructive/40 focus-visible:ring-destructive"
                  />
                </div>
              </div>
            )}

            {targetStatus === ApplicationStatus.JOINED && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Onboarding / Joined Confirmation</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Mark candidate as officially joined. This represents successful placement completion.
                </p>
              </div>
            )}

            {/* General optional transition note */}
            {!isTerminalRejection && (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Optional Transition Note</label>
                <Input
                  placeholder="Internal audit note or rationale..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !targetStatus}
                className={
                  isTerminalRejection
                    ? "bg-destructive hover:bg-destructive/90 text-white gap-1.5"
                    : "gap-1.5"
                }
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isTerminalRejection
                    ? "Confirm Rejection"
                    : targetStatus
                    ? `Move to ${STAGE_LABELS[targetStatus]}`
                    : "Advance Stage"}
                </span>
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
