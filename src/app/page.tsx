import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Users,
  CheckCircle2,
  Clock,
  Layers,
  Database,
  UserCheck,
  Building2,
} from "lucide-react";

export default function Home() {
  return (
    <div className="container py-10 space-y-10 max-w-6xl">
      {/* Hero / System Overview */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 border-primary/30 text-primary bg-primary/5">
            Architecture Milestone 1 Active
          </Badge>
          <Badge variant="success" className="text-xs">
            Prisma Schema Validated
          </Badge>
          <Badge variant="secondary" className="text-xs">
            Next.js App Router (TypeScript Strict)
          </Badge>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            TalentLens Resume Screening & Client Portal
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-3xl leading-relaxed">
            AI-powered resume evaluation platform for Company A (Noida). High-volume bulk screening,
            anti-bias PII sanitization, grounded evidence quotation, and tenant-isolated client review portals.
          </p>
        </div>
      </div>

      {/* High-Level Operating Metrics Preview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Requisitions / Mo
            </CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">300</div>
            <p className="text-xs text-muted-foreground mt-1">IT services, BFSI & Retail</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Avg CVs / Requisition
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">120</div>
            <p className="text-xs text-muted-foreground mt-1">Target turnaround: &lt; 48h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Target Shortlist TAT
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">48 Hours</div>
            <p className="text-xs text-muted-foreground mt-1">Reduced from 5 days baseline</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Candidate Acceptance
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">60% Goal</div>
            <p className="text-xs text-muted-foreground mt-1">Up from 45% historical rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Role-Based Architectural Workspaces */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Portal Workspaces (RBAC Scope)</h2>
          <span className="text-xs text-muted-foreground">Auth.js role-gated in Milestone 2</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                  <Users className="h-5 w-5" />
                </div>
                <Badge variant="outline" className="text-[11px]">Role: RECRUITER</Badge>
              </div>
              <CardTitle className="text-base">Recruiter Intake & Dossier Studio</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Requisition scorecard configuration, bulk document upload, anti-bias sanitization,
                and split-screen resume evidence verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xs text-muted-foreground space-y-1.5 border-t pt-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Mandatory CV inspection enforcement</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Grounded evidence quote highlighting</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                  <Building2 className="h-5 w-5" />
                </div>
                <Badge variant="outline" className="text-[11px]">Role: CLIENT_HIRING_MGR</Badge>
              </div>
              <CardTitle className="text-base">Client Shortlist Portal</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Mobile-optimized review portal with masked candidate contact details. Direct actions:
                One-Click Shortlist, Reject with Reason, or Propose Interview Slot.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xs text-muted-foreground space-y-1.5 border-t pt-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  <span>Tenant isolation (own submissions only)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  <span>Masked PII (Candidate CND-XXXXX)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <UserCheck className="h-5 w-5" />
                </div>
                <Badge variant="outline" className="text-[11px]">Role: DELIVERY_HEAD</Badge>
              </div>
              <CardTitle className="text-base">DPDP Compliance & Audit Console</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Append-only audit trail monitoring profile access, fairness rank correlation,
                and DPDP Section 12 Right-to-Erasure candidate purge execution.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xs text-muted-foreground space-y-1.5 border-t pt-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Append-only access audit logs</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Idempotent candidate erasure workflow</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Active Benchmark Requisition Specification */}
      <Card className="border-border/80">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Assignment Benchmark Requisition</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Target job profile used for end-to-end evaluation & test fixtures
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              REQ-2026-JAVA01
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-muted/40 p-4 rounded-lg border">
            <div>
              <span className="text-muted-foreground block font-medium">Position</span>
              <span className="font-semibold text-foreground">Senior Java Developer</span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">Location</span>
              <span className="font-semibold text-foreground">Noida, Uttar Pradesh</span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">Required Experience</span>
              <span className="font-semibold text-foreground">5 to 8 Years</span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">Maximum Notice Period</span>
              <span className="font-semibold text-foreground">Up to 60 Days</span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-foreground">Core Skills Required:</span>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">Java</Badge>
              <Badge variant="secondary" className="text-xs">Spring Boot</Badge>
              <Badge variant="secondary" className="text-xs">Microservices</Badge>
              <Badge variant="outline" className="text-xs">REST APIs</Badge>
              <Badge variant="outline" className="text-xs">PostgreSQL / Hibernate</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Database Schema Entities Ready */}
      <Card className="bg-muted/20 border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Prisma Database Foundation (Milestone 1)</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Entities, relations, indexes, and constraints successfully compiled into the Prisma Client
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>User</span>
              <span className="text-[10px] text-muted-foreground">RBAC</span>
            </div>
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>Organization</span>
              <span className="text-[10px] text-muted-foreground">Tenant</span>
            </div>
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>Requisition</span>
              <span className="text-[10px] text-muted-foreground">Scoped</span>
            </div>
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>Candidate</span>
              <span className="text-[10px] text-muted-foreground">Agency Owned</span>
            </div>
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>UploadedDocument</span>
              <span className="text-[10px] text-muted-foreground">Agency Hash</span>
            </div>
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>BatchUploadJob</span>
              <span className="text-[10px] text-muted-foreground">Batch Scope</span>
            </div>
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>BatchFileItem</span>
              <span className="text-[10px] text-muted-foreground">Idempotent</span>
            </div>
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>Application</span>
              <span className="text-[10px] text-muted-foreground">Unique Pair</span>
            </div>
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>ConsentRecord</span>
              <span className="text-[10px] text-muted-foreground">Agency Scope</span>
            </div>
            <div className="p-2.5 rounded bg-card border flex items-center justify-between">
              <span>AuditLog</span>
              <span className="text-[10px] text-muted-foreground">Append Policy</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
