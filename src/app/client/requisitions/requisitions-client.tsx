"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FileText,
  Search,
  Briefcase,
  MapPin,
  Clock,
  Users,
  ChevronRight,
  RotateCw,
  Building2,
  Calendar,
  X,
  ArrowLeft,
} from "lucide-react";
import { AuthenticatedUser } from "@/lib/auth";

interface ClientRequisition {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  status: string;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  maxNoticeDays: number | null;
  targetSalaryRange: string | null;
  coreSkills: string[];
  createdAt: string;
  metrics: {
    submittedCount: number;
    pendingCount: number;
    shortlistedCount: number;
    interviewCount: number;
    rejectedCount: number;
  };
}

export function ClientRequisitionsListView({ user }: { user: AuthenticatedUser }) {
  const [requisitions, setRequisitions] = React.useState<ClientRequisition[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const fetchRequisitions = React.useCallback(async () => {
    try {
      const res = await fetch("/api/client/requisitions");
      const json = await res.json();
      if (json.success && json.data) {
        setRequisitions(json.data);
      } else {
        setError(json.error || "Failed to load requisitions.");
      }
    } catch {
      setError("Network error loading requisitions.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchRequisitions();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchRequisitions]);

  const filtered = requisitions.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      (r.department && r.department.toLowerCase().includes(q)) ||
      (r.location && r.location.toLowerCase().includes(q)) ||
      r.coreSkills.some((s) => s.toLowerCase().includes(q))
    );
  });

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6 page-animate">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge variant="outline" className="text-xs font-mono">Client Hiring Portal</Badge>
            <Badge variant="default" className="text-xs flex items-center gap-1 font-sans">
              <Building2 className="h-3 w-3" />
              <span>{user.organizationName}</span>
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Assigned Requisitions
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Active roles opened with your staffing partner and incoming candidate pipelines.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/client">
            <Button variant="outline" size="sm" className="text-xs h-9 gap-1.5 shadow-2xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Dashboard</span>
            </Button>
          </Link>
          <Button onClick={fetchRequisitions} variant="ghost" size="sm" className="h-9 w-9 p-0" title="Refresh">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
          <Input
            placeholder="Search job title, skills, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-8 text-xs h-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-card border border-border/80 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-6 text-center text-destructive border-destructive/40 bg-destructive/5">
          <p className="text-sm font-semibold">{error}</p>
          <Button onClick={fetchRequisitions} variant="outline" size="sm" className="mt-3 text-xs">
            Retry
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6 text-muted-foreground" />}
          title="No assigned requisitions found"
          description="Assigned job profiles will be linked by your staffing agency partner."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((req) => (
            <Card key={req.id} className="hover:border-primary/50 transition-all duration-200 shadow-2xs">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="space-y-2.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-base sm:text-lg text-foreground">{req.title}</span>
                      <Badge variant="success" dot className="text-[10px] font-mono">
                        {req.status}
                      </Badge>
                      {req.department && (
                        <span className="text-xs text-muted-foreground">• {req.department}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-mono">
                      {req.location && (
                        <span className="flex items-center gap-1 font-sans">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground/80" /> {req.location}
                        </span>
                      )}
                      {(req.minExperienceYears || req.maxExperienceYears) && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5 text-primary" />
                          {req.minExperienceYears ?? 0} - {req.maxExperienceYears ?? "Any"} yrs exp
                        </span>
                      )}
                      {req.targetSalaryRange && <span>💰 {req.targetSalaryRange}</span>}
                    </div>

                    {req.coreSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {req.coreSkills.map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-[10px] font-mono px-2 py-0.5">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Submission Metrics & Action */}
                  <div className="flex flex-wrap md:flex-col items-end gap-3.5 shrink-0 border-t md:border-t-0 md:border-l border-border/80 pt-4 md:pt-0 md:pl-6">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <div className="text-center px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <span className="font-extrabold text-amber-600 block text-sm">
                          {req.metrics.pendingCount}
                        </span>
                        <span className="text-[9px] font-sans text-muted-foreground">Pending</span>
                      </div>
                      <div className="text-center px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <span className="font-extrabold text-emerald-600 block text-sm">
                          {req.metrics.shortlistedCount}
                        </span>
                        <span className="text-[9px] font-sans text-muted-foreground">Shortlist</span>
                      </div>
                      <div className="text-center px-2.5 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <span className="font-extrabold text-blue-600 block text-sm">
                          {req.metrics.interviewCount}
                        </span>
                        <span className="text-[9px] font-sans text-muted-foreground">Interviews</span>
                      </div>
                    </div>

                    <Link href={`/client/requisitions/${req.id}`}>
                      <Button size="sm" className="gap-1.5 text-xs h-8 shadow-2xs font-semibold">
                        <span>Review Dossiers ({req.metrics.submittedCount})</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
