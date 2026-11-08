"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs } from "@/components/ui/tabs";
import { MetricCard } from "@/components/ui/metric-card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { ShinyBadge } from "@/components/ui/shiny-badge";
import {
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Filter,
  Users,
  Briefcase,
  FileCheck,
  Calendar,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Building2,
  ExternalLink,
  Info,
  CheckCircle,
  XCircle,
  Layers,
  Sparkles,
  Sliders,
  X,
} from "lucide-react";
import { DeliveryDashboardData } from "@/lib/delivery/analytics-service";

interface DeliveryDashboardClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    organizationId: string;
    organizationName: string;
  };
}

interface FilterOptionItem {
  id: string;
  name?: string;
  title?: string;
  email?: string;
}

export function DeliveryDashboardClient({ user }: DeliveryDashboardClientProps) {
  const [data, setData] = React.useState<DeliveryDashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters state
  const [datePreset, setDatePreset] = React.useState<"7d" | "30d" | "90d" | "all">("30d");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");
  const [recruiterId, setRecruiterId] = React.useState<string>("");
  const [clientOrganizationId, setClientOrganizationId] = React.useState<string>("");
  const [requisitionId, setRequisitionId] = React.useState<string>("");

  // Metadata options
  const [recruiters, setRecruiters] = React.useState<FilterOptionItem[]>([]);
  const [clientOrganizations, setClientOrganizations] = React.useState<FilterOptionItem[]>([]);
  const [requisitions, setRequisitions] = React.useState<FilterOptionItem[]>([]);

  // Sorting state for recruiter productivity table
  const [recruiterSortField, setRecruiterSortField] = React.useState<
    "name" | "submissions" | "shortlists" | "rate" | "reviewTime" | "turnaroundTime"
  >("submissions");
  const [recruiterSortAsc, setRecruiterSortAsc] = React.useState(false);

  // Sorting state for requisition turnaround table
  const [reqSortField, setReqSortField] = React.useState<
    "age" | "firstSubmission" | "shortlist" | "title" | "submissions"
  >("age");
  const [reqSortAsc, setReqSortAsc] = React.useState(false);

  // Active section tab
  const [activeTab, setActiveTab] = React.useState<
    "overview" | "recruiters" | "turnaround" | "screening" | "clients" | "funnel"
  >("overview");

  // Fetch filter dropdown options once on mount
  React.useEffect(() => {
    let isMounted = true;
    fetch("/api/delivery/filters")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!isMounted || !json?.success || !json.data) return;
        setRecruiters(json.data.recruiters || []);
        setClientOrganizations(json.data.clientOrganizations || []);
        setRequisitions(json.data.requisitions || []);
      })
      .catch((err) => console.error("Filter options fetch error:", err));

    return () => {
      isMounted = false;
    };
  }, []);

  const applyPreset = (preset: "7d" | "30d" | "90d" | "all") => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "all") {
      setStartDate("");
      setEndDate("");
      return;
    }
    const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(now.toISOString().split("T")[0]);
  };

  const handleManualRefresh = React.useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (recruiterId) params.set("recruiterId", recruiterId);
    if (clientOrganizationId) params.set("clientOrganizationId", clientOrganizationId);
    if (requisitionId) params.set("requisitionId", requisitionId);

    fetch(`/api/delivery/analytics?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && json?.data) {
          setData(json.data);
          setError(null);
        } else {
          setError(json?.error || "Failed to load delivery analytics");
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Network error");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [startDate, endDate, recruiterId, clientOrganizationId, requisitionId]);

  React.useEffect(() => {
    let isMounted = true;
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (recruiterId) params.set("recruiterId", recruiterId);
    if (clientOrganizationId) params.set("clientOrganizationId", clientOrganizationId);
    if (requisitionId) params.set("requisitionId", requisitionId);

    fetch(`/api/delivery/analytics?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!isMounted) return;
        if (json?.success && json?.data) {
          setData(json.data);
          setError(null);
        } else {
          setError(json?.error || "Failed to load delivery analytics");
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load delivery analytics");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [startDate, endDate, recruiterId, clientOrganizationId, requisitionId]);

  const clearAllFilters = () => {
    setDatePreset("30d");
    setStartDate("");
    setEndDate("");
    setRecruiterId("");
    setClientOrganizationId("");
    setRequisitionId("");
  };

  const sortedRecruiters = React.useMemo(() => {
    const list = data?.recruiterProductivity || [];
    return [...list].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      switch (recruiterSortField) {
        case "name":
          valA = a.recruiterName.toLowerCase();
          valB = b.recruiterName.toLowerCase();
          break;
        case "submissions":
          valA = a.candidatesSubmitted;
          valB = b.candidatesSubmitted;
          break;
        case "shortlists":
          valA = a.clientShortlistsReceived;
          valB = b.clientShortlistsReceived;
          break;
        case "rate":
          valA = a.submissionToShortlistRate ?? -1;
          valB = b.submissionToShortlistRate ?? -1;
          break;
        case "reviewTime":
          valA = a.avgReviewTurnaroundHours ?? 999999;
          valB = b.avgReviewTurnaroundHours ?? 999999;
          break;
        case "turnaroundTime":
          valA = a.avgTimeToFirstSubmissionHours ?? 999999;
          valB = b.avgTimeToFirstSubmissionHours ?? 999999;
          break;
      }
      if (valA < valB) return recruiterSortAsc ? -1 : 1;
      if (valA > valB) return recruiterSortAsc ? 1 : -1;
      return 0;
    });
  }, [data, recruiterSortField, recruiterSortAsc]);

  const sortedRequisitions = React.useMemo(() => {
    const list = data?.requisitionTurnaround || [];
    return [...list].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      switch (reqSortField) {
        case "age":
          valA = a.ageDays;
          valB = b.ageDays;
          break;
        case "firstSubmission":
          valA = a.timeToFirstSubmissionHours ?? 999999;
          valB = b.timeToFirstSubmissionHours ?? 999999;
          break;
        case "shortlist":
          valA = a.timeToFirstShortlistHours ?? 999999;
          valB = b.timeToFirstShortlistHours ?? 999999;
          break;
        case "title":
          valA = a.title.toLowerCase();
          valB = b.title.toLowerCase();
          break;
        case "submissions":
          valA = a.totalSubmissions;
          valB = b.totalSubmissions;
          break;
      }
      if (valA < valB) return reqSortAsc ? -1 : 1;
      if (valA > valB) return reqSortAsc ? 1 : -1;
      return 0;
    });
  }, [data, reqSortField, reqSortAsc]);

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8 page-animate">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/80">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge variant="default" className="text-xs font-mono font-semibold">
              Delivery Operations & SLA Console
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <span>{user.organizationName}</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Operational Intelligence & SLA Performance
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
            Live metrics traceable to PostgreSQL records: turnaround velocity, recruiter attribution, SLA compliance, and pipeline conversion.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs h-9 shadow-2xs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <Card className="border-border/80 bg-card/90 shadow-2xs">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Filter className="h-4 w-4 text-primary" />
              <span>Operational Analytics Scope</span>
            </div>
            {data?.filtersApplied.isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-7 text-xs text-muted-foreground hover:text-foreground font-semibold"
              >
                Clear all filters
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Presets */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Time Horizon</Label>
              <div className="flex rounded-lg border border-border/70 p-0.5 bg-muted/40 text-xs font-mono">
                {(["7d", "30d", "90d", "all"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`flex-1 py-1 px-1.5 rounded-md text-center transition-all font-semibold ${
                      datePreset === p
                        ? "bg-card text-foreground shadow-2xs border border-border/80"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p === "all" ? "All" : p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Start / End Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Custom Date Range</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset("30d");
                  }}
                  className="h-8 text-xs px-2 font-mono"
                />
                <span className="text-muted-foreground text-xs font-mono">-</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset("30d");
                  }}
                  className="h-8 text-xs px-2 font-mono"
                />
              </div>
            </div>

            {/* Recruiter Filter */}
            <div className="space-y-1.5">
              <Label htmlFor="recruiter-select" className="text-xs font-semibold text-muted-foreground">Recruiter</Label>
              <select
                id="recruiter-select"
                aria-label="Filter by recruiter"
                value={recruiterId}
                onChange={(e) => setRecruiterId(e.target.value)}
                className="w-full h-8 rounded-lg border border-input bg-background/80 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All Recruiters ({recruiters.length})</option>
                {recruiters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name || r.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Client Organization Filter */}
            <div className="space-y-1.5">
              <Label htmlFor="client-select" className="text-xs font-semibold text-muted-foreground">Client Org</Label>
              <select
                id="client-select"
                aria-label="Filter by client organization"
                value={clientOrganizationId}
                onChange={(e) => setClientOrganizationId(e.target.value)}
                className="w-full h-8 rounded-lg border border-input bg-background/80 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All Clients ({clientOrganizations.length})</option>
                {clientOrganizations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Requisition Filter */}
            <div className="space-y-1.5">
              <Label htmlFor="requisition-select" className="text-xs font-semibold text-muted-foreground">Requisition</Label>
              <select
                id="requisition-select"
                aria-label="Filter by requisition"
                value={requisitionId}
                onChange={(e) => setRequisitionId(e.target.value)}
                className="w-full h-8 rounded-lg border border-input bg-background/80 px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All Roles ({requisitions.length})</option>
                {requisitions.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Filter Pills */}
          {data?.filtersApplied.isFiltered && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60 text-xs">
              <span className="text-muted-foreground font-semibold">Active Scopes:</span>
              {startDate && endDate && (
                <Badge variant="secondary" className="text-[11px] font-mono gap-1.5 py-0.5">
                  <Calendar className="h-3 w-3 text-primary" />
                  <span>{startDate} to {endDate}</span>
                  <button onClick={() => { setStartDate(""); setEndDate(""); }} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {recruiterId && (
                <Badge variant="secondary" className="text-[11px] gap-1.5 py-0.5">
                  <Users className="h-3 w-3 text-primary" />
                  <span>Recruiter: {recruiters.find((r) => r.id === recruiterId)?.name || recruiterId}</span>
                  <button onClick={() => setRecruiterId("")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {clientOrganizationId && (
                <Badge variant="secondary" className="text-[11px] gap-1.5 py-0.5">
                  <Building2 className="h-3 w-3 text-primary" />
                  <span>Client: {clientOrganizations.find((c) => c.id === clientOrganizationId)?.name || clientOrganizationId}</span>
                  <button onClick={() => setClientOrganizationId("")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {requisitionId && (
                <Badge variant="secondary" className="text-[11px] gap-1.5 py-0.5">
                  <Briefcase className="h-3 w-3 text-primary" />
                  <span>Role: {requisitions.find((r) => r.id === requisitionId)?.title || requisitionId}</span>
                  <button onClick={() => setRequisitionId("")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5 text-destructive p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <h3 className="font-bold text-sm">Failed to load analytics</h3>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleManualRefresh} className="ml-auto text-xs">
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Loading state skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-card border border-border/80" />
          ))}
        </div>
      )}

      {/* Dashboard Content */}
      {data && (
        <div className="space-y-6">
          {/* 3. Executive KPI Overview Bento */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              label="Active Roles"
              value={data.kpiOverview.activeRequisitionsCount}
              subtext={`+${data.kpiOverview.requisitionsOpenedInPeriod} opened, ${data.kpiOverview.requisitionsClosedInPeriod} closed`}
              icon={<Briefcase className="h-4 w-4 text-primary" />}
            />
            <MetricCard
              label="Sourced"
              value={data.kpiOverview.candidatesSourcedInPeriod}
              subtext={`${data.kpiOverview.candidatesScreenedInPeriod} AI screened`}
              icon={<Users className="h-4 w-4 text-blue-600" />}
              variant="highlight"
            />
            <MetricCard
              label="Submissions"
              value={data.kpiOverview.candidatesSubmittedInPeriod}
              subtext="To client hiring managers"
              icon={<Layers className="h-4 w-4 text-indigo-600" />}
            />
            <MetricCard
              label="Shortlists"
              value={data.kpiOverview.clientShortlistedInPeriod}
              subtext={data.clientAcceptance.acceptanceRate !== null ? `${data.clientAcceptance.acceptanceRate.toFixed(1)}% acceptance` : "0.0% acceptance"}
              variant="success"
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            />
            <MetricCard
              label="Interviews"
              value={data.kpiOverview.interviewsScheduledInPeriod + data.kpiOverview.interviewsProposedInPeriod}
              subtext={`${data.kpiOverview.interviewsScheduledInPeriod} scheduled, ${data.kpiOverview.interviewsCompletedInPeriod} done`}
              icon={<Calendar className="h-4 w-4 text-amber-600" />}
              variant="warning"
            />
            <MetricCard
              label="Joined / Offers"
              value={`${data.kpiOverview.candidatesJoinedInPeriod} / ${data.kpiOverview.offersMadeInPeriod}`}
              subtext={`${data.pipelineConversion.overallYield.toFixed(1)}% funnel yield`}
              icon={<Sparkles className="h-4 w-4 text-purple-600" />}
            />
          </div>

          {/* 4. SLA Performance Banner & Overdue Alert */}
          <Card className="border-border/90 shadow-2xs bg-card/95">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold">Service Level Agreement (SLA) Tracking</CardTitle>
                    {data.slaPerformance.actualSlaPercentage !== null && (
                      <Badge
                        variant={data.slaPerformance.actualSlaPercentage >= data.slaPerformance.targetPercentage ? "success" : "destructive"}
                        dot
                        className="text-xs font-mono font-semibold"
                      >
                        {data.slaPerformance.actualSlaPercentage >= data.slaPerformance.targetPercentage ? "Target Met" : "Target Missed"}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    Target: {data.slaPerformance.targetPercentage}% of initial candidate submissions delivered within {data.slaPerformance.targetHours} hours of requisition activation.
                  </CardDescription>
                </div>
                <div className="text-right font-mono">
                  <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
                    {data.slaPerformance.actualSlaPercentage !== null
                      ? `${data.slaPerformance.actualSlaPercentage.toFixed(1)}%`
                      : "N/A"}
                  </div>
                  <span className="text-xs text-muted-foreground font-sans">
                    {data.slaPerformance.metSlaCount} of {data.slaPerformance.evaluatedRequisitionsCount} requisitions on-time
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-0">
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    (data.slaPerformance.actualSlaPercentage ?? 0) >= data.slaPerformance.targetPercentage
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                  }`}
                  style={{ width: `${Math.min(data.slaPerformance.actualSlaPercentage ?? 0, 100)}%` }}
                />
              </div>

              {/* Overdue alert table if overdue requisitions exist */}
              {data.slaPerformance.overdueCount > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3.5 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <Clock className="h-4 w-4" />
                      <span>{data.slaPerformance.overdueCount} Active Requisition(s) Exceeded 48.0h SLA Without First Submission</span>
                    </div>
                    <ShinyBadge variant="warning" size="sm">
                      SLA Action Required
                    </ShinyBadge>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-amber-500/20">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-amber-500/10 text-muted-foreground font-mono text-[10px] uppercase">
                          <th className="py-2 px-2.5 font-semibold">Requisition</th>
                          <th className="py-2 px-2.5 font-semibold">Client</th>
                          <th className="py-2 px-2.5 font-semibold">Created</th>
                          <th className="py-2 px-2.5 font-semibold">Elapsed</th>
                          <th className="py-2 px-2.5 font-semibold">Overdue By</th>
                          <th className="py-2 px-2.5 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-500/15">
                        {data.slaPerformance.overdueRequisitions.map((item) => (
                          <tr key={item.requisitionId} className="hover:bg-amber-500/10 transition-colors">
                            <td className="py-2 px-2.5 font-bold text-foreground">{item.title}</td>
                            <td className="py-2 px-2.5 text-muted-foreground">{item.clientOrganizationName || "Unassigned"}</td>
                            <td className="py-2 px-2.5 text-muted-foreground font-mono">{new Date(item.createdAt).toLocaleDateString()}</td>
                            <td className="py-2 px-2.5 font-mono">{item.elapsedHours}h</td>
                            <td className="py-2 px-2.5 font-mono font-bold text-rose-600 dark:text-rose-400">+{item.overdueHours}h</td>
                            <td className="py-2 px-2.5 text-right">
                              <Link
                                href={`/requisitions/${item.requisitionId}`}
                                className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                              >
                                <span>Inspect</span>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section Navigation Tabs */}
          <Tabs
            tabs={[
              { id: "overview", label: "Executive Overview" },
              { id: "recruiters", label: "Recruiter Productivity" },
              { id: "turnaround", label: "Requisition Turnaround" },
              { id: "screening", label: "Screening Efficiency" },
              { id: "clients", label: "Client Acceptance" },
              { id: "funnel", label: "Pipeline Conversion" },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as any)}
          />

          {/* TAB 1: Overview Summary Grid */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Client Acceptance snapshot */}
              <Card className="border-border/80 shadow-2xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Client Acceptance Summary</CardTitle>
                  <CardDescription className="text-xs">Shortlists received relative to candidates submitted to clients</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="flex items-baseline justify-between font-mono">
                    <div>
                      <div className="text-3xl font-extrabold text-foreground">
                        {data.clientAcceptance.acceptanceRate !== null
                          ? `${data.clientAcceptance.acceptanceRate.toFixed(1)}%`
                          : "0.0%"}
                      </div>
                      <span className="text-xs text-muted-foreground font-sans">
                        {data.clientAcceptance.acceptanceRateDisplay} shortlists
                      </span>
                    </div>

                    {data.clientAcceptance.periodOverPeriodChangePoints !== null && (
                      <div className={`flex items-center gap-1 text-xs font-semibold ${
                        data.clientAcceptance.periodOverPeriodChangePoints >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}>
                        {data.clientAcceptance.periodOverPeriodChangePoints >= 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        <span>
                          {data.clientAcceptance.periodOverPeriodChangePoints > 0 ? "+" : ""}
                          {data.clientAcceptance.periodOverPeriodChangePoints.toFixed(1)}% pts vs prior period
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-center text-xs border border-border/60 rounded-xl p-3 bg-muted/20 font-mono">
                    <div>
                      <span className="text-muted-foreground font-sans text-[11px] block">Shortlisted</span>
                      <div className="font-extrabold text-emerald-600 text-base">{data.clientAcceptance.clientShortlists}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-sans text-[11px] block">Client Rejected</span>
                      <div className="font-extrabold text-rose-600 text-base">{data.clientAcceptance.clientRejections}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-sans text-[11px] block">Interviews Proposed</span>
                      <div className="font-extrabold text-amber-600 text-base">{data.clientAcceptance.interviewProposals}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Screening Efficiency snapshot */}
              <Card className="border-border/80 shadow-2xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">AI Screening & Verification Efficiency</CardTitle>
                  <CardDescription className="text-xs">Criteria coverage, AI score distribution, and recruiter review speed</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5 pt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-border/60 rounded-xl p-3 space-y-0.5 bg-muted/10 font-mono">
                      <span className="text-[11px] font-sans text-muted-foreground font-medium">Screening Completion</span>
                      <div className="text-xl font-extrabold">{data.screeningEfficiency.screeningCompletionRate.toFixed(1)}%</div>
                      <span className="text-[10px] text-muted-foreground font-sans">
                        {data.screeningEfficiency.screenedCandidatesCount} of {data.screeningEfficiency.eligibleCandidatesCount} eligible CVs
                      </span>
                    </div>

                    <div className="border border-border/60 rounded-xl p-3 space-y-0.5 bg-muted/10 font-mono">
                      <span className="text-[11px] font-sans text-muted-foreground font-medium">Avg Evidence Coverage</span>
                      <div className="text-xl font-extrabold text-primary">
                        {data.screeningEfficiency.averageEvidenceCoverage !== null
                          ? `${data.screeningEfficiency.averageEvidenceCoverage.toFixed(1)}%`
                          : "N/A"}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-sans">
                        Mean overall score: {data.screeningEfficiency.averageOverallScore !== null ? data.screeningEfficiency.averageOverallScore.toFixed(1) : "N/A"}/100
                      </span>
                    </div>

                    <div className="border border-border/60 rounded-xl p-3 space-y-0.5 bg-muted/10 font-mono">
                      <span className="text-[11px] font-sans text-muted-foreground font-medium">Must-Have Gaps</span>
                      <div className="text-xl font-extrabold text-amber-600">
                        {data.screeningEfficiency.mustHaveWarningRate.toFixed(1)}%
                      </div>
                      <span className="text-[10px] text-muted-foreground font-sans">
                        {data.screeningEfficiency.mustHaveWarningCount} evaluations with gate gaps
                      </span>
                    </div>

                    <div className="border border-border/60 rounded-xl p-3 space-y-0.5 bg-muted/10 font-mono">
                      <span className="text-[11px] font-sans text-muted-foreground font-medium">Review Turnaround</span>
                      <div className="text-xl font-extrabold">
                        {data.screeningEfficiency.avgTimeToReviewHours !== null
                          ? `${data.screeningEfficiency.avgTimeToReviewHours}h`
                          : "N/A"}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-sans">
                        {data.screeningEfficiency.recruiterReviewCompletionRate.toFixed(1)}% reviews completed
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-[11px] text-muted-foreground bg-primary/5 p-3 rounded-xl border border-primary/20">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    <span className="leading-relaxed">{data.screeningEfficiency.disclaimer}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 2: Recruiter Productivity */}
          {activeTab === "recruiters" && (
            <Card className="border-border/80 shadow-2xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Recruiter Operational Performance & Attribution</CardTitle>
                <CardDescription className="text-xs">
                  Operational throughput, quality of client submissions, and turnaround speed per recruiter.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto rounded-xl border border-border/80">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-border/80 text-muted-foreground bg-muted/50 font-mono uppercase text-[10px]">
                        <th className="py-3 px-3 font-semibold">
                          <button
                            onClick={() => {
                              if (recruiterSortField === "name") setRecruiterSortAsc(!recruiterSortAsc);
                              else { setRecruiterSortField("name"); setRecruiterSortAsc(true); }
                            }}
                            className="flex items-center gap-1 hover:text-foreground font-bold"
                          >
                            <span>Recruiter</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="py-3 px-2 font-semibold text-center">Role</th>
                        <th className="py-3 px-2 font-semibold text-center">Sourced</th>
                        <th className="py-3 px-2 font-semibold text-center">Reviews</th>
                        <th className="py-3 px-2 font-semibold text-center">
                          <button
                            onClick={() => {
                              if (recruiterSortField === "submissions") setRecruiterSortAsc(!recruiterSortAsc);
                              else { setRecruiterSortField("submissions"); setRecruiterSortAsc(false); }
                            }}
                            className="inline-flex items-center gap-1 hover:text-foreground font-bold"
                          >
                            <span>Submitted</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="py-3 px-2 font-semibold text-center">
                          <button
                            onClick={() => {
                              if (recruiterSortField === "shortlists") setRecruiterSortAsc(!recruiterSortAsc);
                              else { setRecruiterSortField("shortlists"); setRecruiterSortAsc(false); }
                            }}
                            className="inline-flex items-center gap-1 hover:text-foreground font-bold"
                          >
                            <span>Shortlists</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="py-3 px-2 font-semibold text-center">
                          <button
                            onClick={() => {
                              if (recruiterSortField === "rate") setRecruiterSortAsc(!recruiterSortAsc);
                              else { setRecruiterSortField("rate"); setRecruiterSortAsc(false); }
                            }}
                            className="inline-flex items-center gap-1 hover:text-foreground font-bold"
                          >
                            <span>Shortlist %</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="py-3 px-2 font-semibold text-center">Interviews</th>
                        <th className="py-3 px-2 font-semibold text-center">Joins</th>
                        <th className="py-3 px-2 font-semibold text-center">
                          <button
                            onClick={() => {
                              if (recruiterSortField === "reviewTime") setRecruiterSortAsc(!recruiterSortAsc);
                              else { setRecruiterSortField("reviewTime"); setRecruiterSortAsc(true); }
                            }}
                            className="inline-flex items-center gap-1 hover:text-foreground font-bold"
                          >
                            <span>Review TAT</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="py-3 px-2 font-semibold text-center">
                          <button
                            onClick={() => {
                              if (recruiterSortField === "turnaroundTime") setRecruiterSortAsc(!recruiterSortAsc);
                              else { setRecruiterSortField("turnaroundTime"); setRecruiterSortAsc(true); }
                            }}
                            className="inline-flex items-center gap-1 hover:text-foreground font-bold"
                          >
                            <span>Sub TAT</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {sortedRecruiters.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-8 text-center text-muted-foreground italic">
                            No recruiters found matching the active filter criteria.
                          </td>
                        </tr>
                      ) : (
                        sortedRecruiters.map((rec) => (
                          <tr key={rec.recruiterId} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-3">
                              <div className="font-bold text-foreground">{rec.recruiterName}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{rec.recruiterEmail}</div>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <Badge variant="outline" className="text-[10px] font-mono font-normal">
                                {rec.role === "DELIVERY_HEAD" ? "Lead" : "Recruiter"}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-center font-mono">{rec.candidatesSourced}</td>
                            <td className="py-3 px-2 text-center font-mono">{rec.evaluationsReviewed}</td>
                            <td className="py-3 px-2 text-center font-mono font-bold text-primary">{rec.candidatesSubmitted}</td>
                            <td className="py-3 px-2 text-center font-mono font-bold text-emerald-600">{rec.clientShortlistsReceived}</td>
                            <td className="py-3 px-2 text-center font-mono">
                              {rec.submissionToShortlistRate !== null ? (
                                <Badge
                                  variant="secondary"
                                  className={
                                    rec.submissionToShortlistRate >= 50
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold"
                                      : "font-semibold"
                                  }
                                >
                                  {rec.submissionToShortlistRate.toFixed(1)}%
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center font-mono">{rec.interviewsAttributable}</td>
                            <td className="py-3 px-2 text-center font-mono font-bold text-purple-600">{rec.joinsAttributable}</td>
                            <td className="py-3 px-2 text-center font-mono">
                              {rec.avgReviewTurnaroundHours !== null ? `${rec.avgReviewTurnaroundHours}h` : "-"}
                            </td>
                            <td className="py-3 px-2 text-center font-mono">
                              {rec.avgTimeToFirstSubmissionHours !== null ? `${rec.avgTimeToFirstSubmissionHours}h` : "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 3: Requisition Turnaround & Timelines */}
          {activeTab === "turnaround" && (
            <Card className="border-border/80 shadow-2xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Requisition Velocity & Milestone Turnarounds</CardTitle>
                <CardDescription className="text-xs">
                  Elapsed time from activation to key lifecycle milestones. Click any row to inspect the requisition.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto rounded-xl border border-border/80">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-border/80 text-muted-foreground bg-muted/50 font-mono uppercase text-[10px]">
                        <th className="py-3 px-3 font-semibold">
                          <button
                            onClick={() => {
                              if (reqSortField === "title") setReqSortAsc(!reqSortAsc);
                              else { setReqSortField("title"); setReqSortAsc(true); }
                            }}
                            className="flex items-center gap-1 hover:text-foreground font-bold"
                          >
                            <span>Requisition</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="py-3 px-2 font-semibold">Client</th>
                        <th className="py-3 px-2 font-semibold text-center">Status</th>
                        <th className="py-3 px-2 font-semibold text-center">
                          <button
                            onClick={() => {
                              if (reqSortField === "age") setReqSortAsc(!reqSortAsc);
                              else { setReqSortField("age"); setReqSortAsc(false); }
                            }}
                            className="inline-flex items-center gap-1 hover:text-foreground font-bold"
                          >
                            <span>Age</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="py-3 px-2 font-semibold text-center">
                          <button
                            onClick={() => {
                              if (reqSortField === "firstSubmission") setReqSortAsc(!reqSortAsc);
                              else { setReqSortField("firstSubmission"); setReqSortAsc(true); }
                            }}
                            className="inline-flex items-center gap-1 hover:text-foreground font-bold"
                          >
                            <span>First Sub (h)</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="py-3 px-2 font-semibold text-center">First Shortlist</th>
                        <th className="py-3 px-2 font-semibold text-center">First Interview</th>
                        <th className="py-3 px-2 font-semibold text-center">First Offer</th>
                        <th className="py-3 px-2 font-semibold text-center">First Join</th>
                        <th className="py-3 px-2 font-semibold text-center">Flags</th>
                        <th className="py-3 px-2 font-semibold text-right">Links</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {sortedRequisitions.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-8 text-center text-muted-foreground italic">
                            No requisitions found matching current filters.
                          </td>
                        </tr>
                      ) : (
                        sortedRequisitions.map((req) => (
                          <tr key={req.requisitionId} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-3">
                              <Link
                                href={`/requisitions/${req.requisitionId}`}
                                className="font-bold text-foreground hover:text-primary transition-colors text-sm"
                              >
                                {req.title}
                              </Link>
                              <div className="text-[10px] text-muted-foreground font-mono">{req.department || "General"}</div>
                            </td>
                            <td className="py-3 px-2 text-muted-foreground">{req.clientOrganizationName || "Unassigned"}</td>
                            <td className="py-3 px-2 text-center">
                              <Badge
                                variant={
                                  req.status === "ACTIVE"
                                    ? "success"
                                    : req.status === "FILLED"
                                    ? "info"
                                    : "secondary"
                                }
                                dot
                                className="text-[10px] font-mono"
                              >
                                {req.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-center font-mono font-medium">{req.ageDays}d</td>
                            <td className="py-3 px-2 text-center font-mono">
                              {req.timeToFirstSubmissionHours !== null ? (
                                <span className={req.timeToFirstSubmissionHours <= 48 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                                  {req.timeToFirstSubmissionHours}h
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">None</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center font-mono text-muted-foreground">
                              {req.timeToFirstShortlistHours !== null ? `${req.timeToFirstShortlistHours}h` : "-"}
                            </td>
                            <td className="py-3 px-2 text-center font-mono text-muted-foreground">
                              {req.timeToFirstInterviewHours !== null ? `${req.timeToFirstInterviewHours}h` : "-"}
                            </td>
                            <td className="py-3 px-2 text-center font-mono text-muted-foreground">
                              {req.timeToOfferHours !== null ? `${req.timeToOfferHours}h` : "-"}
                            </td>
                            <td className="py-3 px-2 text-center font-mono text-muted-foreground">
                              {req.timeToJoinHours !== null ? `${req.timeToJoinHours}h` : "-"}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <div className="flex flex-col items-center gap-1">
                                {req.isOverdueSla && (
                                  <Badge variant="destructive" dot className="text-[9px] px-1 py-0 font-mono">
                                    SLA &gt;48h
                                  </Badge>
                                )}
                                {req.isInactive && (
                                  <Badge variant="warning" dot className="text-[9px] px-1 py-0 font-mono">
                                    Inactive &ge;7d
                                  </Badge>
                                )}
                                {!req.isOverdueSla && !req.isInactive && (
                                  <span className="text-[10px] text-muted-foreground font-mono">Healthy</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <Link
                                href={`/requisitions/${req.requisitionId}`}
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
                              >
                                <span>Inspect</span>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 4: Screening Efficiency */}
          {activeTab === "screening" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  label="Eligible Resumes"
                  value={data.screeningEfficiency.eligibleCandidatesCount}
                  subtext="Parsed plain text ready for AI"
                  icon={<FileCheck className="h-4 w-4 text-primary" />}
                />
                <MetricCard
                  label="Screening Completion"
                  value={`${data.screeningEfficiency.screeningCompletionRate.toFixed(1)}%`}
                  subtext={`${data.screeningEfficiency.screenedCandidatesCount} completed scorecards`}
                  icon={<Sparkles className="h-4 w-4 text-indigo-600" />}
                  variant="highlight"
                />
                <MetricCard
                  label="Mean Rubric Score"
                  value={
                    data.screeningEfficiency.averageOverallScore !== null
                      ? `${data.screeningEfficiency.averageOverallScore.toFixed(1)} / 100`
                      : "N/A"
                  }
                  subtext={`Avg Evidence: ${data.screeningEfficiency.averageEvidenceCoverage !== null ? `${data.screeningEfficiency.averageEvidenceCoverage.toFixed(1)}%` : "N/A"}`}
                  icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  variant="success"
                />
                <MetricCard
                  label="Recruiter Review Rate"
                  value={`${data.screeningEfficiency.recruiterReviewCompletionRate.toFixed(1)}%`}
                  subtext={`${data.screeningEfficiency.evaluationsReviewedCount} reviews conducted`}
                  icon={<Users className="h-4 w-4 text-primary" />}
                />
              </div>

              <Card className="border-border/80 shadow-2xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Evidence Coverage & Verification Guidelines</CardTitle>
                  <CardDescription className="text-xs">
                    Human-in-the-loop screening safeguards and must-have rubric evaluation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 border border-border/80 rounded-xl bg-card space-y-1 shadow-2xs">
                      <div className="font-bold text-amber-600 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Must-Have Criterion Warning Frequency: {data.screeningEfficiency.mustHaveWarningRate.toFixed(1)}%</span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        {data.screeningEfficiency.mustHaveWarningCount} candidates failed one or more mandatory screening gates.
                        In accordance with platform policy, AI never auto-rejects; recruiters must inspect evidence quotes before disqualification.
                      </p>
                    </div>

                    <div className="p-3.5 border border-border/80 rounded-xl bg-card space-y-1 shadow-2xs">
                      <div className="font-bold text-primary flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        <span>Average Review Speed: {data.screeningEfficiency.avgTimeToReviewHours !== null ? `${data.screeningEfficiency.avgTimeToReviewHours} hours` : "N/A"}</span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        Time elapsed from AI scorecard computation to manual recruiter sign-off and original CV inspection.
                      </p>
                    </div>
                  </div>

                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3.5 text-xs text-muted-foreground flex items-center gap-2.5">
                    <Info className="h-4 w-4 shrink-0 text-primary" />
                    <span>{data.screeningEfficiency.disclaimer}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 5: Client Acceptance Analysis */}
          {activeTab === "clients" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  label="Submissions Delivered"
                  value={data.clientAcceptance.candidatesSubmitted}
                  subtext="Candidates sent to clients"
                  icon={<Layers className="h-4 w-4 text-indigo-600" />}
                />
                <MetricCard
                  label="Client Shortlists"
                  value={data.clientAcceptance.clientShortlists}
                  subtext="Candidates approved for interview"
                  variant="success"
                  icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                />
                <MetricCard
                  label="Client Acceptance Rate"
                  value={
                    data.clientAcceptance.acceptanceRate !== null
                      ? `${data.clientAcceptance.acceptanceRate.toFixed(1)}%`
                      : "0.0%"
                  }
                  subtext={data.clientAcceptance.acceptanceRateDisplay}
                  variant="highlight"
                />
                <MetricCard
                  label="Period Comparison"
                  value={
                    data.clientAcceptance.periodOverPeriodChangePoints !== null
                      ? `${data.clientAcceptance.periodOverPeriodChangePoints > 0 ? "+" : ""}${data.clientAcceptance.periodOverPeriodChangePoints.toFixed(1)}%`
                      : "No Prior"
                  }
                  subtext={`Prior period: ${data.clientAcceptance.priorPeriodShortlists} / ${data.clientAcceptance.priorPeriodSubmitted}`}
                  variant={
                    (data.clientAcceptance.periodOverPeriodChangePoints ?? 0) >= 0 ? "success" : "danger"
                  }
                />
              </div>

              <Card className="border-border/80 shadow-2xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Decision Category Breakdown</CardTitle>
                  <CardDescription className="text-xs">
                    Client decisions received within the selected date window. Interview proposals are tracked independently from direct acceptances.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-center font-mono">
                    <div className="p-4 border border-emerald-500/20 rounded-xl bg-emerald-500/[0.04]">
                      <span className="text-xs text-muted-foreground font-sans font-medium block">Direct Shortlists</span>
                      <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 mt-1">
                        {data.clientAcceptance.clientShortlists}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-sans">Candidates advanced</span>
                    </div>

                    <div className="p-4 border border-rose-500/20 rounded-xl bg-rose-500/[0.04]">
                      <span className="text-xs text-muted-foreground font-sans font-medium block">Client Rejections</span>
                      <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 mt-1">
                        {data.clientAcceptance.clientRejections}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-sans">Candidate not aligned</span>
                    </div>

                    <div className="p-4 border border-amber-500/20 rounded-xl bg-amber-500/[0.04]">
                      <span className="text-xs text-muted-foreground font-sans font-medium block">Interview Slot Proposals</span>
                      <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1">
                        {data.clientAcceptance.interviewProposals}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-sans">Slots requested by client</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 6: Pipeline Conversion Funnel */}
          {activeTab === "funnel" && (
            <Card className="border-border/80 shadow-2xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <CardTitle className="text-base font-bold">Pipeline Lifecycle Conversion Funnel</CardTitle>
                    <CardDescription className="text-xs">
                      Step-by-step conversion and yield across the full candidate lifecycle.
                    </CardDescription>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-xs text-muted-foreground font-sans">Overall Funnel Yield</span>
                    <div className="text-2xl font-extrabold text-primary">{data.pipelineConversion.overallYield.toFixed(1)}%</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
                  {data.pipelineConversion.stages.map((stage, idx) => (
                    <div
                      key={stage.stage}
                      className="border border-border/80 rounded-xl p-3.5 bg-card/60 space-y-2.5 relative flex flex-col justify-between shadow-2xs hover:border-primary/40 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono font-bold">
                          <span>Step {idx + 1}</span>
                          <span>{stage.overallYield.toFixed(1)}%</span>
                        </div>
                        <h4 className="font-bold text-xs text-foreground leading-tight">{stage.label}</h4>
                      </div>

                      <div className="my-1">
                        <div className="text-2xl font-extrabold font-mono text-foreground">{stage.count}</div>
                        {stage.conversionFromPrevious !== null && (
                          <div className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {stage.conversionFromPrevious.toFixed(1)}% conv
                          </div>
                        )}
                        {stage.conversionFromPrevious === null && (
                          <div className="text-[11px] font-sans text-muted-foreground">Top of funnel</div>
                        )}
                      </div>

                      {/* Mini indicator bar */}
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-1.5 rounded-full"
                          style={{ width: `${Math.min(stage.overallYield, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-muted/30 border border-border/60 rounded-xl p-3 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span>Cohort methodology: Applications created within the selected date window and their current progression state.</span>
                  <Link href="/requisitions" className="text-primary font-semibold hover:underline inline-flex items-center gap-1">
                    <span>View Requisitions Pipeline</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
