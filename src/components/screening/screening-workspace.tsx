"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { ShinyBadge } from "@/components/ui/shiny-badge";
import {
  Play,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  ShieldAlert,
  Users,
  Eye,
  RotateCw,
  Sliders,
  Info,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { StartScreeningDialog } from "./start-screening-dialog";
import { EvaluationDetailModal } from "./evaluation-detail-modal";
import { UserRole } from "@prisma/client";

interface ScorecardCriterionItem {
  id: string;
  name: string;
  weight: number;
  isMustHave: boolean;
  minScore: number;
  maxScore: number;
}

interface ScreeningWorkspaceProps {
  requisitionId: string;
  requisitionTitle: string;
  scorecardCriteria?: ScorecardCriterionItem[];
  totalCriteriaWeight?: number;
  userRole?: string;
}

export function ScreeningWorkspace({
  requisitionId,
  requisitionTitle,
  scorecardCriteria = [],
  totalCriteriaWeight = 100,
  userRole,
}: ScreeningWorkspaceProps) {
  const [evaluations, setEvaluations] = React.useState<any[]>([]);
  const [summary, setSummary] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filter & Search states
  const [search, setSearch] = React.useState("");
  const [filterMustHave, setFilterMustHave] = React.useState<"all" | "warnings" | "no-warnings">("all");
  const [filterReviewed, setFilterReviewed] = React.useState<"all" | "reviewed" | "pending">("all");
  const [sortBy, setSortBy] = React.useState<"overallScore" | "coverage" | "createdAt">("overallScore");
  const [sortOrder, setSortOrder] = React.useState<"desc" | "asc">("desc");

  // Dialog & Modal states
  const [startScreeningOpen, setStartScreeningOpen] = React.useState(false);
  const [detailModalOpen, setDetailModalOpen] = React.useState(false);
  const [selectedEvaluationId, setSelectedEvaluationId] = React.useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);

  const isClientRole = userRole === UserRole.CLIENT_HIRING_MGR;

  const triggerRefresh = React.useCallback(() => {
    setLoading(true);
    setRefreshTrigger((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let isSubscribed = true;

    async function loadData() {
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (filterMustHave === "warnings") params.set("hasMustHaveWarnings", "true");
        if (filterMustHave === "no-warnings") params.set("hasMustHaveWarnings", "false");
        if (filterReviewed === "reviewed") params.set("isReviewed", "true");
        if (filterReviewed === "pending") params.set("isReviewed", "false");
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);

        const res = await fetch(`/api/requisitions/${requisitionId}/evaluations?${params.toString()}`);
        const data = await res.json();

        if (isSubscribed) {
          if (data.success) {
            setEvaluations(data.evaluations || []);
            if (data.summary) {
              setSummary(data.summary);
            }
          } else {
            setError(data.error || "Failed to load screening evaluations.");
          }
        }
      } catch {
        if (isSubscribed) {
          setError("Network error loading evaluations.");
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isSubscribed = false;
    };
  }, [requisitionId, search, filterMustHave, filterReviewed, sortBy, sortOrder, refreshTrigger]);

  const handleOpenEvaluationDetail = (evalId: string) => {
    setSelectedEvaluationId(evalId);
    setDetailModalOpen(true);
  };

  const handleInspectCVDirectly = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`/api/documents/${docId}/download?view=inline`, "_blank", "noopener,noreferrer");
    setTimeout(() => {
      triggerRefresh();
    }, 1000);
  };

  if (isClientRole) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3 shadow-2xs">
        <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto" />
        <h3 className="font-bold text-base text-foreground">Access Restricted</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Client hiring managers cannot access internal recruiter screening workspaces or unsubmitted candidate dossiers.
        </p>
      </div>
    );
  }

  const mustHaveCriteria = scorecardCriteria.filter((c) => c.isMustHave);

  return (
    <div className="space-y-6">
      {/* Prominent Advisory Disclaimer Banner */}
      <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-4 text-xs border border-primary/20 shadow-2xs">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-primary block text-xs">
              Operational Screening Governance & Ethical AI Guardrail
            </span>
            <ShinyBadge variant="warning" size="sm">
              AI Scores Advisory Only
            </ShinyBadge>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            AI screening scores reflect criteria matching evidence and are advisory only; human recruiter evaluation is required before making any candidate decisions.
          </p>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Evaluated Candidates"
          value={summary?.completedCount || 0}
          subtext={`${summary?.pendingCount || 0} pending • ${summary?.failedCount || 0} failed`}
          icon={<Users className="h-4 w-4 text-primary" />}
        />
        <MetricCard
          label="Avg Fit Score"
          value={
            summary?.averageScore !== null && summary?.averageScore !== undefined
              ? `${summary.averageScore} / 100`
              : "—"
          }
          subtext="Across completed evaluations"
          variant={
            (summary?.averageScore ?? 0) >= 75
              ? "success"
              : (summary?.averageScore ?? 0) >= 50
              ? "warning"
              : "default"
          }
          icon={<Sparkles className="h-4 w-4 text-emerald-600" />}
        />
        <MetricCard
          label="Must-Have Gate Warnings"
          value={summary?.mustHaveWarningCount || 0}
          subtext="Candidates failing mandatory gates"
          variant={(summary?.mustHaveWarningCount ?? 0) > 0 ? "warning" : "default"}
          icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
        />
        <MetricCard
          label="Recruiter Reviewed"
          value={summary?.reviewedCount || 0}
          subtext={`${summary?.pendingReviewCount || 0} awaiting review`}
          variant="highlight"
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
        />
      </div>

      {/* Scorecard Weights Breakdown & Action Header */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 rounded-xl border border-border/80 bg-card/60 p-4 shadow-2xs">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Sliders className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-foreground">
              Scorecard Configuration:
            </span>
            <Badge
              variant={totalCriteriaWeight === 100 ? "success" : "warning"}
              dot
              className="text-[10px] py-0 font-mono"
            >
              {totalCriteriaWeight}% Weight
            </Badge>
            {mustHaveCriteria.length > 0 && (
              <Badge variant="destructive" dot className="text-[10px] py-0 font-mono">
                {mustHaveCriteria.length} Must-Have Gate{mustHaveCriteria.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {scorecardCriteria.map((c) => (
              <span
                key={c.id}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono border ${
                  c.isMustHave
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 font-semibold"
                    : "border-border/80 bg-background text-foreground"
                }`}
              >
                {c.isMustHave && <ShieldAlert className="h-3 w-3 text-amber-600" />}
                <span>{c.name}</span>
                <span className="text-muted-foreground font-sans">({c.weight}%)</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerRefresh}
            disabled={loading}
            className="text-xs h-9 px-3 gap-1.5 shadow-2xs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setStartScreeningOpen(true)}
            disabled={totalCriteriaWeight !== 100}
            className="text-xs h-9 px-4 gap-1.5 shadow-2xs"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Start AI Screening</span>
          </Button>
        </div>
      </div>

      {/* Ranked Candidate Results Table */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs space-y-4 p-5">
        {/* Table Filter & Search Controls */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
            <Input
              placeholder="Search evaluations by candidate name, reference, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs h-9"
            />
          </div>

          {/* Filter Group */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterMustHave}
              onChange={(e) => setFilterMustHave(e.target.value as any)}
              className="h-9 rounded-lg border border-input bg-background/80 px-3 py-1 text-xs text-foreground shadow-2xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Gates (Must-Have)</option>
              <option value="warnings">⚠️ Has Must-Have Gaps</option>
              <option value="no-warnings">✓ All Gates Passed</option>
            </select>

            <select
              value={filterReviewed}
              onChange={(e) => setFilterReviewed(e.target.value as any)}
              className="h-9 rounded-lg border border-input bg-background/80 px-3 py-1 text-xs text-foreground shadow-2xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Review States</option>
              <option value="pending">Pending Recruiter Review</option>
              <option value="reviewed">Recruiter Reviewed</option>
            </select>

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split("-");
                setSortBy(sb as any);
                setSortOrder(so as any);
              }}
              className="h-9 rounded-lg border border-input bg-background/80 px-3 py-1 text-xs text-foreground shadow-2xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="overallScore-desc">Highest AI Score</option>
              <option value="overallScore-asc">Lowest AI Score</option>
              <option value="coverage-desc">Highest Coverage</option>
              <option value="createdAt-desc">Recently Evaluated</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <RotateCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-medium">Loading candidate rankings...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-xs text-destructive">
            {error}
          </div>
        ) : evaluations.length === 0 ? (
          <div className="text-center py-14 border border-dashed rounded-xl space-y-3 bg-muted/10">
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-2xs">
              <Users className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-foreground">
                No Candidate Evaluations Yet
              </h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No resumes have been screened against this requisition&apos;s scorecard. Click below to begin AI evaluation.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setStartScreeningOpen(true)}
              className="gap-1.5 text-xs shadow-2xs"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Initiate AI Screening</span>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 uppercase text-[10px] font-bold text-muted-foreground tracking-wider border-b border-border/80">
                <tr>
                  <th className="py-3 px-3 w-12 text-center">Rank</th>
                  <th className="py-3 px-3">Candidate</th>
                  <th className="py-3 px-3">Role & Experience</th>
                  <th className="py-3 px-3 text-center">AI Fit Score</th>
                  <th className="py-3 px-3 text-center">Evidence Coverage</th>
                  <th className="py-3 px-3 text-center">Must-Have Gates</th>
                  <th className="py-3 px-3 text-center">Review Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {evaluations.map((e, idx) => {
                  const score = Math.round(e.overallScore ?? 0);
                  const coverage = Math.round(e.evidenceCoverage ?? 0);
                  const candidate = e.candidate;

                  const scoreBadgeVariant =
                    score >= 75
                      ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                      : score >= 50
                      ? "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30"
                      : "text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/30";

                  return (
                    <tr
                      key={e.id}
                      onClick={() => handleOpenEvaluationDetail(e.id)}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      {/* Rank */}
                      <td className="py-3.5 px-3 text-center font-bold font-mono text-muted-foreground">
                        #{idx + 1}
                      </td>

                      {/* Candidate */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-foreground">
                          {candidate?.fullName || "Confidential Candidate"}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {candidate?.candidateReference}
                        </div>
                      </td>

                      {/* Role & Experience */}
                      <td className="py-3.5 px-3">
                        <div className="font-medium text-foreground">
                          {candidate?.currentRole || "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {candidate?.experienceYears !== null
                            ? `${candidate.experienceYears} yrs experience`
                            : "Experience not specified"}
                        </div>
                      </td>

                      {/* AI Score */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-block font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-md border ${scoreBadgeVariant}`}
                        >
                          {score}
                          <span className="text-[10px] font-normal opacity-80">/100</span>
                        </span>
                      </td>

                      {/* Evidence Coverage */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="font-mono font-bold text-foreground">
                            {coverage}%
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {e.supportedCount}S • {e.partialCount}P • {e.insufficientCount}I
                          </span>
                        </div>
                      </td>

                      {/* Must-Have Gates */}
                      <td className="py-3.5 px-3 text-center">
                        {e.hasMustHaveWarnings ? (
                          <Badge
                            variant="warning"
                            dot
                            className="text-[10px] gap-1 py-0.5"
                            title={e.mustHaveWarnings?.join("; ")}
                          >
                            <span>Must-Have Gap</span>
                          </Badge>
                        ) : (
                          <Badge variant="success" dot className="text-[10px] gap-1 py-0.5">
                            <span>Gates Met</span>
                          </Badge>
                        )}
                      </td>

                      {/* Recruiter Review Status */}
                      <td className="py-3.5 px-3 text-center">
                        {e.isReviewedByRecruiter ? (
                          <Badge variant="success" dot className="text-[10px] gap-1 py-0.5">
                            <span>Reviewed</span>
                          </Badge>
                        ) : (
                          <Badge variant="outline" dot className="text-[10px] gap-1 py-0.5 text-amber-700 dark:text-amber-400 border-amber-500/40">
                            <span>Pending Review</span>
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {e.documentId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(ev) => handleInspectCVDirectly(e.documentId, ev)}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              title="Inspect original CV"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span className="sr-only">Inspect CV</span>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleOpenEvaluationDetail(e.id);
                            }}
                            className="h-7 px-2.5 text-xs gap-1 shadow-2xs"
                          >
                            <Eye className="h-3 w-3 text-primary" />
                            <span>Dossier</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Start Screening Dialog */}
      <StartScreeningDialog
        requisitionId={requisitionId}
        requisitionTitle={requisitionTitle}
        isOpen={startScreeningOpen}
        onClose={() => setStartScreeningOpen(false)}
        onScreeningCompleted={() => {
          triggerRefresh();
        }}
      />

      {/* Evaluation Detail Modal */}
      <EvaluationDetailModal
        evaluationId={selectedEvaluationId}
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedEvaluationId(null);
        }}
        onReviewUpdated={() => {
          triggerRefresh();
        }}
      />
    </div>
  );
}
