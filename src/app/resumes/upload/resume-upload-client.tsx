"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Copy,
  ArrowRight,
  X,
  RefreshCw,
  FolderOpen,
  Sparkles,
  Layers,
} from "lucide-react";

interface RequisitionOption {
  id: string;
  title: string;
  status: string;
  department: string | null;
}

interface IngestItemSummary {
  fileName: string;
  status: "COMPLETED" | "DUPLICATE_SKIPPED" | "FAILED";
  documentId?: string;
  candidateReference?: string;
  errorMessage?: string;
}

interface BatchUploadResponse {
  success: boolean;
  batchJobId: string;
  summary: {
    total: number;
    successful: number;
    duplicates: number;
    failed: number;
    results: IngestItemSummary[];
  };
}

export function ResumeUploadClientView() {
  const [requisitions, setRequisitions] = React.useState<RequisitionOption[]>([]);
  const [selectedReqId, setSelectedReqId] = React.useState<string>("");
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<{
    current: number;
    total: number;
    fileName: string;
    percent: number;
  } | null>(null);
  const [uploadResult, setUploadResult] = React.useState<BatchUploadResponse | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Load active requisitions
  React.useEffect(() => {
    async function loadRequisitions() {
      try {
        const res = await fetch("/api/requisitions");
        const json = await res.json();
        if (json.success && json.data) {
          setRequisitions(json.data);
          const active = json.data.find((r: RequisitionOption) => r.status === "ACTIVE");
          if (active) setSelectedReqId(active.id);
          else if (json.data.length > 0) setSelectedReqId(json.data[0].id);
        }
      } catch (err) {
        console.error("Failed to load requisitions:", err);
      }
    }
    loadRequisitions();
  }, []);

  const processFiles = (filesArray: File[]) => {
    setErrorMessage(null);
    setUploadResult(null);

    if (filesArray.length > 500) {
      setErrorMessage(`Cannot select more than 500 files at once (selected: ${filesArray.length}).`);
      return;
    }

    const validFiles: File[] = [];
    for (const f of filesArray) {
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf" || ext === "docx") {
        validFiles.push(f);
      }
    }

    if (validFiles.length < filesArray.length) {
      setErrorMessage(
        `Ignored ${filesArray.length - validFiles.length} unsupported files. Only PDF and DOCX files are permitted.`
      );
    }

    setSelectedFiles(validFiles);
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    processFiles(Array.from(e.target.files));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadSubmit = async () => {
    setErrorMessage(null);
    if (!selectedReqId) {
      setErrorMessage("Please select a target Requisition for this resume batch.");
      return;
    }

    if (selectedFiles.length === 0) {
      setErrorMessage("Please select at least one PDF or DOCX file to ingest.");
      return;
    }

    if (selectedFiles.length > 500) {
      setErrorMessage(`Batch exceeds maximum permitted limit of 500 files.`);
      return;
    }

    setIsUploading(true);
    setUploadProgress(null);

    try {
      // Step 1: Request direct-to-storage presigned upload URLs (Cloudflare R2 / S3)
      let presignSuccessful = false;
      let presignData: any = null;

      try {
        const presignRes = await fetch("/api/resumes/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requisitionId: selectedReqId,
            files: selectedFiles.map((f) => ({
              fileName: f.name,
              fileSizeBytes: f.size,
              mimeType: f.type,
            })),
          }),
        });

        if (presignRes.ok) {
          presignData = await presignRes.json();
          if (presignData.success && Array.isArray(presignData.uploads)) {
            presignSuccessful = true;
          }
        }
      } catch (err) {
        console.warn("Direct presigned upload negotiation failed, falling back to multipart:", err);
      }

      if (presignSuccessful && presignData?.uploads) {
        // Step 2: Upload each file directly via HTTP PUT
        const uploadedItems = [];
        for (let i = 0; i < presignData.uploads.length; i++) {
          const uploadInfo = presignData.uploads[i];
          const file = selectedFiles[i];

          setUploadProgress({
            current: i + 1,
            total: presignData.uploads.length,
            fileName: file.name,
            percent: Math.round(((i + 1) / presignData.uploads.length) * 100),
          });

          const putRes = await fetch(uploadInfo.uploadUrl, {
            method: "PUT",
            headers: uploadInfo.headers || { "Content-Type": file.type || "application/pdf" },
            body: file,
          });

          if (!putRes.ok) {
            throw new Error(
              `Direct storage upload failed for '${file.name}' (HTTP ${putRes.status}).`
            );
          }

          uploadedItems.push({
            fileName: uploadInfo.fileName,
            storageKey: uploadInfo.storageKey,
            fileSizeBytes: file.size,
          });
        }

        // Step 3: Trigger batch ingestion confirmation (JSON only, zero file bytes pass through serverless function)
        const ingestRes = await fetch("/api/resumes/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requisitionId: selectedReqId,
            items: uploadedItems,
          }),
        });

        const ingestData = await ingestRes.json();
        if (!ingestRes.ok || !ingestData.success) {
          setErrorMessage(ingestData.error || "Batch ingestion confirmation failed.");
        } else {
          setUploadResult(ingestData);
          setSelectedFiles([]);
        }
      } else {
        // Fallback: Legacy multipart upload
        const formData = new FormData();
        formData.append("requisitionId", selectedReqId);
        for (const file of selectedFiles) {
          formData.append("files", file);
        }

        const res = await fetch("/api/resumes/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error || "Batch ingestion failed.");
        } else {
          setUploadResult(data);
          setSelectedFiles([]);
        }
      }
    } catch (err: any) {
      console.error("Upload failed:", err);
      setErrorMessage(err.message || "Network error occurred during batch resume upload.");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const selectedReq = requisitions.find((r) => r.id === selectedReqId);

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6 page-animate">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge variant="default" className="text-xs font-mono font-semibold">
            High-Volume Recruiter Intake
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">Max 500 CVs / Batch</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Bulk Resume Ingestion & Extraction Engine
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
          Upload candidate resumes in PDF or DOCX format. Features SHA-256 binary fingerprinting,
          duplicate detection, and conservative candidate profile generation.
        </p>
      </div>

      {/* Target Requisition Selector Card */}
      <Card className="border-border/80 shadow-2xs bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <span>Target Requisition Association</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Ingested resumes will attach to this requisition and become available for AI criteria evaluation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <select
              value={selectedReqId}
              onChange={(e) => setSelectedReqId(e.target.value)}
              className="flex h-9 w-full sm:w-[420px] rounded-lg border border-input bg-background/80 px-3 py-1.5 text-xs font-medium shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {requisitions.map((req) => (
                <option key={req.id} value={req.id}>
                  {req.title} [{req.status}] {req.department ? `— ${req.department}` : ""}
                </option>
              ))}
            </select>

            {selectedReq && (
              <Badge
                variant={selectedReq.status === "ACTIVE" ? "success" : "secondary"}
                dot
                className="text-xs self-start sm:self-auto font-mono"
              >
                Status: {selectedReq.status}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive flex items-center gap-2.5 animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Upload Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all duration-200 ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.005]"
            : "border-border/80 hover:border-primary/50 bg-card/60 hover:bg-card/90"
        }`}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs ring-4 ring-primary/5 mb-4">
          <UploadCloud className="h-7 w-7" />
        </div>

        <div className="space-y-1.5 max-w-md mx-auto">
          <h3 className="font-bold text-base text-foreground">
            {isDragging ? "Drop your resume batch here" : "Drag & drop resumes here, or click to browse"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Permitted formats: <span className="font-mono font-semibold text-foreground">.pdf</span> and{" "}
            <span className="font-mono font-semibold text-foreground">.docx</span> (Max 10MB per document, up to 500 files per upload batch)
          </p>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelection}
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
        />

        <div className="mt-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            className="text-xs h-9 gap-2 shadow-2xs pointer-events-none"
          >
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span>Select Files from Storage</span>
          </Button>
        </div>
      </div>

      {/* Selected Files Staging Tray */}
      {selectedFiles.length > 0 && !uploadResult && (
        <Card className="border-border/90 shadow-2xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span>Staged Candidate Documents</span>
                  <Badge variant="default" className="text-xs font-mono font-bold">
                    {selectedFiles.length} of 500
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Review selected files before submitting for server extraction and deduplication.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFiles([]);
                }}
                className="text-xs h-7 text-muted-foreground hover:text-destructive"
              >
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-xs">
              {selectedFiles.slice(0, 50).map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/60 text-foreground transition-colors hover:bg-muted/70"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold truncate">{file.name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(idx);
                    }}
                    className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {selectedFiles.length > 50 && (
                <div className="text-center py-2 text-xs text-muted-foreground font-mono bg-muted/20 rounded-lg">
                  + {selectedFiles.length - 50} more files selected
                </div>
              )}
            </div>

            {/* Direct-to-Storage Upload Progress */}
            {isUploading && uploadProgress && (
              <div className="p-3.5 bg-primary/10 border border-primary/25 rounded-xl space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-primary flex items-center gap-2 font-medium">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Direct Uploading {uploadProgress.current} of {uploadProgress.total}:{" "}
                    <span className="truncate max-w-[200px] sm:max-w-xs">{uploadProgress.fileName}</span>
                  </span>
                  <span className="text-primary font-bold">{uploadProgress.percent}%</span>
                </div>
                <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200 rounded-full"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-border/60 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                All files will be verified with SHA-256 and checked for existing duplicates.
              </span>
              <Button
                size="sm"
                disabled={isUploading}
                onClick={handleUploadSubmit}
                isLoading={isUploading}
                className="text-xs h-9 gap-2 shadow-xs"
              >
                {!isUploading && <UploadCloud className="h-4 w-4" />}
                <span>
                  {isUploading
                    ? `Processing ${selectedFiles.length} CVs...`
                    : `Start Batch Ingestion (${selectedFiles.length} Files)`}
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Processing Results Summary */}
      {uploadResult && (
        <Card className="border-emerald-500/30 bg-emerald-500/[0.02] shadow-2xs">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Batch Ingestion Completed</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Job ID: <span className="font-mono text-foreground">{uploadResult.batchJobId}</span>
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                {selectedReqId && (
                  <Link href={`/requisitions/${selectedReqId}`}>
                    <Button size="sm" className="text-xs h-8 gap-1.5 shadow-2xs">
                      <span>Screen Requisition</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                )}
                <Link href="/candidates">
                  <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5">
                    <span>Candidate Pool</span>
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Metric Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Total Submitted"
                value={uploadResult.summary.total}
                subtext="Documents in batch"
              />
              <MetricCard
                label="Successful"
                value={uploadResult.summary.successful}
                variant="success"
                subtext="Text parsed & attached"
              />
              <MetricCard
                label="Duplicates"
                value={uploadResult.summary.duplicates}
                variant="warning"
                subtext="SHA-256 fingerprint match"
              />
              <MetricCard
                label="Failed"
                value={uploadResult.summary.failed}
                variant={uploadResult.summary.failed > 0 ? "danger" : "default"}
                subtext="Corrupt or unreadable"
              />
            </div>

            {/* Results Table */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-foreground">Itemized Extraction Log:</span>
              <div className="max-h-64 overflow-y-auto space-y-1.5 text-xs font-mono">
                {uploadResult.summary.results.map((res, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-lg bg-card border border-border/80 flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-sans font-medium">{res.fileName}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {res.status === "COMPLETED" && (
                        <Badge variant="success" dot className="text-[10px] py-0 font-mono">
                          {res.candidateReference || "Ingested"}
                        </Badge>
                      )}
                      {res.status === "DUPLICATE_SKIPPED" && (
                        <Badge variant="warning" dot className="text-[10px] py-0 font-mono gap-1">
                          <Copy className="h-3 w-3" />
                          <span>Duplicate</span>
                        </Badge>
                      )}
                      {res.status === "FAILED" && (
                        <Badge variant="destructive" dot className="text-[10px] py-0 font-mono">
                          Failed
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
