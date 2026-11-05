"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RequisitionStatus } from "@prisma/client";
import {
  Briefcase,
  Plus,
  Search,
  MapPin,
  Clock,
  Layers,
  Filter,
  CheckCircle2,
  FileText,
  Sliders,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";

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

export default function RequisitionsPage() {
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
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchRequisitions]);

  const getStatusBadge = (status: RequisitionStatus) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge variant="success" className="text-xs font-semibold">
            ● Active
          </Badge>
        );
      case "DRAFT":
        return (
          <Badge variant="secondary" className="text-xs font-semibold">
            Draft
          </Badge>
        );
      case "FILLED":
        return (
          <Badge variant="outline" className="text-xs font-semibold text-blue-600 border-blue-300 dark:border-blue-800">
            Filled
          </Badge>
        );
      case "ARCHIVED":
        return (
          <Badge variant="warning" className="text-xs font-semibold">
            Archived
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container py-8 max-w-6xl space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Company A (Noida) Staffing Operations
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Requisitions & Evaluation Scorecards
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage end-to-end recruitment pipelines, strict hiring requirements, and weighted AI scorecards.
          </p>
        </div>

        <Link href="/requisitions/new">
          <Button className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            <span>Create Requisition</span>
          </Button>
        </Link>
      </div>

      {/* Metric Stat Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Roles</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-1 text-foreground">
            {statusCounts.ACTIVE || 0}
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Draft Pipelines</span>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold mt-1 text-foreground">
            {statusCounts.DRAFT || 0}
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Filled Roles</span>
            <Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold mt-1 text-foreground">
            {statusCounts.FILLED || 0}
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Requisitions</span>
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold mt-1 text-foreground">
            {statusCounts.ALL || 0}
          </div>
        </Card>
      </div>

      {/* Controls Bar: Search & Status Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center p-1 bg-muted/60 rounded-lg border text-xs font-medium overflow-x-auto">
          {[
            { key: "ALL", label: "All Roles", count: statusCounts.ALL },
            { key: "ACTIVE", label: "Active", count: statusCounts.ACTIVE },
            { key: "DRAFT", label: "Draft", count: statusCounts.DRAFT },
            { key: "FILLED", label: "Filled", count: statusCounts.FILLED },
            { key: "ARCHIVED", label: "Archived", count: statusCounts.ARCHIVED },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedStatus(tab.key)}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                selectedStatus === tab.key
                  ? "bg-card text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded-full">
                {tab.count || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, department, skills..."
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* Requisitions List / Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse h-48 bg-muted/20 border-border" />
          ))}
        </div>
      ) : requisitions.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="p-3 rounded-full bg-muted">
              <Briefcase className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-base text-foreground">
                No requisitions match your filter
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Try selecting a different status filter or clearing your search keywords.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
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
              <Link href="/requisitions/new">
                <Button size="sm" className="text-xs">
                  Create Requisition
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requisitions.map((req) => (
            <Card
              key={req.id}
              className="flex flex-col justify-between hover:border-primary/40 transition-all duration-200 shadow-sm"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-medium">
                        {req.department || "General Staffing"}
                      </span>
                      {req.location && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          • <MapPin className="h-3 w-3 inline" /> {req.location}
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/requisitions/${req.id}`}
                      className="font-bold text-base text-foreground hover:text-primary transition-colors block truncate"
                    >
                      {req.title}
                    </Link>
                  </div>
                  <div>{getStatusBadge(req.status)}</div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                {/* Specs Matrix */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-md">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Experience:</span>
                    <span className="font-medium text-foreground">
                      {req.minExperienceYears || req.maxExperienceYears
                        ? `${req.minExperienceYears ?? 0} - ${req.maxExperienceYears ?? "Any"} Years`
                        : "Not specified"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Notice Period:</span>
                    <span className="font-medium text-foreground">
                      {req.maxNoticeDays ? `Max ${req.maxNoticeDays} Days` : "Immediate / Any"}
                    </span>
                  </div>
                </div>

                {/* Core Skills Chips */}
                {req.coreSkills && req.coreSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {req.coreSkills.slice(0, 5).map((skill) => (
                      <Badge
                        key={skill}
                        variant="secondary"
                        className="text-[11px] font-normal py-0 px-2"
                      >
                        {skill}
                      </Badge>
                    ))}
                    {req.coreSkills.length > 5 && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        +{req.coreSkills.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* Scorecard criteria indicator */}
                <div className="flex items-center justify-between text-xs pt-1 border-t text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-primary" />
                    <span>
                      {req._count.scorecardCriteria} Scorecard Criteria
                    </span>
                  </div>

                  <span className="text-[11px]">
                    Created by {req.createdBy.name}
                  </span>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Link href={`/requisitions/${req.id}/edit`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full text-xs h-8">
                      Edit Requisition
                    </Button>
                  </Link>
                  <Link href={`/requisitions/${req.id}`} className="flex-1">
                    <Button size="sm" className="w-full text-xs h-8 gap-1">
                      <span>View Dossier</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
