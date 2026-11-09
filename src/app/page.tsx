"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { ShinyBadge } from "@/components/ui/shiny-badge";
import { AnimatedText } from "@/components/ui/animated-text";
import { TalentLens3DScene } from "@/components/ui/talent-lens-3d-scene";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import {
  FileText,
  Users,
  CheckCircle2,
  Clock,
  Layers,
  Building2,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  UploadCloud,
  Sparkles,
  Quote,
  ShieldAlert,
  Sliders,
  Check,
  Zap,
  TrendingUp,
  Activity,
  Lock,
} from "lucide-react";

const cubicEase = [0.16, 1, 0.3, 1] as const;

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: cubicEase },
  },
};

const workspaceCards = [
  {
    icon: <Users className="h-5 w-5" />,
    iconBg: "bg-primary/12 text-primary",
    hoverBorder: "hover:border-primary/50",
    badge: "RECRUITER",
    title: "Recruiter Screening Studio",
    description:
      "Requisition scorecards, bulk resume upload, anti-bias sanitization, and split-screen grounded evidence verification.",
    features: ["Mandatory CV inspection prerequisite", "Grounded quotation highlighting"],
    featureColor: "bg-primary",
    href: "/requisitions",
    cta: "Enter Requisitions",
    delay: 0,
  },
  {
    icon: <Building2 className="h-5 w-5" />,
    iconBg: "bg-amber-500/12 text-amber-500",
    hoverBorder: "hover:border-amber-500/50",
    badge: "CLIENT_HIRING_MGR",
    title: "Client Shortlist Portal",
    description:
      "Mobile-first decision portal with masked contact details. One-Click Shortlist, Reject with Reason, or Propose Interview Slot.",
    features: ["Tenant isolation (own submissions only)", "Masked PII (Candidate CND-XXXXX)"],
    featureColor: "bg-amber-500",
    href: "/client",
    cta: "Open Client Portal",
    delay: 0.07,
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    iconBg: "bg-orange-500/12 text-orange-400",
    hoverBorder: "hover:border-orange-500/50",
    badge: "DELIVERY_HEAD",
    title: "Delivery Ops & Analytics",
    description:
      "Real-time operational dashboard: SLA performance, recruiter productivity, requisition turnaround, and 7-stage conversion funnel.",
    features: ["SLA 48h boundary enforcement", "Recruiter review turnaround metrics"],
    featureColor: "bg-orange-400",
    href: "/delivery/dashboard",
    cta: "Open Delivery Ops",
    delay: 0.14,
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    iconBg: "bg-emerald-500/12 text-emerald-400",
    hoverBorder: "hover:border-emerald-500/50",
    badge: "GOVERNANCE",
    title: "DPDP Privacy & Retention",
    description:
      "Candidate consent recording with withdrawal workflow, Section 12 Right-to-Erasure execution, and retention review.",
    features: ["Idempotent candidate erasure workflow", "Configurable retention policies"],
    featureColor: "bg-emerald-400",
    href: "/retention",
    cta: "Open Governance",
    delay: 0.21,
  },
];

