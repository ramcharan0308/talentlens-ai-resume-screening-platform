"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X,
  History,
  Calendar,
  User,
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Loader2,
  Briefcase,
  FileText,
  ShieldCheck,
  Send,
  MessageSquare,
  XCircle,
} from "lucide-react";

interface ApplicationTimelineDialogProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string | null;
}

export function ApplicationTimelineDialog({
  isOpen,
  onClose,
  applicationId,
}: ApplicationTimelineDialogProps) {
  if (!isOpen || !applicationId) return null;

  return (
    <ApplicationTimelineDialogContent
      key={applicationId}
      applicationId={applicationId}
      onClose={onClose}
    />
  );
}

function ApplicationTimelineDialogContent({
  applicationId,
  onClose,
}: {
  applicationId: string;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isSubscribed = true;

    async function fetchHistory() {
      try {
        const res = await fetch(`/api/applications/${applicationId}/history`);
        const json = await res.json();
        if (isSubscribed) {
          if (json.success) {
            setData(json);
          } else {
            setError(json.error || "Failed to load application history.");
          }
        }
      } catch (err: any) {
        if (isSubscribed) {
          setError(err?.message || "Network error loading history.");
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    fetchHistory();

    return () => {
      isSubscribed = false;
    };
  }, [applicationId]);

  const getEventIcon = (event: string) => {
    if (event.includes("CREATED") || event.includes("SOURCED")) return <Briefcase className="h-4 w-4 text-primary" />;
    if (event.includes("SCREENING") || event.includes("EVALUATION")) return <FileText className="h-4 w-4 text-indigo-500" />;
    if (event.includes("REVIEW")) return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
    if (event.includes("SUBMITTED")) return <Send className="h-4 w-4 text-blue-600" />;
    if (event.includes("SHORTLISTED")) return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    if (event.includes("REJECTED")) return <XCircle className="h-4 w-4 text-destructive" />;
    if (event.includes("INTERVIEW")) return <Calendar className="h-4 w-4 text-amber-600" />;
    if (event.includes("OFFER")) return <Briefcase className="h-4 w-4 text-purple-600" />;
    if (event.includes("JOINED")) return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-card border border-border shadow-2xl animate-in fade-in-0 zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">Application Lifecycle & Audit History</h2>
            </div>
            {data?.application && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <Badge variant="outline" className="font-mono text-[11px]">
                  {data.application.candidateReference}
                </Badge>
                <span>• {data.application.requisitionTitle}</span>
                <Badge variant="secondary" className="text-[10px]">
                  Current: {data.application.status}
                </Badge>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Loading chronological transition history...</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && data?.timeline && (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border">
              {data.timeline.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No chronological events recorded for this application.
                </p>
              ) : (
                data.timeline.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="relative group">
                    {/* Event Dot / Icon */}
                    <div className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border shadow-sm group-hover:border-primary transition-colors">
                      {getEventIcon(item.event)}
                    </div>

                    <div className="bg-muted/30 border border-border/70 rounded-lg p-3 space-y-1.5 hover:border-border transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-foreground">
                            {item.event.replace(/_/g, " ")}
                          </span>
                          {item.stage && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                              {item.stage}
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <User className="h-3 w-3" /> {item.actorName} ({item.actorRole})
                        </span>
                        {item.organizationName && (
                          <span className="flex items-center gap-1">
                            • <Building2 className="h-3 w-3" /> {item.organizationName}
                          </span>
                        )}
                      </div>

                      {/* Event Details / Notes */}
                      {item.details && Object.keys(item.details).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/40 text-[11px] space-y-1">
                          {item.details.reason && (
                            <p className="text-destructive font-medium">
                              Reason: &ldquo;{item.details.reason}&rdquo;
                            </p>
                          )}
                          {item.details.rejectionReason && (
                            <p className="text-destructive font-medium">
                              Rejection Reason: &ldquo;{item.details.rejectionReason}&rdquo;
                            </p>
                          )}
                          {item.details.scheduledSlot && (
                            <p className="text-blue-600 dark:text-blue-400 font-medium">
                              Scheduled Slot: {new Date(item.details.scheduledSlot).toLocaleString()}
                            </p>
                          )}
                          {item.details.scheduledNote && (
                            <p className="text-muted-foreground">
                              Agenda / Note: {item.details.scheduledNote}
                            </p>
                          )}
                          {item.details.proposedSlot && (
                            <p className="text-amber-600 dark:text-amber-400 font-medium">
                              Proposed Slot: {new Date(item.details.proposedSlot).toLocaleString()}
                            </p>
                          )}
                          {item.details.note && (
                            <p className="text-muted-foreground">
                              Note: {item.details.note}
                            </p>
                          )}
                          {item.details.overallScore !== undefined && (
                            <p className="text-muted-foreground">
                              AI Score: <strong className="text-foreground">{item.details.overallScore}/100</strong> (Coverage: {item.details.evidenceCoverage}%)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

