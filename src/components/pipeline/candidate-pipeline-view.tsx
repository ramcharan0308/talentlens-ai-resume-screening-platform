"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ApplicationStatus, UserRole } from "@prisma/client";
import {
  Search,
  Filter,
  RefreshCw,
  Clock,
  ArrowRight,
  History,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Send,
  User,
  Sliders,
  ChevronRight,
  Briefcase,
  XCircle,
  Eye,
  Layers,
  Sparkles,
} from "lucide-react";
import { StageTransitionDialog } from "./stage-transition-dialog";
import { ApplicationTimelineDialog } from "./application-timeline-dialog";
import { ALLOWED_TRANSITIONS } from "@/lib/pipeline/transition-service";

interface CandidatePipelineViewProps {
  requisitionId: string;
  requisitionTitle: string;
  userRole?: string;
  onOpenScreening?: () => void;
}

interface PipelineCandidate {
  id: string;
  candidateId: string;
  candidateReference: string;
  fullName?: string;
  currentRole?: string | null;
  experienceYears?: number | null;
  keySkills: string[];
  noticeDays?: number | null;
  status: ApplicationStatus;
  submittedAt?: string | null;
  clientOrganization?: string | null;
  clientRejectionReason?: string | null;
  rejectionReason?: string | null;
  proposedInterviewSlot?: string | null;
  proposedInterviewNote?: string | null;
  interviewScheduledSlot?: string | null;
  interviewScheduledNote?: string | null;
  offeredAt?: string | null;
  joinedAt?: string | null;
  rejectedAt?: string | null;
  evaluation?: {
    id: string;
    status: string;
    overallScore: number | null;
    evidenceCoverage: number | null;
    hasMustHaveWarnings: boolean;
    mustHaveFailuresCount: number;
    isReviewedByRecruiter: boolean;
    documentId?: string | null;
  } | null;
}

interface PipelineColumnConfig {
  id: string;
  title: string;
  statuses: ApplicationStatus[];
  description: string;
  headerColor: string;
}

