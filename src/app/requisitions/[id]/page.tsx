"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequisitionDetail, ScorecardCriterion } from "@/types";
import { RequisitionStatus } from "@prisma/client";
import {
  ArrowLeft,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  IndianRupee,
  Calendar,
  Sliders,
  ShieldAlert,
  Users,
  Archive,
  RotateCcw,
  Sparkles,
  Building2,
  FileText,
  Briefcase,
} from "lucide-react";

export default function RequisitionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [requisition, setRequisition] = React.useState<RequisitionDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);
  const [activeTab, setActiveTab] = React.useState<"specs" | "scorecard" | "candidates">("specs");

  React.useEffect(() => {
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
  }, [id]);

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
      <div className="container py-10 max-w-5xl space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-10 w-96 bg-muted rounded" />
          <div className="h-48 w-full bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!requisition) {
    return (
      <div className="container py-12 max-w-5xl text-center space-y-4">
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
    <div className="container py-8 max-w-5xl space-y-6">
      {/* Back button & quick navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/requisitions"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to All Requisitions</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link href={`/requisitions/${id}/edit`}>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Edit3 className="h-3.5 w-3.5" />
              <span>Edit Details & Scorecard</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Feedback Banner */}
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

      {/* Main Dossier Header Card */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[11px] font-medium">
                  {requisition.department || "Enterprise Staffing"}
                </Badge>
                {requisition.location && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {requisition.location}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">• Created by {requisition.createdBy.name}</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {requisition.title}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {requisition.status === "ACTIVE" && (
                <Badge variant="success" className="text-xs px-3 py-1 font-semibold">
                  ● ACTIVE PIPELINE
                </Badge>
              )}
              {requisition.status === "DRAFT" && (
                <Badge variant="secondary" className="text-xs px-3 py-1 font-semibold">
                  DRAFT SPECIFICATION
                </Badge>
              )}
              {requisition.status === "FILLED" && (
                <Badge variant="outline" className="text-xs px-3 py-1 font-semibold text-blue-600 border-blue-400">
                  FILLED & CLOSED
                </Badge>
              )}
              {requisition.status === "ARCHIVED" && (
                <Badge variant="warning" className="text-xs px-3 py-1 font-semibold">
                  ARCHIVED
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {/* Status Lifecycle Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 border rounded-lg text-xs">
            <span className="font-semibold text-muted-foreground mr-1">Lifecycle Actions:</span>

            {requisition.status === "DRAFT" && (
              <Button
                size="sm"
                variant="default"
                disabled={actionLoading}
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
                  disabled={actionLoading}
                  onClick={() => handleStatusTransition("FILLED")}
                  className="h-7 text-xs gap-1.5 text-blue-600 hover:text-blue-700"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  <span>Mark as Filled</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionLoading}
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
                  disabled={actionLoading}
                  onClick={() => handleStatusTransition("ACTIVE")}
                  className="h-7 text-xs gap-1.5 text-emerald-600 hover:text-emerald-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reopen to Active</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionLoading}
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
                disabled={actionLoading}
                onClick={() => handleStatusTransition("DRAFT")}
                className="h-7 text-xs gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restore to Draft</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b pb-1 text-sm font-medium">
        <button
          onClick={() => setActiveTab("specs")}
          className={`px-4 py-2 rounded-t-md transition-colors border-b-2 font-medium ${
            activeTab === "specs"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Job Specs & Requirements
        </button>

        <button
          onClick={() => setActiveTab("scorecard")}
          className={`px-4 py-2 rounded-t-md transition-colors border-b-2 font-medium flex items-center gap-1.5 ${
            activeTab === "scorecard"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Evaluation Scorecard</span>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            {requisition.scorecardCriteria.length} Criteria • {totalCriteriaWeight}%
          </Badge>
        </button>

        <button
          onClick={() => setActiveTab("candidates")}
          className={`px-4 py-2 rounded-t-md transition-colors border-b-2 font-medium flex items-center gap-1.5 ${
            activeTab === "candidates"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Candidate Pipeline</span>
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
            {requisition._count?.applications || 0}
          </Badge>
        </button>
      </div>

      {/* Tab 1: Job Specs & Requirements */}
      {activeTab === "specs" && (
        <div className="space-y-6">
          {/* Key Hiring Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <Card className="p-3">
              <span className="text-muted-foreground font-medium block">Experience Required</span>
              <span className="text-base font-bold text-foreground">
                {requisition.minExperienceYears || requisition.maxExperienceYears
                  ? `${requisition.minExperienceYears ?? 0} to ${requisition.maxExperienceYears ?? "Any"} Years`
                  : "Not specified"}
              </span>
            </Card>

            <Card className="p-3">
              <span className="text-muted-foreground font-medium block">Maximum Notice Period</span>
              <span className="text-base font-bold text-foreground">
                {requisition.maxNoticeDays ? `Up to ${requisition.maxNoticeDays} Days` : "Immediate / Any"}
              </span>
            </Card>

            <Card className="p-3">
              <span className="text-muted-foreground font-medium block">Target Salary / CTC</span>
              <span className="text-base font-bold text-foreground">
                {requisition.targetSalaryRange || "Market Standard"}
              </span>
            </Card>

            <Card className="p-3">
              <span className="text-muted-foreground font-medium block">Managing Entity</span>
              <span className="text-base font-bold text-foreground truncate block">
                {requisition.organization.name}
              </span>
            </Card>
          </div>

          {/* Core Skills */}
          {requisition.coreSkills && requisition.coreSkills.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Core Required Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {requisition.coreSkills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs">
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
              <CardTitle className="text-sm">Job Description</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans text-foreground/90 bg-muted/20 p-4 rounded-lg border">
                {requisition.jobDescription}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Evaluation Scorecard */}
      {activeTab === "scorecard" && (
        <div className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-primary" />
                    <span>Grading Dimensions & Weights</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Weights strictly sum to 100% to ensure fair mathematical scoring across resumes.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  {totalCriteriaWeight === 100 ? (
                    <Badge variant="success" className="text-xs">
                      ✔ 100% Balanced
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-xs">
                      Total Weight: {totalCriteriaWeight}%
                    </Badge>
                  )}
                  {mustHaveCriteria.length > 0 && (
                    <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-400">
                      {mustHaveCriteria.length} Must-Have Gate{mustHaveCriteria.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 pt-0">
              {requisition.scorecardCriteria.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-md text-xs text-muted-foreground">
                  No criteria defined. Click &quot;Edit Details & Scorecard&quot; to configure dimensions.
                </div>
              ) : (
                <div className="space-y-3">
                  {requisition.scorecardCriteria.map((criterion, idx) => (
                    <div
                      key={criterion.id}
                      className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                        criterion.isMustHave
                          ? "border-amber-500/40 bg-amber-500/[0.02]"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-sm text-foreground">
                            {criterion.name}
                          </span>
                          {criterion.isMustHave && (
                            <Badge variant="warning" className="text-[10px] gap-1 py-0">
                              <ShieldAlert className="h-3 w-3" />
                              <span>Must-Have</span>
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono text-xs">
                            Weight: {criterion.weight}%
                          </Badge>
                          <span className="text-muted-foreground text-[11px]">
                            Scale: {criterion.minScore} - {criterion.maxScore}
                          </span>
                        </div>
                      </div>

                      {criterion.description && (
                        <p className="text-muted-foreground">{criterion.description}</p>
                      )}

                      {criterion.guidelines && (
                        <div className="bg-muted/40 p-2.5 rounded border border-border/60 text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
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

      {/* Tab 3: Candidate Pipeline */}
      {activeTab === "candidates" && (
        <Card className="border-border p-6 text-center">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-base">Candidate Intake & Shortlist Pipeline</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {requisition._count?.applications || 0} candidates are currently associated with this requisition.
                Bulk resume upload, PII sanitization, and split-screen dossier verification will intake CVs against this requisition&apos;s scorecard.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
