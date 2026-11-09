"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import { RequisitionStatus, UserRole } from "@prisma/client";
import {
  Briefcase,
  Plus,
  Search,
  MapPin,
  Layers,
  CheckCircle2,
  FileText,
  Sliders,
  ChevronRight,
  Clock,
  Sparkles,
  User,
  X,
  Building2,
} from "lucide-react";

const cubicEase = [0.16, 1, 0.3, 1] as const;

interface RequisitionItem {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  maxNoticeDays: number | null;
  targetSalaryRange: string | null;
  coreSkills: string[];
  status: RequisitionStatus;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
  };
  _count: {
    scorecardCriteria: number;
    applications: number;
  };
}

export function RequisitionsClientView({ userRole }: { userRole?: UserRole }) {
  const [requisitions, setRequisitions] = React.useState<RequisitionItem[]>([]);
  const [statusCounts, setStatusCounts] = React.useState<Record<string, number>>({
    ALL: 0,
    DRAFT: 0,
    ACTIVE: 0,
    FILLED: 0,
    ARCHIVED: 0,
  });
  const [selectedStatus, setSelectedStatus] = React.useState<string>("ALL");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [pipelineSummary, setPipelineSummary] = React.useState<Record<string, number> | null>(null);

  const isClientRole = userRole === UserRole.CLIENT_HIRING_MGR;

  React.useEffect(() => {
    if (isClientRole) return;
    async function loadPipelineSummary() {
      try {
        const res = await fetch("/api/pipeline/summary");
        const json = await res.json();
        if (json.success && json.summaryCounts) {
          setPipelineSummary(json.summaryCounts);
        }
      } catch (err) {
        console.error("Failed to load agency pipeline summary:", err);
      }
    }
    loadPipelineSummary();
  }, [isClientRole]);

  const fetchRequisitions = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStatus !== "ALL") {
        params.append("status", selectedStatus);
      }
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }

      const res = await fetch(`/api/requisitions?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setRequisitions(json.data);
        if (json.counts) {
          setStatusCounts(json.counts);
        }
      }
    } catch (err) {
      console.error("Failed to load requisitions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, searchQuery]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchRequisitions();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchRequisitions]);

  const getStatusBadge = (status: RequisitionStatus) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge variant="success" dot className="text-xs font-semibold">
            Active
          </Badge>
        );
      case "DRAFT":
        return (
          <Badge variant="secondary" dot className="text-xs font-semibold">
            Draft
          </Badge>
        );
      case "FILLED":
        return (
          <Badge variant="info" dot className="text-xs font-semibold">
            Filled
          </Badge>
        );
      case "ARCHIVED":
        return (
          <Badge variant="warning" dot className="text-xs font-semibold">
            Archived
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8 page-animate">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
              Company A (Noida) Staffing Operations
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Requisitions &amp; Evaluation Scorecards
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage end-to-end recruitment pipelines, strict hiring requirements, and weighted AI scorecards.
          </p>
        </div>

        {!isClientRole && (
          <Link href="/requisitions/new">
            <Button className="gap-2 shadow-glow-primary text-xs sm:text-sm h-9 font-semibold">
              <Plus className="h-4 w-4" />
              <span>Create Requisition</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Stat Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Active Roles"
          value={statusCounts.ACTIVE || 0}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          variant="success"
          subtext="Ready for candidate submission"
        />
        <MetricCard
          label="Draft Pipelines"
          value={statusCounts.DRAFT || 0}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          subtext="Configuring scorecards"
        />
        <MetricCard
          label="Filled Positions"
          value={statusCounts.FILLED || 0}
          icon={<Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
          subtext="Successfully placed"
        />
        <MetricCard
          label="Total Requisitions"
          value={statusCounts.ALL || 0}
          icon={<Layers className="h-4 w-4 text-primary" />}
          variant="highlight"
          subtext="Full agency portfolio"
        />
      </div>

      {/* Agency Candidate Pipeline Lifecycle Summary */}
      {!isClientRole && pipelineSummary && (
        <Card className="border-border/80 shadow-card p-4 sm:p-5 bg-card/80 backdrop-blur-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span>Agency Candidate Pipeline Lifecycle Summary</span>
            </span>
            <Badge variant="outline" className="text-[11px] font-mono self-start sm:self-auto bg-background/80">
              {pipelineSummary.TOTAL || 0} Active Candidates in Funnel
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 pt-1 text-center font-mono">
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/80 shadow-2xs hover:border-border transition-colors">
              <span className="text-[10px] text-muted-foreground font-sans font-medium block">Sourced</span>
              <span className="text-lg font-extrabold text-foreground">{pipelineSummary.SOURCED || 0}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/80 shadow-2xs hover:border-border transition-colors">
              <span className="text-[10px] text-muted-foreground font-sans font-medium block">Screened</span>
              <span className="text-lg font-extrabold text-primary">{pipelineSummary.SCREENED || 0}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/80 shadow-2xs hover:border-border transition-colors">
              <span className="text-[10px] text-muted-foreground font-sans font-medium block">Submitted</span>
              <span className="text-lg font-extrabold text-foreground/90">{pipelineSummary.SUBMITTED_TO_CLIENT || 0}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/80 shadow-2xs hover:border-border transition-colors">
              <span className="text-[10px] text-muted-foreground font-sans font-medium block">Shortlisted</span>
              <span className="text-lg font-extrabold text-amber-500">{pipelineSummary.CLIENT_SHORTLISTED || 0}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/80 shadow-2xs hover:border-border transition-colors">
              <span className="text-[10px] text-muted-foreground font-sans font-medium block">Interviewing</span>
              <span className="text-lg font-extrabold text-primary/90">
                {(pipelineSummary.INTERVIEW_PROPOSED || 0) + (pipelineSummary.INTERVIEW_SCHEDULED || 0) + (pipelineSummary.INTERVIEW_COMPLETED || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/80 shadow-2xs hover:border-border transition-colors">
              <span className="text-[10px] text-muted-foreground font-sans font-medium block">Offered</span>
              <span className="text-lg font-extrabold text-emerald-500">{pipelineSummary.OFFERED || 0}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/80 shadow-2xs hover:border-border transition-colors">
              <span className="text-[10px] text-muted-foreground font-sans font-medium block">Joined</span>
              <span className="text-lg font-extrabold text-emerald-400">{pipelineSummary.JOINED || 0}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Controls Bar: Status Pills & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Pills */}
        <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/70 text-xs font-medium overflow-x-auto">
          {[
            { key: "ALL", label: "All Roles", count: statusCounts.ALL },
            { key: "ACTIVE", label: "Active", count: statusCounts.ACTIVE },
            { key: "DRAFT", label: "Draft", count: statusCounts.DRAFT },
            { key: "FILLED", label: "Filled", count: statusCounts.FILLED },
            { key: "ARCHIVED", label: "Archived", count: statusCounts.ARCHIVED },
          ].map((tab) => {
            const isSelected = selectedStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSelectedStatus(tab.key)}
                className={`px-3 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap flex items-center gap-1.5 select-none cursor-pointer ${
                  isSelected
                    ? "bg-card text-foreground shadow-xs font-semibold border border-border/80"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isSelected ? "bg-primary/10 text-primary font-bold" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.count || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search role, skills, department..."
            className="pl-9 pr-8 h-9 text-xs bg-background/80"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Requisitions Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-52 rounded-xl bg-card border border-border/70 p-6 space-y-4 skeleton-shimmer"
            >
              <div className="h-5 w-3/4 bg-muted rounded" />
              <div className="h-4 w-1/2 bg-muted rounded" />
              <div className="h-16 w-full bg-muted/60 rounded" />
            </div>
          ))}
        </div>
      ) : requisitions.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-6 w-6 text-muted-foreground" />}
          title="No requisitions match your criteria"
          description="Try selecting a different status filter or clearing your search keywords."
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedStatus("ALL");
                  setSearchQuery("");
                }}
                className="text-xs"
              >
                Reset Filters
              </Button>
              {!isClientRole && (
                <Link href="/requisitions/new">
                  <Button size="sm" className="text-xs font-semibold">
                    Create Requisition
                  </Button>
                </Link>
              )}
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {requisitions.map((req, index) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.3), ease: cubicEase }}
            >
              <SpotlightCard
                spotlightColor="rgba(230, 145, 36, 0.12)"
                className="flex flex-col justify-between h-full hover:border-primary/50 shadow-card hover:shadow-card-hover transition-all duration-200 group border-border/80 bg-card/95"
              >
                <div className="pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-medium">
                          {req.department || "General Staffing"}
                        </span>
                        {req.location && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            • <MapPin className="h-3 w-3 inline text-muted-foreground/80" /> {req.location}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/requisitions/${req.id}`}
                        className="font-bold text-base sm:text-lg text-foreground hover:text-primary transition-colors block truncate group-hover:text-primary"
                      >
                        {req.title}
                      </Link>
                    </div>
                    <div className="shrink-0">{getStatusBadge(req.status)}</div>
                  </div>
                </div>

                <div className="space-y-4 pt-0">
                  {/* Specs Matrix */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs bg-muted/40 p-3 rounded-xl border border-border/60">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Experience Required:</span>
                      <span className="font-semibold text-foreground">
                        {req.minExperienceYears || req.maxExperienceYears
                          ? `${req.minExperienceYears ?? 0} - ${req.maxExperienceYears ?? "Any"} Years`
                          : "Not specified"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Notice Period:</span>
                      <span className="font-semibold text-foreground">
                        {req.maxNoticeDays ? `Max ${req.maxNoticeDays} Days` : "Immediate / Any"}
                      </span>
                    </div>
                  </div>

                  {/* Core Skills Chips */}
                  {req.coreSkills && req.coreSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {req.coreSkills.slice(0, 5).map((skill) => (
                        <Badge
                          key={skill}
                          variant="secondary"
                          className="text-[11px] font-mono font-normal py-0.5 px-2 bg-secondary/70 border border-border/60"
                        >
                          {skill}
                        </Badge>
                      ))}
                      {req.coreSkills.length > 5 && (
                        <span className="text-[10px] text-muted-foreground self-center font-mono">
                          +{req.coreSkills.length - 5} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Scorecard criteria indicator & metadata */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Sliders className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium text-foreground">
                        {req._count.scorecardCriteria} Scorecard Criteria
                      </span>
                    </div>

                    <span className="text-[11px] font-mono">
                      Owner: {req.createdBy.name}
                    </span>
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center justify-between gap-2 pt-2">
                    {!isClientRole && (
                      <Link href={`/requisitions/${req.id}/edit`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full text-xs h-8 border-border/80 bg-muted/30 hover:bg-muted/60">
                          Edit Requisition
                        </Button>
                      </Link>
                    )}
                    <Link href={`/requisitions/${req.id}`} className={isClientRole ? "w-full" : "flex-1"}>
                      <Button size="sm" className="w-full text-xs h-8 gap-1.5 font-semibold">
                        <span>View Dossier &amp; Screening</span>
                        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