export default function Home() {
  return (
    <div className="page-animate">
      {/* ── 1. HERO — Precision Optical Talent Prism 3D ── */}
      <div className="relative overflow-hidden">
        <TalentLens3DScene className="w-full min-h-[540px] lg:min-h-[600px] flex items-center">
          {/* Content wrapper with constrained width */}
          <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-12 lg:py-16">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-14 items-center">

              {/* Left Column */}
              <div className="md:col-span-7 space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.38, ease: cubicEase }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/12 text-primary border border-primary/25 shadow-sm">
                    <Zap className="h-3.5 w-3.5 fill-primary" />
                    Nordic Instrumentarium
                  </span>
                  <ShinyBadge variant="success" size="sm">
                    SLA Engine Active (48h TAT)
                  </ShinyBadge>
                  <Badge variant="outline" className="text-xs font-mono bg-background/85 border-border">
                    DPDP Section 12 Compliant
                  </Badge>
                </motion.div>

                <div className="space-y-4">
                  <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight text-foreground leading-[1.09]">
                    <AnimatedText
                      text="Intelligent Recruitment Operations & AI Screening"
                      tag="span"
                      duration={0.48}
                      stagger={0.025}
                    />
                  </h1>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.18, ease: "easeOut" }}
                    className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl"
                  >
                    High-throughput candidate screening with verbatim evidence quotation, deterministic
                    100% weighted scorecards, candidate lifecycle transitions, and client shortlist portals.
                  </motion.p>
                </div>

                {/* CTA Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.26, ease: cubicEase }}
                  className="flex flex-wrap items-center gap-3 pt-1"
                >
                  <Link href="/requisitions">
                    <Button
                      size="lg"
                      className="gap-2 text-sm font-bold shadow-glow-primary bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 group px-6"
                    >
                      <FileText className="h-4 w-4" />
                      Open Requisitions Pipeline
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Button>
                  </Link>
                  <Link href="/delivery/dashboard">
                    <Button
                      variant="outline"
                      size="lg"
                      className="gap-2 text-sm font-semibold border-border/90 bg-card/90 hover:bg-muted text-foreground transition-all duration-200 px-5"
                    >
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Delivery Ops Dashboard
                    </Button>
                  </Link>
                  <Link href="/resumes/upload">
                    <Button
                      variant="ghost"
                      size="lg"
                      className="gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-card/60"
                    >
                      <UploadCloud className="h-4 w-4" />
                      Bulk CV Ingest
                    </Button>
                  </Link>
                </motion.div>

                {/* Trust Indicators */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.38 }}
                  className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    Evidence Grounded Citations
                  </span>
                  <span className="text-border">•</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    Sub-second Rule Match
                  </span>
                  <span className="text-border">•</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Lock className="h-3.5 w-3.5 text-amber-500" />
                    Strict Tenant Isolation
                  </span>
                </motion.div>
              </div>

              {/* Right Column — Live Qualification Card */}
              <div className="md:col-span-5">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.14, ease: cubicEase }}
                  className="relative rounded-2xl border border-border/80 bg-card/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-4"
                >
                  {/* Subtle top accent line */}
                  <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent rounded-full" />

                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary badge-pulse" />
                        Live Candidate Qualification
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">Java Microservices Lead</span>
                        <Badge variant="outline" className="text-[10px] font-mono font-semibold">CND-91088</Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-extrabold text-emerald-400 font-mono tracking-tight">92 / 100</div>
                      <span className="text-[10px] text-muted-foreground font-medium">AI Match Score</span>
                    </div>
                  </div>

                  {/* Evidence Quotation */}
                  <div className="p-3.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/25 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
                      <span className="flex items-center gap-1.5">
                        <Quote className="h-3.5 w-3.5" />
                        Verbatim Resume Quotation
                      </span>
                      <Badge variant="success" className="text-[9px] py-0 px-1.5 font-mono">SUPPORTED</Badge>
                    </div>
                    <p className="font-mono text-[11px] text-foreground/90 italic leading-relaxed">
                      &ldquo;Architected event-driven microservices handling 45k TPS with Kafka &amp; PostgreSQL...&rdquo;
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-emerald-400/90 font-mono pt-0.5">
                      <span>Criteria: Spring Boot &amp; Kafka</span>
                      <span>Offset: 412–478</span>
                    </div>
                  </div>

                  {/* Pipeline Stepper */}
                  <div className="space-y-2.5 pt-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-muted-foreground">Pipeline State</span>
                      <Badge variant="success" className="text-[10px] font-bold">CLIENT SHORTLISTED</Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      {["1. Ingest", "2. Screen", "3. Submit", "4. Shortlist"].map((step, i) => (
                        <div
                          key={step}
                          className={`p-1.5 rounded-lg text-[10px] font-bold transition-all ${
                            i < 3
                              ? "bg-emerald-500/12 border border-emerald-500/25 text-emerald-300"
                              : "bg-primary/18 border border-primary/35 text-primary"
                          }`}
                        >
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sign-off */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/70 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      CV Inspected by Priya S.
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-foreground">SLA: 28.4h / 48.0h</span>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </TalentLens3DScene>
      </div>

      {/* Page body — constrained width */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">

        {/* ── 2. OPERATIONAL BENCHMARKS ── */}
        <ScrollReveal className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                Operational Benchmarks & Delivery Standards
              </h2>
              <p className="text-xs text-muted-foreground">Company A (Noida) Target Architecture &amp; Real-Time SLAs</p>
            </div>
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline">Baseline Neon PostgreSQL</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "SLA Target TAT",
                value: "48.0 Hours",
                subtext: "First qualified submission to client",
                icon: <Clock className="h-4 w-4 text-primary" />,
                badge: "Target",
                variant: "highlight" as const,
                tooltip: "Calculated from requisition activation to first client candidate submission",
                delay: 0,
              },
              {
                label: "Requisitions / Mo",
                value: "300",
                subtext: "Active IT, BFSI & Retail demand",
                icon: <Layers className="h-4 w-4 text-muted-foreground" />,
                tooltip: "Agency capacity for open job requisitions",
                delay: 0.07,
              },
              {
                label: "Ingest Capacity",
                value: "500 CVs",
                subtext: "Per batch with SHA-256 deduplication",
                icon: <UploadCloud className="h-4 w-4 text-muted-foreground" />,
                tooltip: "Bulk resume upload limit with client-side batching",
                delay: 0.14,
              },
              {
                label: "Client Acceptance Goal",
                value: "60.0%",
                subtext: "Target shortlist to submission ratio",
                icon: <TrendingUp className="h-4 w-4 text-emerald-400" />,
                variant: "success" as const,
                tooltip: "Defined as client shortlisted candidates divided by total submitted candidates",
                delay: 0.21,
              },
            ].map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </ScrollReveal>

        {/* ── 3. ROLE-BASED WORKSPACES BENTO GRID ── */}
        <ScrollReveal className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                Role-Based Workspaces & Portals
              </h2>
              <p className="text-xs text-muted-foreground">Strict Server-Side RBAC &amp; Multi-Tenant Boundary Controls</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {workspaceCards.map((card) => (
              <motion.div
                key={card.title}
                whileHover={{ y: -3, transition: { duration: 0.2, ease: cubicEase } }}
              >
                <SpotlightCard className={`flex flex-col justify-between h-full transition-all duration-200 border-white/[0.08] ${card.hoverBorder}`}>
                  <div className="space-y-2.5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className={`p-2 rounded-xl ${card.iconBg}`}>
                        {card.icon}
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono font-semibold bg-white/[0.04] border-white/[0.08]">
                        {card.badge}
                      </Badge>
                    </div>
                    <h3 className="text-sm font-bold leading-snug text-foreground">{card.title}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                  <div className="pt-0 space-y-3">
                    <div className="text-xs text-muted-foreground space-y-1.5 border-t border-white/[0.08] pt-3">
                      {card.features.map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${card.featureColor}`} />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                    <Link href={card.href} className="block pt-1">
                      <Button variant="outline" size="sm" className="w-full text-xs justify-between group transition-all duration-200 hover:border-primary/40 hover:text-primary border-white/[0.08] bg-white/[0.03]">
                        <span>{card.cta}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </Button>
                    </Link>
                  </div>
                </SpotlightCard>
              </motion.div>
            ))}
          </div>
        </ScrollReveal>

        {/* ── 4. ACTIVE BENCHMARK REQUISITION ── */}
        <ScrollReveal>
          <Card className="border-border/80 bg-card/90 shadow-card backdrop-blur-sm overflow-hidden">
            {/* Top accent bar */}
            <div className="h-0.5 bg-gradient-to-r from-primary/80 via-primary/40 to-transparent" />
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold">Assignment Benchmark Requisition</CardTitle>
                    <Badge variant="default" className="text-[10px] font-mono font-semibold">ACTIVE</Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Standard job profile used for end-to-end AI criteria scoring, evidence extraction, and pipeline fixtures
                  </CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-xs px-2.5 py-1 font-semibold border-white/[0.08] bg-white/[0.04]">
                  REQ-2026-JAVA01
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white/[0.03] p-4 rounded-xl border border-white/[0.08]">
                {[
                  { label: "Position", value: "Senior Java Developer" },
                  { label: "Location", value: "Noida, Uttar Pradesh" },
                  { label: "Required Experience", value: "5 to 8 Years" },
                  { label: "Maximum Notice Period", value: "Up to 60 Days" },
                ].map((item) => (
                  <div key={item.label}>
                    <span className="text-muted-foreground block font-medium mb-0.5">{item.label}</span>
                    <span className="font-semibold text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-foreground">Core Evaluation Skills:</span>
                <div className="flex flex-wrap gap-1.5">
                  {["Java", "Spring Boot", "Microservices"].map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs font-mono font-medium">{skill}</Badge>
                  ))}
                  {["REST APIs", "PostgreSQL / Hibernate"].map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs font-mono font-medium">{skill}</Badge>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Configured with 5 weighted scorecard criteria totaling 100% in Neon PostgreSQL.
                </span>
                <Link href="/requisitions">
                  <Button size="sm" variant="default" className="text-xs gap-1.5 h-8 group">
                    <span>View Live Requisition &amp; Pipeline</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </ScrollReveal>

      </div>
    </div>
  );
}
