"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  X,
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  Search,
  Loader2,
  ShieldAlert,
  Info,
} from "lucide-react";

interface CandidateItem {
  id: string;
  candidateReference: string;
  fullName: string | null;
  currentRole: string | null;
  experienceYears: number | null;
  keySkills: string[];
  isFixture?: boolean;
  readiness:
    | "READY"
    | "OCR_REQUIRED"
    | "EXTRACTION_FAILED"
    | "PARSING_IN_PROGRESS"
    | "INSUFFICIENT_TEXT"
    | "NO_DOCUMENT";
  readinessMessage: string;
  document: {
    id: string;
    fileName: string;
    fileType: string;
  } | null;
  latestEvaluation: {
    id: string;
    status: string;
    overallScore: number | null;
    hasMustHaveWarnings: boolean;
    isReviewedByRecruiter: boolean;
  } | null;
}

interface StartScreeningDialogProps {
  requisitionId: string;
  requisitionTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onScreeningCompleted: () => void;
}

export function StartScreeningDialog({
  requisitionId,
  requisitionTitle,
  isOpen,
  onClose,
  onScreeningCompleted,
}: StartScreeningDialogProps) {
  const [candidates, setCandidates] = React.useState<CandidateItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [screening, setScreening] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [results, setResults] = React.useState<{
    evaluatedCount: number;
    errors?: Array<{ candidateId: string; error: string }>;
  } | null>(null);
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{
    currentChunk: number;
    totalChunks: number;
    processedCount: number;
    totalCount: number;
    percent: number;
  } | null>(null);

  const handleClose = () => {
    setSelectedIds(new Set());
    setResults(null);
    setGeneralError(null);
    setProgress(null);
    setSearch("");
    onClose();
  };

  React.useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;

    async function fetchEligibleCandidates() {
      try {
        const res = await fetch(`/api/requisitions/${requisitionId}/candidates`);
        const data = await res.json();
        if (isSubscribed) {
          if (data.success) {
            setCandidates(data.candidates);
            // Default select ready candidates that have not yet been evaluated
            const unEvaluatedReady = data.candidates
              .filter(
                (c: CandidateItem) =>
                  c.readiness === "READY" && !c.latestEvaluation
              )
              .map((c: CandidateItem) => c.id);
            setSelectedIds(new Set(unEvaluatedReady));
          } else {
            setGeneralError(data.error || "Failed to load eligible candidates.");
          }
        }
      } catch {
        if (isSubscribed) {
          setGeneralError("Network error fetching candidate pool.");
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    fetchEligibleCandidates();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, requisitionId]);

  if (!isOpen) return null;

  const filteredCandidates = candidates.filter((c) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      c.candidateReference.toLowerCase().includes(term) ||
      (c.fullName && c.fullName.toLowerCase().includes(term)) ||
      (c.currentRole && c.currentRole.toLowerCase().includes(term)) ||
      c.keySkills.some((s) => s.toLowerCase().includes(term))
    );
  });

  const toggleSelect = (id: string, isSelectable: boolean) => {
    if (!isSelectable || screening) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectAllReady = () => {
    const readyIds = filteredCandidates
      .filter((c) => c.readiness === "READY")
      .map((c) => c.id);
    setSelectedIds(new Set(readyIds));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleStartScreening = async () => {
    if (selectedIds.size === 0 || screening) return;

    setScreening(true);
    setGeneralError(null);
    setResults(null);

    const allIds = Array.from(selectedIds);
    // Reliable Serverless Chunking: Process in batches of 5 to avoid function timeouts
    const CHUNK_SIZE = 5;
    const totalChunks = Math.ceil(allIds.length / CHUNK_SIZE);
    let totalEvaluated = 0;
    const accumulatedErrors: Array<{ candidateId: string; error: string }> = [];

    try {
      for (let c = 0; c < totalChunks; c++) {
        const chunkIds = allIds.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
        setProgress({
          currentChunk: c + 1,
          totalChunks,
          processedCount: c * CHUNK_SIZE,
          totalCount: allIds.length,
          percent: Math.round(((c * CHUNK_SIZE) / allIds.length) * 100),
        });

        const res = await fetch(`/api/requisitions/${requisitionId}/screen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateIds: chunkIds,
            chunkIndex: c,
            totalChunks,
          }),
        });

        const data = await res.json();

        if (res.ok || data.evaluatedCount) {
          totalEvaluated += data.evaluatedCount || 0;
          if (Array.isArray(data.errors)) {
            accumulatedErrors.push(...data.errors);
          }
        } else {
          accumulatedErrors.push({
            candidateId: chunkIds.join(", "),
            error: data.error || `Batch ${c + 1} execution failed.`,
          });
        }
      }

      setProgress({
        currentChunk: totalChunks,
        totalChunks,
        processedCount: allIds.length,
        totalCount: allIds.length,
        percent: 100,
      });

      setResults({
        evaluatedCount: totalEvaluated,
        errors: accumulatedErrors.length > 0 ? accumulatedErrors : undefined,
      });
      onScreeningCompleted();
    } catch {
      setGeneralError("Network error occurred during screening execution.");
    } finally {
      setScreening(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Play className="h-4 w-4 fill-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">
                Run AI Resume Screening
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Evaluate candidate resumes against the 100% weighted scorecard for{" "}
              <strong className="text-foreground">{requisitionTitle}</strong>.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={screening}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {generalError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Screening Execution Notice</p>
                <p>{generalError}</p>
              </div>
            </div>
          )}

          {results && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
                <CheckCircle2 className="h-5 w-5" />
                <span>Screening Completed Successfully</span>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {results.evaluatedCount} candidate{results.evaluatedCount > 1 ? "s were" : " was"} evaluated with verified evidence quotations.
              </p>
              {results.errors && results.errors.length > 0 && (
                <div className="mt-2 space-y-1 pt-2 border-t border-emerald-500/20">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    {results.errors.length} candidate(s) could not be evaluated:
                  </p>
                  <ul className="text-[11px] text-amber-700 dark:text-amber-400 list-disc list-inside space-y-0.5">
                    {results.errors.map((err, i) => (
                      <li key={i}>{err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Live Serverless Chunked Progress Bar */}
          {screening && progress && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3.5 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-primary flex items-center gap-2 font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Screening Batch {progress.currentChunk} of {progress.totalChunks} ({progress.processedCount}/{progress.totalCount} candidates)
                </span>
                <span className="font-mono text-xs font-semibold text-primary">{progress.percent}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Search and Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search candidates by name, reference, skill, role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
                disabled={screening}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllReady}
                disabled={screening || loading}
                className="text-xs"
              >
                Select Ready
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={deselectAll}
                disabled={screening || loading}
                className="text-xs"
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Candidates List */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading agency candidate pool...</p>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-lg text-xs text-muted-foreground space-y-2">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/60" />
              <p>No candidates found matching your criteria.</p>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {filteredCandidates.map((c) => {
                const isReady = c.readiness === "READY";
                const isSelected = selectedIds.has(c.id);

                return (
                  <div
                    key={c.id}
                    onClick={() => toggleSelect(c.id, isReady)}
                    className={`flex items-start justify-between gap-3 p-3.5 text-xs transition-colors ${
                      !isReady
                        ? "bg-muted/30 opacity-70 cursor-not-allowed"
                        : isSelected
                        ? "bg-primary/5 cursor-pointer"
                        : "hover:bg-muted/40 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!isReady || screening}
                        onChange={() => toggleSelect(c.id, isReady)}
                        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">
                            {c.fullName || "Confidential Candidate"}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            ({c.candidateReference})
                          </span>
                          {c.isFixture && (
                            <Badge variant="outline" className="text-[10px] py-0">
                              Demo Fixture
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-[11px]">
                          {c.currentRole && <span>{c.currentRole}</span>}
                          {c.experienceYears !== null && (
                            <span>• {c.experienceYears} yrs experience</span>
                          )}
                          {c.document && (
                            <span className="flex items-center gap-1 font-mono text-[10px]">
                              <FileText className="h-3 w-3" />
                              {c.document.fileName}
                            </span>
                          )}
                        </div>

                        {c.keySkills.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {c.keySkills.slice(0, 4).map((skill, idx) => (
                              <span
                                key={idx}
                                className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground font-mono"
                              >
                                {skill}
                              </span>
                            ))}
                            {c.keySkills.length > 4 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{c.keySkills.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Readiness Badges */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {c.readiness === "READY" ? (
                        <Badge variant="success" className="text-[10px] gap-1 py-0">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Ready</span>
                        </Badge>
                      ) : c.readiness === "OCR_REQUIRED" ? (
                        <Badge variant="warning" className="text-[10px] gap-1 py-0" title={c.readinessMessage}>
                          <AlertTriangle className="h-3 w-3" />
                          <span>OCR Required</span>
                        </Badge>
                      ) : c.readiness === "EXTRACTION_FAILED" ? (
                        <Badge variant="destructive" className="text-[10px] gap-1 py-0" title={c.readinessMessage}>
                          <AlertCircle className="h-3 w-3" />
                          <span>Extraction Failed</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                          {c.readinessMessage}
                        </Badge>
                      )}

                      {c.latestEvaluation && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Evaluated:{" "}
                          <strong className="text-foreground">
                            {Math.round(c.latestEvaluation.overallScore || 0)}/100
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ethical AI Assurance Note */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <p>
              <strong>Ethical AI Guardrail:</strong> AI evaluation extracts verifiable evidence quotes from the resume. Scores provide recruiter decision-support; candidates are never automatically rejected or disqualified.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-4 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            <strong>{selectedIds.size}</strong> candidate{selectedIds.size === 1 ? "" : "s"} selected
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={screening}
            >
              {results ? "Close" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={handleStartScreening}
              disabled={selectedIds.size === 0 || screening}
              className="gap-1.5"
            >
              {screening ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Evaluating Resumes...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Screen {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
