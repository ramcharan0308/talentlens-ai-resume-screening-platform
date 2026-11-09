"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScorecardBuilder } from "@/components/scorecard/scorecard-builder";
import { CreateRequisitionInput, ScorecardCriterionInput } from "@/types";
import { RequisitionStatus } from "@prisma/client";
import {
  Briefcase,
  MapPin,
  Clock,
  IndianRupee,
  Calendar,
  X,
  AlertCircle,
  Save,
  CheckCircle,
  ArrowLeft,
  Building2,
  Sliders,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface RequisitionFormProps {
  initialData?: Partial<CreateRequisitionInput> & { id?: string };
  isEdit?: boolean;
}

export function RequisitionForm({ initialData, isEdit = false }: RequisitionFormProps) {
  const router = useRouter();

  const [title, setTitle] = React.useState(initialData?.title || "");
  const [department, setDepartment] = React.useState(initialData?.department || "BFSI & Enterprise Platforms");
  const [location, setLocation] = React.useState(initialData?.location || "Noida, Uttar Pradesh (Hybrid)");
  const [minExperience, setMinExperience] = React.useState(
    initialData?.minExperienceYears !== undefined && initialData?.minExperienceYears !== null
      ? String(initialData.minExperienceYears)
      : "5"
  );
  const [maxExperience, setMaxExperience] = React.useState(
    initialData?.maxExperienceYears !== undefined && initialData?.maxExperienceYears !== null
      ? String(initialData.maxExperienceYears)
      : "8"
  );
  const [maxNoticeDays, setMaxNoticeDays] = React.useState(
    initialData?.maxNoticeDays !== undefined && initialData?.maxNoticeDays !== null
      ? String(initialData.maxNoticeDays)
      : "60"
  );
  const [targetSalary, setTargetSalary] = React.useState(
    initialData?.targetSalaryRange || "₹18,00,000 - ₹26,00,000 PA"
  );
  const [coreSkills, setCoreSkills] = React.useState<string[]>(
    initialData?.coreSkills || ["Java", "Spring Boot", "Microservices", "REST APIs", "PostgreSQL", "Kafka"]
  );
  const [skillInput, setSkillInput] = React.useState("");
  const [clientOrgId, setClientOrgId] = React.useState<string>(initialData?.clientOrganizationId || "");
  const [availableClients, setAvailableClients] = React.useState<Array<{ id: string; name: string }>>([]);

  React.useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      fetch("/api/clients")
        .then((res) => res.json())
        .then((json) => {
          if (isMounted && json.success && Array.isArray(json.data)) {
            setAvailableClients(json.data);
          }
        })
        .catch(() => {});
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const [jobDescription, setJobDescription] = React.useState(
    initialData?.jobDescription ||
      `Company A is seeking an experienced Senior Java Developer for our premier financial technology client in Noida.\n\nKey Responsibilities:\n• Design and build enterprise-grade microservices handling high-throughput financial transactions.\n• Implement scalable persistence architectures using PostgreSQL and Hibernate/JPA.\n• Configure resilient event-driven messaging with Apache Kafka.\n• Ensure full test automation using JUnit 5 and Mockito.`
  );

  const [criteria, setCriteria] = React.useState<ScorecardCriterionInput[]>(
    initialData?.scorecardCriteria || [
      {
        name: "Core Java & Concurrency Mastery",
        description: "Proficiency in Java 17+, JVM memory model, garbage collection, and multithreading.",
        weight: 25,
        isMustHave: true,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Basic syntax only; 5-7: Strong collections & concurrency; 8-10: Advanced async pipelines, JVM tuning.",
        orderIndex: 0,
      },
      {
        name: "Spring Boot & Microservices Architecture",
        description: "Hands-on experience developing RESTful microservices, Spring Security, and distributed patterns.",
        weight: 30,
        isMustHave: true,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Simple controllers; 5-7: Production Spring Boot, circuit breakers; 8-10: Saga patterns, zero-downtime deployment.",
        orderIndex: 1,
      },
      {
        name: "Database & Persistence (PostgreSQL)",
        description: "Relational modeling, indexing strategies, complex query tuning, and connection pooling.",
        weight: 20,
        isMustHave: false,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Basic CRUD; 5-7: Query tuning, index selection; 8-10: Execution plan profiling, partitioning.",
        orderIndex: 2,
      },
      {
        name: "Distributed Messaging & Event Streams (Kafka)",
        description: "Event-driven design, Kafka topic design, consumer groups, and message delivery guarantees.",
        weight: 15,
        isMustHave: false,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Basic producer/consumer; 5-7: Partitioning strategies; 8-10: Exactly-once semantics, Kafka Streams.",
        orderIndex: 3,
      },
      {
        name: "Engineering Practices & Test Automation",
        description: "Clean code principles, JUnit 5/Mockito testing, OpenAPI specs, and CI/CD pipelines.",
        weight: 10,
        isMustHave: false,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Minimal tests; 5-7: Thorough unit testing and API docs; 8-10: TDD, mutation testing, automated quality gates.",
        orderIndex: 4,
      },
    ]
  );

  const [activeTab, setActiveTab] = React.useState<"profile" | "scorecard">("profile");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const totalWeight = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

  const handleAddSkill = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = skillInput.trim();
      if (val && !coreSkills.includes(val)) {
        setCoreSkills([...coreSkills, val]);
        setSkillInput("");
      }
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setCoreSkills(coreSkills.filter((s) => s !== skillToRemove));
  };

  const handleSubmit = async (targetStatus: RequisitionStatus) => {
    setErrorMessage(null);

    // Basic frontend checks
    if (!title.trim()) {
      setErrorMessage("Job title is required.");
      setActiveTab("profile");
      return;
    }

    if (!jobDescription.trim()) {
      setErrorMessage("Job description is required.");
      setActiveTab("profile");
      return;
    }

    if (targetStatus === "ACTIVE" && totalWeight !== 100) {
      setErrorMessage(
        `Cannot activate requisition: scorecard criteria must sum to exactly 100% (currently ${totalWeight}%).`
      );
      setActiveTab("scorecard");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreateRequisitionInput = {
        title: title.trim(),
        department: department.trim() || undefined,
        location: location.trim() || undefined,
        minExperienceYears: minExperience ? parseFloat(minExperience) : null,
        maxExperienceYears: maxExperience ? parseFloat(maxExperience) : null,
        maxNoticeDays: maxNoticeDays ? parseInt(maxNoticeDays, 10) : null,
        targetSalaryRange: targetSalary.trim() || undefined,
        coreSkills,
        jobDescription: jobDescription.trim(),
        status: targetStatus,
        clientOrganizationId: clientOrgId ? clientOrgId : null,
        scorecardCriteria: criteria,
      };

      const url = isEdit
        ? `/api/requisitions/${initialData?.id}`
        : "/api/requisitions";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const errorMsg =
          data.message ||
          (data.errors && data.errors.map((e: { message: string }) => e.message).join("; ")) ||
          "Failed to save requisition.";
        setErrorMessage(errorMsg);
        setIsSubmitting(false);
        return;
      }

      // If editing, also save the updated scorecard criteria
      if (isEdit && initialData?.id) {
        const critRes = await fetch(`/api/requisitions/${initialData.id}/scorecard`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            criteria,
            enforceHundredPercent: targetStatus === "ACTIVE",
          }),
        });

        const critData = await critRes.json();
        if (!critRes.ok || !critData.success) {
          setErrorMessage(critData.message || "Saved role details, but criteria update failed.");
          setIsSubmitting(false);
          return;
        }
      }

      router.push(isEdit ? `/requisitions/${initialData?.id}` : `/requisitions/${data.data.id}`);
      router.refresh();
    } catch (err) {
      console.error("Submission failed:", err);
      setErrorMessage("Network error occurred while saving requisition.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/requisitions"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Requisitions</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {isEdit ? "Edit Requisition & Rubric" : "Create Staffing Requisition"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Configure job specifications, candidate compliance constraints, and AI scorecard evaluation rubrics.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-muted/70 rounded-xl border border-border/60 text-xs font-semibold self-start sm:self-auto shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`relative px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === "profile"
                ? "bg-card text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            1. Role & Requirements
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("scorecard")}
            className={`relative px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "scorecard"
                ? "bg-card text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>2. Scorecard Rubric</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                totalWeight === 100
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
              }`}
            >
              {totalWeight}%
            </span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tab 1: Profile & Requirements */}
      {activeTab === "profile" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="space-y-6"
        >
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                <span>Position Profile</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Title, business unit, and workplace parameters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-xs font-semibold">Job Title *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Java Developer"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="department" className="text-xs font-semibold">Department / Practice</Label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. BFSI & Enterprise Platforms"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="location" className="text-xs font-semibold flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span>Location & Workplace Model</span>
                  </Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Noida, Uttar Pradesh (Hybrid)"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="salary" className="text-xs font-semibold flex items-center gap-1">
                    <IndianRupee className="h-3 w-3 text-muted-foreground" />
                    <span>Target CTC / Salary Range</span>
                  </Label>
                  <Input
                    id="salary"
                    value={targetSalary}
                    onChange={(e) => setTargetSalary(e.target.value)}
                    placeholder="e.g. ₹18,00,000 - ₹26,00,000 PA"
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-3 border-t border-border/50">
                <Label htmlFor="clientOrg" className="text-xs font-semibold flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span>Client Organization Assignment</span>
                </Label>
                <select
                  id="clientOrg"
                  value={clientOrgId}
                  onChange={(e) => setClientOrgId(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">-- No Client Organization (Internal / Unassigned) --</option>
                  {availableClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Assigning a client organization allows hiring managers from that client to review submitted candidates in their portal.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Hiring Constraints & Experience */}
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span>Experience & Notice Period Constraints</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Hard filters used for automated resume compliance validation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="minExp" className="text-xs font-semibold">Min Experience (Years)</Label>
                  <Input
                    id="minExp"
                    type="number"
                    step="0.5"
                    min="0"
                    value={minExperience}
                    onChange={(e) => setMinExperience(e.target.value)}
                    placeholder="5.0"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="maxExp" className="text-xs font-semibold">Max Experience (Years)</Label>
                  <Input
                    id="maxExp"
                    type="number"
                    step="0.5"
                    min="0"
                    value={maxExperience}
                    onChange={(e) => setMaxExperience(e.target.value)}
                    placeholder="8.0"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="noticeDays" className="text-xs font-semibold flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span>Max Notice Period (Days)</span>
                  </Label>
                  <Input
                    id="noticeDays"
                    type="number"
                    min="0"
                    value={maxNoticeDays}
                    onChange={(e) => setMaxNoticeDays(e.target.value)}
                    placeholder="60"
                  />
                </div>
              </div>

              {/* Core Skills Tag Input */}
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-semibold">Core Skills & Tech Stack Tags</Label>
                <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/30 border border-border/70 rounded-lg min-h-[44px]">
                  {coreSkills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="text-xs gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-md"
                    >
                      <span>{skill}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(skill)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={handleAddSkill}
                    placeholder="Type skill & press Enter (e.g. Java, Kafka)"
                    className="flex-1 bg-transparent border-0 text-xs focus:outline-none min-w-[180px] p-1 placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Job Description Textarea */}
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Detailed Job Description *</CardTitle>
              <CardDescription className="text-xs">
                Full role summary, key responsibilities, qualifications, and domain expectations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={8}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Enter detailed job description, duties, and client context..."
                className="font-mono text-xs leading-relaxed"
              />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Tab 2: Scorecard Rubric Builder */}
      {activeTab === "scorecard" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <ScorecardBuilder criteria={criteria} onChange={setCriteria} />
        </motion.div>
      )}

      {/* Bottom Sticky Action Bar */}
      <div className="sticky bottom-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-card/90 backdrop-blur-md border border-border/80 rounded-xl shadow-lg">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Status after save:</span>
          {totalWeight === 100 ? (
            <Badge variant="success" className="text-xs font-semibold">
              Eligible for ACTIVE
            </Badge>
          ) : (
            <Badge variant="warning" className="text-xs font-semibold">
              Draft Only ({totalWeight}% Weight)
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {activeTab === "profile" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("scorecard")}
              className="text-xs flex-1 sm:flex-none"
            >
              Continue to Scorecard Rubric ➔
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("profile")}
              className="text-xs flex-1 sm:flex-none"
            >
              ⬅ Back to Requirements
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isSubmitting}
            onClick={() => handleSubmit(RequisitionStatus.DRAFT)}
            className="text-xs flex-1 sm:flex-none gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save as Draft</span>
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={isSubmitting}
            onClick={() => handleSubmit(RequisitionStatus.ACTIVE)}
            className="text-xs flex-1 sm:flex-none gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            <span>{isEdit ? "Update & Activate" : "Publish & Activate"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
