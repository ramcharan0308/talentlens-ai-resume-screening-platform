"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { MetricCard } from "@/components/ui/metric-card";
import { RequisitionDetail } from "@/types";
import { RequisitionStatus, UserRole } from "@prisma/client";
import {
  ArrowLeft,
  Edit3,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Sliders,
  ShieldAlert,
  Users,
  Archive,
  RotateCcw,
  Briefcase,
  Building2,
  Layers,
  ChevronRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { ScreeningWorkspace } from "@/components/screening/screening-workspace";
import { CandidatePipelineView } from "@/components/pipeline/candidate-pipeline-view";

export function RequisitionDetailClientView({
  id,
  initialData,
  userRole,
}: {
  id: string;
  initialData?: any;
  userRole?: string;
}) {
  const [requisition, setRequisition] = React.useState<RequisitionDetail | null>(initialData ?? null);
  const [isLoading, setIsLoading] = React.useState(!initialData);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);
  const [activeTab, setActiveTab] = React.useState<"specs" | "scorecard" | "candidates">("specs");
  const [candidateSubView, setCandidateSubView] = React.useState<"pipeline" | "screening">("pipeline");

  const isClientRole = userRole === UserRole.CLIENT_HIRING_MGR;

  React.useEffect(() => {
    if (initialData) return;
    let isSubscribed = true;

    async function loadData() {
      if (!id) return;
      try {
        const res = await fetch(`/api/requisitions/${id}`);
        const json = await res.json();
        if (isSubscribed) {
          if (json.success) {
            setRequisition(json.data);
          } else {
            setFeedback({ type: "error", message: json.error || "Failed to load requisition." });
          }
        }
      } catch (err) {
        if (isSubscribed) {
          console.error("Failed to fetch requisition:", err);
          setFeedback({ type: "error", message: "Network error loading requisition." });
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

  const handleStatusTransition = async (newStatus: RequisitionStatus) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/requisitions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setFeedback({
          type: "error",
          message: data.message || "Failed to update requisition status.",
        });
      } else {
        setRequisition(data.data);
        setFeedback({
          type: "success",
          message: `Requisition status updated to ${newStatus}.`,
        });
      }
    } catch (err) {
      console.error("Status transition error:", err);
      setFeedback({ type: "error", message: "Failed to transition requisition status." });
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-10 w-96 bg-muted rounded" />
          <div className="h-48 w-full bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!requisition) {
    return (
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold">Requisition Not Found</h2>
        <p className="text-xs text-muted-foreground">The requested requisition does not exist or has been removed.</p>
        <Link href="/requisitions">
          <Button size="sm">Back to Requisitions</Button>
        </Link>
      </div>
    );
  }

  const totalCriteriaWeight = requisition.scorecardCriteria.reduce((sum, c) => sum + c.weight, 0);
  const mustHaveCriteria = requisition.scorecardCriteria.filter((c) => c.isMustHave);

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6 page-animate">
      {/* Breadcrumb & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/requisitions" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Requisitions</span>
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground truncate max-w-[240px] sm:max-w-md">
            {requisition.title}
          </span>
        </div>

        {!isClientRole && (
          <div className="flex items-center gap-2">
            <Link href={`/requisitions/${id}/edit`}>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shadow-2xs">
                <Edit3 className="h-3.5 w-3.5 text-primary" />
                <span>Edit Specs & Scorecard</span>
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 shadow-2xs animate-in fade-in duration-200 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
              : "bg-destructive/10 border border-destructive/30 text-destructive"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="font-medium">{feedback.message}</span>
        </div>
      )}

      {/* Main Dossier Header Banner */}
      <Card className="border-border/90 shadow-2xs bg-card/95">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <Badge variant="outline" className="text-[11px] font-mono">
                  {requisition.department || "Enterprise Staffing"}
                </Badge>
                {requisition.clientOrganization && (
                  <Badge variant="default" className="text-[11px] flex items-center gap-1 font-sans">
                    <Building2 className="h-3 w-3" />
                    <span>Client: {requisition.clientOrganization.name}</span>
                  </Badge>
                )}
                {requisition.location && (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground/80" /> {requisition.location}
                  </span>
                )}
                <span className="text-muted-foreground font-mono text-[11px]">
                  • Owner: {requisition.createdBy.name}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {requisition.title}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {requisition.status === "ACTIVE" && (
                <Badge variant="success" dot className="text-xs px-3 py-1 font-semibold">
                  ACTIVE PIPELINE
                </Badge>
              )}
              {requisition.status === "DRAFT" && (
                <Badge variant="secondary" dot className="text-xs px-3 py-1 font-semibold">
                  DRAFT SPECIFICATION
                </Badge>
              )}
              {requisition.status === "FILLED" && (
                <Badge variant="info" dot className="text-xs px-3 py-1 font-semibold">
                  FILLED & CLOSED
                </Badge>
              )}
              {requisition.status === "ARCHIVED" && (
                <Badge variant="warning" dot className="text-xs px-3 py-1 font-semibold">
                  ARCHIVED
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        {!isClientRole && (
          <CardContent className="pt-0 space-y-4">
            {/* Status Lifecycle Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 border border-border/60 rounded-xl text-xs">
              <span className="font-semibold text-muted-foreground mr-1">Lifecycle Controls:</span>

              {requisition.status === "DRAFT" && (
                <Button
                  size="sm"
                  variant="default"
                  isLoading={actionLoading}
                  onClick={() => handleStatusTransition("ACTIVE")}
                  className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Activate Requisition</span>
                </Button>
              )}

              {requisition.status === "ACTIVE" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={actionLoading}
                    onClick={() => handleStatusTransition("FILLED")}
                    className="h-7 text-xs gap-1.5 text-blue-600 hover:text-blue-700"
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                    <span>Mark as Filled</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={actionLoading}
                    onClick={() => handleStatusTransition("ARCHIVED")}
                    className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    <span>Archive</span>
                  </Button>
                </>
              )}

              {requisition.status === "FILLED" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={actionLoading}
                    onClick={() => handleStatusTransition("ACTIVE")}
                    className="h-7 text-xs gap-1.5 text-emerald-600 hover:text-emerald-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reopen to Active</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={actionLoading}
                    onClick={() => handleStatusTransition("ARCHIVED")}
                    className="h-7 text-xs gap-1.5"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    <span>Archive</span>
                  </Button>
                </>
              )}

              {requisition.status === "ARCHIVED" && (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={actionLoading}
                  onClick={() => handleStatusTransition("DRAFT")}
                  className="h-7 text-xs gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Restore to Draft</span>
                </Button>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Navigation Tabs */}
      <Tabs
        tabs={[
          { id: "specs", label: "Job Specs & Requirements", icon: <Briefcase className="h-4 w-4" /> },
          {
            id: "scorecard",
            label: "Evaluation Scorecard",
            icon: <Sliders className="h-4 w-4" />,
            count: requisition.scorecardCriteria.length,
          },
          {
            id: "candidates",
            label: "Candidate Pipeline",
            icon: <Users className="h-4 w-4" />,
            count: requisition._count?.applications || 0,
          },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* Tab 1: Job Specs & Requirements */}
      {activeTab === "specs" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Experience Required"
              value={
                requisition.minExperienceYears || requisition.maxExperienceYears
                  ? `${requisition.minExperienceYears ?? 0} - ${requisition.maxExperienceYears ?? "Any"} Years`
                  : "Any"
              }
              subtext="Minimum to maximum range"
            />
            <MetricCard
              label="Max Notice Period"
              value={requisition.maxNoticeDays ? `${requisition.maxNoticeDays} Days` : "Immediate"}
              subtext="Candidate availability"
            />
            <MetricCard
              label="Target Salary / CTC"
              value={requisition.targetSalaryRange || "Standard"}
              subtext="Annual compensation band"
            />
            <MetricCard
              label="Managing Agency"
              value={requisition.organization.name}
              subtext="Owning staffing entity"
            />
          </div>

          {/* Core Skills */}
          {requisition.coreSkills && requisition.coreSkills.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold">Core Required Competencies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {requisition.coreSkills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs font-mono py-1 px-2.5">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Job Description */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Full Job Description</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans text-foreground/90 bg-muted/20 p-4 sm:p-5 rounded-xl border border-border/60">
                {requisition.jobDescription}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Evaluation Scorecard */}
      {activeTab === "scorecard" && (
        <div className="space-y-4">
          <Card className="border-border/90">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-primary" />
                    <span>Grading Dimensions & Criteria Weights</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Weights strictly sum to 100% to ensure fair mathematical scoring across resumes.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  {totalCriteriaWeight === 100 ? (
                    <Badge variant="success" className="text-xs font-mono">
                      ✔ 100% Balanced
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-xs font-mono">
                      Total Weight: {totalCriteriaWeight}%
                    </Badge>
                  )}
                  {mustHaveCriteria.length > 0 && (
                    <Badge variant="destructive" className="text-xs font-mono">
                      {mustHaveCriteria.length} Must-Have Gate{mustHaveCriteria.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 pt-0">
              {requisition.scorecardCriteria.length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-xl text-xs text-muted-foreground">
                  No criteria defined. Click &quot;Edit Specs & Scorecard&quot; to configure dimensions.
                </div>
              ) : (
                <div className="space-y-3">
                  {requisition.scorecardCriteria.map((criterion, idx) => (
                    <div
                      key={criterion.id}
                      className={`p-4 rounded-xl border text-xs space-y-2.5 transition-colors ${
                        criterion.isMustHave
                          ? "border-amber-500/40 bg-amber-500/[0.03]"
                          : "border-border/80 bg-card"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted text-[11px] font-mono font-bold text-foreground">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-sm text-foreground">
                            {criterion.name}
                          </span>
                          {criterion.isMustHave && (
                            <Badge variant="warning" className="text-[10px] gap-1 py-0 font-semibold">
                              <ShieldAlert className="h-3 w-3" />
                              <span>Must-Have Filter</span>
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 font-mono">
                          <Badge variant="default" className="text-xs">
                            Weight: {criterion.weight}%
                          </Badge>
                          <span className="text-muted-foreground text-[11px]">
                            Scale: {criterion.minScore} - {criterion.maxScore}
                          </span>
                        </div>
                      </div>

                      {criterion.description && (
                        <p className="text-muted-foreground leading-relaxed">{criterion.description}</p>
                      )}

                      {criterion.guidelines && (
                        <div className="bg-muted/30 p-3 rounded-lg border border-border/50 text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
                          <strong className="text-foreground block font-sans mb-1 text-[10px] uppercase tracking-wider">
                            Scoring Rubric (1-10):
                          </strong>
                          {criterion.guidelines}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: Candidate Pipeline & AI Screening Workspace */}
      {activeTab === "candidates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={candidateSubView === "pipeline" ? "default" : "outline"}
                onClick={() => setCandidateSubView("pipeline")}
                className="h-8 text-xs font-semibold gap-1.5 shadow-2xs"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Lifecycle Pipeline Board</span>
              </Button>
              <Button
                size="sm"
                variant={candidateSubView === "screening" ? "default" : "outline"}
                onClick={() => setCandidateSubView("screening")}
                className="h-8 text-xs font-semibold gap-1.5 shadow-2xs"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>AI Screening & Evidence</span>
              </Button>
            </div>
          </div>

          {candidateSubView === "pipeline" ? (
            <CandidatePipelineView
              requisitionId={id}
              requisitionTitle={requisition.title}
              userRole={userRole}
              onOpenScreening={() => setCandidateSubView("screening")}
            />
          ) : (
            <ScreeningWorkspace
              requisitionId={id}
              requisitionTitle={requisition.title}
              scorecardCriteria={requisition.scorecardCriteria}
              totalCriteriaWeight={totalCriteriaWeight}
              userRole={userRole}
            />
          )}
        </div>
      )}
    </div>
  );
}
