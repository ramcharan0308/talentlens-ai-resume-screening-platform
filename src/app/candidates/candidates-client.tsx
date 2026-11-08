"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import { UserRole } from "@prisma/client";
import {
  Users,
  Search,
  Briefcase,
  FileText,
  UploadCloud,
  ChevronRight,
  Sparkles,
  Download,
  X,
  Shield,
  Clock,
  Award,
} from "lucide-react";

const cubicEase = [0.16, 1, 0.3, 1] as const;

interface CandidateItem {
  id: string;
  candidateReference: string;
  fullName: string | null;
  currentRole: string | null;
  experienceYears: number | null;
  keySkills: string[];
  noticeDays: number | null;
  isFixture: boolean;
  createdAt: string;
  applications: Array<{
    id: string;
    status: string;
    requisition: {
      id: string;
      title: string;
      status: string;
    };
  }>;
  uploadedDocuments: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number | null;
    processingStatus: string;
    createdAt: string;
  }>;
}

export function CandidatesClientView({ userRole }: { userRole?: UserRole }) {
  const [candidates, setCandidates] = React.useState<CandidateItem[]>([]);
  const [counts, setCounts] = React.useState({ total: 0, fixtures: 0, ingested: 0 });
  const [selectedFilter, setSelectedFilter] = React.useState<"ALL" | "INGESTED" | "FIXTURES">("ALL");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);

  const isClientRole = userRole === UserRole.CLIENT_HIRING_MGR;

  const fetchCandidates = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedFilter === "INGESTED") params.append("isFixture", "false");
      else if (selectedFilter === "FIXTURES") params.append("isFixture", "true");

      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }

      const res = await fetch(`/api/candidates?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setCandidates(json.data);
        if (json.counts) {
          setCounts(json.counts);
        }
      }
    } catch (err) {
      console.error("Failed to load candidates:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFilter, searchQuery]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchCandidates();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchCandidates]);

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8 page-animate">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="text-xs font-mono font-semibold bg-background/80">
              {isClientRole ? "Client Candidate Review Pool" : "Agency Talent Ingestion Pool"}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="h-3 w-3 text-emerald-500" />
              <span>DPDP Pseudonymous Privacy</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Candidate Profiles &amp; Dossiers
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
            Browse candidate profiles, benchmark fixtures, and role allocations with verified credentials.
          </p>
        </div>

        {!isClientRole && (
          <div className="flex items-center gap-2">
            <Link href="/resumes/upload">
              <Button size="sm" className="gap-1.5 shadow-glow-primary text-xs h-9 font-semibold">
                <UploadCloud className="h-4 w-4" />
                <span>Bulk Ingest CVs</span>
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Total Candidates"
          value={counts.total}
          icon={<Users className="h-4 w-4 text-primary" />}
          variant="highlight"
          subtext="Total candidate profiles in tenant"
        />
        <MetricCard
          label="Ingested from Resumes"
          value={counts.ingested}
          icon={<FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          variant="success"
          subtext="Extracted via bulk uploads"
        />
        <MetricCard
          label="Benchmark Fixtures"
          value={counts.fixtures}
          icon={<Sparkles className="h-4 w-4 text-amber-500" />}
          variant="warning"
          subtext="Standard test fixture profiles"
        />
      </div>

      {/* Controls Bar: Filter Pills & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/70 text-xs font-medium">
          {[
            { key: "ALL", label: "All Candidates", count: counts.total },
            { key: "INGESTED", label: "Ingested CVs", count: counts.ingested },
            { key: "FIXTURES", label: "Benchmark Fixtures", count: counts.fixtures },
          ].map((tab) => {
            const isSelected = selectedFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSelectedFilter(tab.key as any)}
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
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reference, name, skills..."
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

      {/* Candidate Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-48 rounded-xl bg-card border border-border/70 p-6 space-y-4 skeleton-shimmer"
            >
              <div className="h-5 w-1/3 bg-muted rounded" />
              <div className="h-4 w-1/2 bg-muted rounded" />
              <div className="h-16 w-full bg-muted/60 rounded" />
            </div>
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-muted-foreground" />}
          title="No candidates found"
          description={
            isClientRole
              ? "No candidates have been submitted to your review portal yet."
              : "Upload resumes or adjust your search keywords to view candidate profiles."
          }
          action={
            !isClientRole ? (
              <Link href="/resumes/upload">
                <Button size="sm" className="text-xs gap-1.5 font-semibold">
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>Upload Resumes</span>
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {candidates.map((cand, index) => (
            <motion.div
              key={cand.id}
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
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-muted/60 border border-border/70 text-foreground">
                          {cand.candidateReference}
                        </span>

                        {cand.isFixture ? (
                          <Badge variant="warning" dot className="text-[10px] py-0 px-2 font-mono">
                            Fixture
                          </Badge>
                        ) : (
                          <Badge variant="success" dot className="text-[10px] py-0 px-2 font-mono">
                            Parsed CV
                          </Badge>
                        )}
                      </div>

                      <Link
                        href={`/candidates/${cand.id}`}
                        className="font-bold text-base sm:text-lg text-foreground hover:text-primary transition-colors block truncate group-hover:text-primary"
                      >
                        {cand.fullName || cand.candidateReference}
                      </Link>
                      <span className="text-xs text-muted-foreground block truncate">
                        {cand.currentRole || "Role unspecified"}
                      </span>
                    </div>

                    {/* Attached Document Download (Agency only) */}
                    {!isClientRole && cand.uploadedDocuments.length > 0 && (
                      <Link
                        href={`/api/documents/${cand.uploadedDocuments[0].id}/download`}
                        target="_blank"
                        className="text-muted-foreground hover:text-primary p-2 rounded-lg border border-border/80 hover:bg-muted/60 transition-colors shrink-0 cursor-pointer"
                        title="Download original CV"
                      >
                        <Download className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-0">
                  {/* Specs Matrix */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-2.5 rounded-xl border border-border/60 font-mono">
                    <div>
                      <span className="text-muted-foreground block text-[11px] font-sans">Experience:</span>
                      <span className="font-semibold text-foreground">
                        {cand.experienceYears !== null ? `${cand.experienceYears} Years` : "Unspecified"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px] font-sans">Notice Period:</span>
                      <span className="font-semibold text-foreground">
                        {cand.noticeDays !== null ? `${cand.noticeDays} Days` : "Unspecified"}
                      </span>
                    </div>
                  </div>

                  {/* Skills Chips */}
                  {cand.keySkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {cand.keySkills.slice(0, 4).map((skill) => (
                        <Badge
                          key={skill}
                          variant="secondary"
                          className="text-[11px] font-mono py-0.5 px-2 bg-secondary/70 border border-border/60"
                        >
                          {skill}
                        </Badge>
                      ))}
                      {cand.keySkills.length > 4 && (
                        <span className="text-[10px] text-muted-foreground font-mono self-center">
                          +{cand.keySkills.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Requisition Allocation */}
                  <div className="pt-2.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="truncate min-w-0 pr-2">
                      {cand.applications.length > 0 ? (
                        <span className="flex items-center gap-1.5 truncate">
                          <Briefcase className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="truncate font-medium text-foreground">
                            {cand.applications[0].requisition.title}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/80 italic">Unassigned to requisition</span>
                      )}
                    </div>

                    <Link href={`/candidates/${cand.id}`}>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2.5 hover:text-primary group-hover:text-primary">
                        <span>View Dossier</span>
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