const PIPELINE_COLUMNS: PipelineColumnConfig[] = [
  {
    id: "sourced",
    title: "Sourced",
    statuses: [ApplicationStatus.SOURCED],
    description: "Candidates attached to role",
    headerColor: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800",
  },
  {
    id: "screened",
    title: "Screened",
    statuses: [ApplicationStatus.SCREENED],
    description: "AI-evaluated & recruiter reviewed",
    headerColor: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
  },
  {
    id: "submitted",
    title: "Submitted",
    statuses: [ApplicationStatus.SUBMITTED_TO_CLIENT],
    description: "Sent to client hiring manager",
    headerColor: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  {
    id: "client_review",
    title: "Client Review",
    statuses: [ApplicationStatus.CLIENT_SHORTLISTED, ApplicationStatus.INTERVIEW_PROPOSED],
    description: "Shortlisted or interview slot proposed",
    headerColor: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
  {
    id: "interview",
    title: "Interview",
    statuses: [ApplicationStatus.INTERVIEW_SCHEDULED, ApplicationStatus.INTERVIEW_COMPLETED],
    description: "Confirmed schedule or completed rounds",
    headerColor: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  },
  {
    id: "offered_joined",
    title: "Offer & Joined",
    statuses: [ApplicationStatus.OFFERED, ApplicationStatus.JOINED],
    description: "Offer extended or candidate onboarded",
    headerColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  },
  {
    id: "rejected",
    title: "Terminal",
    statuses: [ApplicationStatus.CLIENT_REJECTED, ApplicationStatus.REJECTED],
    description: "Agency or client rejection (terminal)",
    headerColor: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  },
];

export function CandidatePipelineView({
  requisitionId,
  requisitionTitle,
  userRole,
  onOpenScreening,
}: CandidatePipelineViewProps) {
  const [applications, setApplications] = React.useState<PipelineCandidate[]>([]);
  const [stageCounts, setStageCounts] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState("");
  const [selectedColumnFilter, setSelectedColumnFilter] = React.useState<string>("all");

  // Dialog states
  const [transitionTargetApp, setTransitionTargetApp] = React.useState<PipelineCandidate | null>(null);
  const [historyTargetAppId, setHistoryTargetAppId] = React.useState<string | null>(null);

  const fetchPipeline = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/requisitions/${requisitionId}/pipeline?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setApplications(json.applications || []);
        setStageCounts(json.stageCounts || {});
      } else {
        setError(json.error || "Failed to load candidate pipeline.");
      }
    } catch (err: any) {
      setError(err?.message || "Network error loading pipeline.");
    } finally {
      setLoading(false);
    }
  }, [requisitionId, search]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchPipeline();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchPipeline]);

  const getCandidatesForColumn = (column: PipelineColumnConfig) => {
    return applications.filter((app) => column.statuses.includes(app.status));
  };

  const getColumnCandidateCount = (column: PipelineColumnConfig) => {
    return column.statuses.reduce((sum, st) => sum + (stageCounts[st] || 0), 0);
  };

  return (
    <div className="space-y-6">
      {/* Overview Stage Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {PIPELINE_COLUMNS.map((col) => {
          const count = getColumnCandidateCount(col);
          const isSelected = selectedColumnFilter === col.id;
          return (
            <button
              key={col.id}
              onClick={() => setSelectedColumnFilter(isSelected ? "all" : col.id)}
              className={`p-3 rounded-xl border text-left transition-all duration-150 select-none ${
                isSelected
                  ? "ring-2 ring-primary border-primary bg-primary/5 shadow-2xs"
                  : "border-border/80 hover:border-border hover:bg-card bg-card/60"
              }`}
            >
              <span className="text-[11px] font-bold text-muted-foreground block truncate">
                {col.title}
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-extrabold text-foreground font-mono">{count}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {col.statuses.map((s) => s.slice(0, 3)).join("/")}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Control Bar: Search, Quick Filter, and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border/80 shadow-2xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
            <Input
              placeholder="Search by reference, name, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs h-8"
            />
          </div>
          {search && (
            <Button size="sm" variant="ghost" onClick={() => setSearch("")} className="h-8 px-2 text-xs">
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedColumnFilter !== "all" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedColumnFilter("all")}
              className="h-8 text-xs gap-1.5 shadow-2xs"
            >
              <Filter className="h-3 w-3" />
              <span>Show All Stages</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={fetchPipeline}
            disabled={loading}
            className="h-8 text-xs gap-1.5 shadow-2xs"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          {onOpenScreening && (
            <Button
              size="sm"
              onClick={onOpenScreening}
              className="h-8 text-xs gap-1.5 shadow-2xs"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Screening Workspace</span>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive flex items-center gap-2.5">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pipeline Board / Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
        {PIPELINE_COLUMNS.filter(
          (col) => selectedColumnFilter === "all" || selectedColumnFilter === col.id
        ).map((col) => {
          const colCandidates = getCandidatesForColumn(col);

          return (
            <div
              key={col.id}
              className="flex flex-col rounded-xl border border-border/80 bg-card/60 shadow-2xs overflow-hidden"
            >
              {/* Column Header */}
              <div className={`p-3 border-b flex items-center justify-between ${col.headerColor}`}>
                <div className="space-y-0.5">
                  <span className="font-bold text-xs uppercase tracking-wider block">{col.title}</span>
                  <span className="text-[10px] opacity-80 block truncate max-w-[200px]">{col.description}</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 bg-background/60 font-bold">
                  {colCandidates.length}
                </Badge>
              </div>

              {/* Column Cards */}
              <div className="p-3 space-y-3 min-h-[160px] max-h-[650px] overflow-y-auto">
                {colCandidates.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl bg-background/40">
                    No candidates in this stage
                  </div>
                ) : (
                  colCandidates.map((candidate) => (
                    <Card
                      key={candidate.id}
                      className="border border-border/80 hover:border-primary/50 hover:shadow-xs transition-all duration-150 bg-card text-foreground"
                    >
                      <CardContent className="p-3.5 space-y-2.5">
                        {/* Top Reference & Stage Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="font-mono text-xs font-bold text-primary block">
                              {candidate.candidateReference}
                            </span>
                            {candidate.fullName && (
                              <h4 className="font-bold text-xs text-foreground truncate max-w-[170px]">
                                {candidate.fullName}
                              </h4>
                            )}
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 shrink-0">
                            {candidate.status.replace(/_/g, " ")}
                          </Badge>
                        </div>

                        {/* Role & Experience */}
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          {candidate.currentRole && (
                            <span className="flex items-center gap-1 text-foreground font-medium">
                              <Briefcase className="h-3 w-3 text-muted-foreground" />
                              {candidate.currentRole}
                            </span>
                          )}
                          {candidate.experienceYears !== null && candidate.experienceYears !== undefined && (
                            <span className="font-mono">• {candidate.experienceYears}y exp</span>
                          )}
                          {candidate.noticeDays !== null && candidate.noticeDays !== undefined && (
                            <span className="font-mono">• {candidate.noticeDays}d notice</span>
                          )}
                        </div>

                        {/* Skills */}
                        {candidate.keySkills && candidate.keySkills.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {candidate.keySkills.slice(0, 3).map((skill, sIdx) => (
                              <span
                                key={sIdx}
                                className="text-[9px] font-mono bg-muted text-foreground px-1.5 py-0.5 rounded border border-border/50"
                              >
                                {skill}
                              </span>
                            ))}
                            {candidate.keySkills.length > 3 && (
                              <span className="text-[9px] font-mono text-muted-foreground">
                                +{candidate.keySkills.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Evaluation Score Indicator */}
                        {candidate.evaluation && (
                          <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                  (candidate.evaluation.overallScore ?? 0) >= 80
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                    : (candidate.evaluation.overallScore ?? 0) >= 60
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                    : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                                }`}
                              >
                                {candidate.evaluation.overallScore ?? 0}/100
                              </span>
                              <span className="text-muted-foreground text-[10px] font-mono">
                                ({candidate.evaluation.evidenceCoverage}% ev)
                              </span>
                            </div>

                            {candidate.evaluation.hasMustHaveWarnings && (
                              <Badge variant="warning" dot className="text-[9px] py-0 px-1 gap-1">
                                <span>Must-Have</span>
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Proposed and Scheduled Interview Slots */}
                        {candidate.proposedInterviewSlot && (
                          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="truncate font-mono">
                              Proposed: {new Date(candidate.proposedInterviewSlot).toLocaleString()}
                            </span>
                          </div>
                        )}

                        {candidate.interviewScheduledSlot && (
                          <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span className="truncate font-mono">
                              Interview: {new Date(candidate.interviewScheduledSlot).toLocaleString()}
                            </span>
                          </div>
                        )}

                        {/* Rejection reason badge */}
                        {(candidate.rejectionReason || candidate.clientRejectionReason) && (
                          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-lg text-[10px] text-destructive">
                            <span className="font-semibold block">Rejection Reason:</span>
                            <span className="italic line-clamp-2">
                              &ldquo;{candidate.rejectionReason || candidate.clientRejectionReason}&rdquo;
                            </span>
                          </div>
                        )}

                        {/* Card Action Buttons */}
                        <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setHistoryTargetAppId(candidate.id)}
                            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <History className="h-3 w-3" />
                            <span>Timeline</span>
                          </Button>

                          {ALLOWED_TRANSITIONS[candidate.status]?.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTransitionTargetApp(candidate)}
                              className="h-7 px-2.5 text-[11px] gap-1 font-semibold text-primary hover:bg-primary/10 border-primary/30 shadow-2xs"
                            >
                              <span>Advance</span>
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Transition Stage Dialog */}
      <StageTransitionDialog
        isOpen={Boolean(transitionTargetApp)}
        onClose={() => setTransitionTargetApp(null)}
        application={transitionTargetApp}
        userRole={userRole}
        onTransitionSuccess={fetchPipeline}
      />

      {/* Application Timeline & Audit History Dialog */}
      <ApplicationTimelineDialog
        isOpen={Boolean(historyTargetAppId)}
        onClose={() => setHistoryTargetAppId(null)}
        applicationId={historyTargetAppId}
      />
    </div>
  );
}
