"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShinyBadge } from "@/components/ui/shiny-badge";
import {
  Sparkles,
  Shield,
  AlertCircle,
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  Users,
  Building2,
  BarChart3,
  Check,
  Zap,
  RefreshCw,
} from "lucide-react";

const cubicEase = [0.16, 1, 0.3, 1] as const;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [activePersonaEmail, setActivePersonaEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetryingColdStart, setIsRetryingColdStart] = useState(false);

  const demoAccounts = [
    {
      label: "Recruiter",
      name: "Priya Sharma",
      email: "priya.sharma@companya-noida.internal",
      role: "RECRUITER",
      org: "Company A (Noida)",
      color: "bg-primary/10 text-primary border-primary/30",
      icon: <Users className="h-4 w-4 text-primary" />,
      description: "Screening Studio, Bulk CV Ingestion & Evaluation Review",
      defaultRedirect: "/requisitions",
    },
    {
      label: "Delivery Head",
      name: "Ananya Roy",
      email: "ananya.roy@companya-noida.internal",
      role: "DELIVERY_HEAD",
      org: "Company A (Noida)",
      color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      icon: <BarChart3 className="h-4 w-4 text-amber-400" />,
      description: "Operational Analytics, SLA Compliance & Business Reporting",
      defaultRedirect: "/delivery/dashboard",
    },
    {
      label: "Client Hiring Manager",
      name: "Rajesh Kumar",
      email: "rajesh.kumar@fintechglobal.com",
      role: "CLIENT_HIRING_MGR",
      org: "FinTech Global",
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      icon: <Building2 className="h-4 w-4 text-emerald-400" />,
      description: "Candidate Shortlisting, Masked PII & Decision Portal",
      defaultRedirect: "/client",
    },
  ];

  const handleQuickFill = async (demoEmail: string, retryCount = 0) => {
    setEmail(demoEmail);
    setActivePersonaEmail(demoEmail);
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: demoEmail, isDemoQuickFill: true }),
      });

      const data = await res.json();

      // Handle serverless database compute cold start automatically
      if (res.status === 503 && retryCount < 2) {
        setIsRetryingColdStart(true);
        setError("Database compute is waking from sleep. Reconnecting automatically...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setIsRetryingColdStart(false);
        return handleQuickFill(demoEmail, retryCount + 1);
      }

      if (!res.ok || !data.success) {
        setError(data.error || "Demo authentication failed.");
        setLoading(false);
        setActivePersonaEmail(null);
        return;
      }

      const targetDestination = callbackUrl || data.data?.defaultRedirect || "/requisitions";
      router.push(targetDestination);
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
      setActivePersonaEmail(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent, retryCount = 0) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      // Handle serverless database compute cold start automatically
      if (res.status === 503 && retryCount < 2) {
        setIsRetryingColdStart(true);
        setError("Database compute is waking from sleep. Reconnecting automatically...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setIsRetryingColdStart(false);
        return handleSubmit(e, retryCount + 1);
      }

      if (!res.ok || !data.success) {
        setError(data.error || "Invalid email or password.");
        setLoading(false);
        return;
      }

      const targetDestination = callbackUrl || data.data?.defaultRedirect || "/requisitions";
      router.push(targetDestination);
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* Left Column: Brand Showcase & Value Props */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: cubicEase }}
          className="lg:col-span-5 space-y-6"
        >
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>TalentLens Enterprise v2.4</span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-[1.12]">
              AI Screening &amp; Recruitment Operations
            </h1>
            
            <p className="text-sm text-muted-foreground leading-relaxed">
              Automated high-volume resume parsing, grounded verbatim citations, deterministic weighted scorecards, and multi-tenant client review portals.
            </p>
          </div>

          {/* Key Platform Highlights */}
          <div className="space-y-3 pt-2">
            {[
              {
                title: "48-Hour SLA Guarantee",
                desc: "Real-time SLA tracking from job activation to first client shortlist.",
                icon: <Zap className="h-4 w-4 text-primary" />,
              },
              {
                title: "Grounded Evidence Quotations",
                desc: "100% verifiable candidate claims with verbatim resume offset citations.",
                icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
              },
              {
                title: "Strict Tenant Isolation & DPDP",
                desc: "Independent client workspaces with Section 12 erasure enforcement.",
                icon: <Shield className="h-4 w-4 text-amber-500" />,
              },
            ].map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + idx * 0.08, ease: cubicEase }}
                className="flex items-start gap-3 p-3 rounded-xl bg-card/60 border border-border/80 shadow-2xs hover:border-primary/40 transition-colors"
              >
                <div className="p-2 rounded-lg bg-background border border-border/70 flex-shrink-0 mt-0.5">
                  {feature.icon}
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-foreground">{feature.title}</div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">{feature.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Operational Cluster: Neon PostgreSQL Active</span>
          </div>
        </motion.div>

        {/* Right Column: Authentication Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: cubicEase }}
          className="lg:col-span-7"
        >
          <Card className="shadow-2xl border-border/80 bg-card/95 backdrop-blur-xl overflow-hidden relative">
            {/* Top accent line */}
            <div className="h-1 bg-gradient-to-r from-primary via-amber-500 to-primary/40" />
            
            <form onSubmit={handleSubmit}>
              <CardHeader className="space-y-1.5 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">
                      Sign in to Your Workspace
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Enter corporate credentials or select a verified evaluation persona below.
                    </CardDescription>
                  </div>
                  <ShinyBadge variant="primary" size="sm">
                    RBAC Protected
                  </ShinyBadge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`p-3 text-xs rounded-lg flex items-start gap-2 overflow-hidden border ${
                        isRetryingColdStart
                          ? "bg-primary/10 text-primary border-primary/25"
                          : "bg-destructive/10 text-destructive border-destructive/20"
                      }`}
                    >
                      {isRetryingColdStart ? (
                        <RefreshCw className="h-4 w-4 shrink-0 mt-0.5 animate-spin text-primary" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      )}
                      <span className="font-medium">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                    Corporate Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@organization.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-9 text-xs sm:text-sm h-10 bg-background/80 focus:ring-2 focus:ring-primary/20"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-semibold text-foreground">
                      Password
                    </Label>
                    <span className="text-[11px] text-muted-foreground font-mono">Workspace Credentials</span>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 text-xs sm:text-sm h-10 bg-background/80 focus:ring-2 focus:ring-primary/20"
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full text-xs sm:text-sm font-bold h-10 shadow-glow-primary bg-primary hover:bg-primary/90 text-primary-foreground gap-2 transition-all duration-200"
                  isLoading={loading && !activePersonaEmail}
                >
                  <span>Authenticate &amp; Enter Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>

              {/* Dedicated Company Evaluation Demo Personas */}
              <CardFooter className="flex flex-col space-y-3 pt-4 border-t border-white/[0.08] bg-white/[0.02]">
                <div className="w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Evaluation Demo Personas</span>
                  <span className="text-[10px] normal-case font-mono bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-primary font-medium">
                    1-Click Direct Access
                  </span>
                </div>

                <div className="w-full grid grid-cols-1 gap-2.5">
                  {demoAccounts.map((account) => {
                    const isSelected = email === account.email;
                    const isCardLoading = loading && activePersonaEmail === account.email;

                    return (
                      <button
                        key={account.email}
                        type="button"
                        onClick={() => handleQuickFill(account.email)}
                        disabled={loading}
                        className={`w-full text-left p-3 rounded-xl border transition-all duration-200 text-xs flex items-center justify-between group cursor-pointer disabled:opacity-70 ${
                          isSelected
                            ? "border-primary bg-primary/15 shadow-glow-primary"
                            : "border-white/[0.08] hover:border-primary/40 hover:bg-white/[0.04] bg-[#141b29]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-white/[0.05] border border-white/[0.08] flex-shrink-0">
                            {account.icon}
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                                {account.name}
                              </span>
                              <Badge variant="outline" className={`text-[9px] font-mono py-0 px-1.5 ${account.color}`}>
                                {account.role}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {account.description}
                            </div>
                            <div className="text-[10px] text-muted-foreground/80 font-mono">
                              {account.org} &bull; {account.email}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary shrink-0 pl-2">
                          {isCardLoading ? (
                            <span className="flex items-center gap-1.5 text-primary text-xs">
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>Authenticating...</span>
                            </span>
                          ) : isSelected ? (
                            <span className="flex items-center gap-1 text-primary font-bold text-xs bg-primary/15 px-2 py-1 rounded-md">
                              <Check className="h-3.5 w-3.5" />
                              Active
                            </span>
                          ) : (
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-muted-foreground group-hover:text-primary">
                              Enter &rarr;
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardFooter>
            </form>
          </Card>

          <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2 mt-4">
            <Shield className="h-3.5 w-3.5 text-emerald-500" />
            <span>Strict multi-tenant boundary, DPDP Section 12 &amp; SHA-256 session integrity</span>
          </div>
          <div className="text-center text-[11px] text-muted-foreground/80 mt-2">
            Dedicated evaluation personas access isolated, pre-seeded benchmarks without exposing production credentials.
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center relative overflow-hidden bg-background">
      {/* Aurora Ambient Background Effect */}
      <div className="pointer-events-none absolute inset-0 subtle-grid opacity-50" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-primary/12 via-indigo-500/8 to-transparent blur-3xl opacity-80"
        aria-hidden="true"
      />
      <div className="relative z-10 w-full">
        <Suspense fallback={<div className="text-sm text-center text-muted-foreground py-20">Loading authentication...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
