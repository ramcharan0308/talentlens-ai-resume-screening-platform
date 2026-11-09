"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScorecardCriterionInput } from "@/types";
import {
  Plus,
  Trash2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Sliders,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ScorecardBuilderProps {
  criteria: ScorecardCriterionInput[];
  onChange: (criteria: ScorecardCriterionInput[]) => void;
  readOnly?: boolean;
}

const BENCHMARK_TEMPLATES = {
  java: {
    label: "Senior Java Benchmark (Noida Profile)",
    criteria: [
      {
        name: "Core Java & Concurrency Mastery",
        description: "Proficiency in Java 17+, JVM memory model, garbage collection profiling, and concurrent data structures.",
        weight: 25,
        isMustHave: true,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Basic syntax only; 5-7: Strong collections & concurrency; 8-10: Expert low-latency, async pipelines, JVM tuning.",
      },
      {
        name: "Spring Boot & Microservices Architecture",
        description: "Hands-on experience developing RESTful microservices, Spring Security, and distributed patterns.",
        weight: 30,
        isMustHave: true,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Simple controllers; 5-7: Production Spring Boot, circuit breakers; 8-10: Saga patterns, zero-downtime deployment.",
      },
      {
        name: "Database & Persistence (PostgreSQL)",
        description: "Relational modeling, indexing strategies, complex join optimization, and connection pool management.",
        weight: 20,
        isMustHave: false,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Basic CRUD; 5-7: Query tuning, index selection; 8-10: Execution plan profiling, partitioning.",
      },
      {
        name: "Distributed Messaging & Event Streams (Kafka)",
        description: "Event-driven design, Kafka topic design, consumer rebalancing, and message delivery guarantees.",
        weight: 15,
        isMustHave: false,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Basic producer/consumer; 5-7: Partitioning strategies; 8-10: Exactly-once semantics, Kafka Streams.",
      },
      {
        name: "Engineering Practices & Test Automation",
        description: "Clean code principles, JUnit 5/Mockito testing, OpenAPI specs, and CI/CD pipelines.",
        weight: 10,
        isMustHave: false,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Minimal tests; 5-7: Thorough unit testing and API docs; 8-10: TDD, mutation testing, automated quality gates.",
      },
    ],
  },
  fullstack: {
    label: "Full Stack React & Node.js",
    criteria: [
      {
        name: "React 19 & Frontend Architecture",
        description: "Modern component architecture, Server Components, performance, and accessibility.",
        weight: 40,
        isMustHave: true,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Basic hooks; 5-7: Complex client state, custom hooks; 8-10: Streaming SSR, RSC, web vitals optimization.",
      },
      {
        name: "Node.js & Backend API Design",
        description: "TypeScript APIs, REST/GraphQL services, and asynchronous error handling.",
        weight: 35,
        isMustHave: true,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Basic Express; 5-7: Production TypeScript services; 8-10: High-throughput async architectures, schema federation.",
      },
      {
        name: "Cloud & DevOps (Docker / CI-CD)",
        description: "Containerization, cloud deployment, and automated testing pipelines.",
        weight: 25,
        isMustHave: false,
        minScore: 1,
        maxScore: 10,
        guidelines: "1-4: Basic Docker; 5-7: Multi-stage builds, cloud services; 8-10: Production cluster operations and observability.",
      },
    ],
  },
};

export function ScorecardBuilder({
  criteria,
  onChange,
  readOnly = false,
}: ScorecardBuilderProps) {
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);

  const totalWeight = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const isBalanced = totalWeight === 100;
  const isOver = totalWeight > 100;
  const isUnder = totalWeight < 100;

  const handleCriterionChange = (
    index: number,
    field: keyof ScorecardCriterionInput,
    value: unknown
  ) => {
    const updated = [...criteria];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    onChange(updated);
  };

  const handleAddCriterion = () => {
    const remainingWeight = Math.max(0, 100 - totalWeight);
    const newCriterion: ScorecardCriterionInput = {
      name: `Evaluation Criterion ${criteria.length + 1}`,
      description: "",
      weight: remainingWeight > 0 ? remainingWeight : 10,
      isMustHave: false,
      minScore: 1,
      maxScore: 10,
      guidelines: "",
      orderIndex: criteria.length,
    };
    onChange([...criteria, newCriterion]);
    setExpandedIndex(criteria.length);
  };

  const handleRemoveCriterion = (index: number) => {
    const updated = criteria.filter((_, i) => i !== index);
    onChange(updated);
    if (expandedIndex === index) {
      setExpandedIndex(null);
    }
  };

  const loadTemplate = (key: keyof typeof BENCHMARK_TEMPLATES) => {
    onChange(BENCHMARK_TEMPLATES[key].criteria);
    setExpandedIndex(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & Weight Meter Card */}
      <Card className="border-border/80 shadow-sm overflow-hidden">
        <CardHeader className="pb-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                <span>Weighted Evaluation Scorecard</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Define grading dimensions used by AI models and recruiters. Criteria weights must sum to exactly 100%.
              </CardDescription>
            </div>

            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => loadTemplate("java")}
                  className="text-xs h-8 gap-1.5 bg-muted/30 hover:bg-muted/60"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>Load Java Benchmark</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => loadTemplate("fullstack")}
                  className="text-xs h-8 gap-1.5 bg-muted/30 hover:bg-muted/60"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  <span>Load Full Stack</span>
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3.5">
          {/* Progress / Weight Gauge */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                {isBalanced && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                {isOver && <AlertCircle className="h-4 w-4 text-destructive" />}
                {isUnder && <AlertCircle className="h-4 w-4 text-amber-500" />}
                <span>
                  Total Weight: <strong className="font-mono">{totalWeight}%</strong> / 100%
                </span>
              </span>

              <span className="text-muted-foreground">
                {isBalanced && (
                  <Badge variant="success" className="text-[11px] py-0 px-2.5 font-semibold">
                    100% Balanced
                  </Badge>
                )}
                {isUnder && (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold font-mono">
                    +{100 - totalWeight}% remaining
                  </span>
                )}
                {isOver && (
                  <span className="text-destructive font-semibold font-mono">
                    -{totalWeight - 100}% over limit
                  </span>
                )}
              </span>
            </div>

            {/* Visual Bar */}
            <div className="h-2.5 w-full bg-muted/60 rounded-full overflow-hidden flex shadow-inner">
              <motion.div
                className={`h-full transition-colors duration-300 ${
                  isBalanced
                    ? "bg-emerald-500"
                    : isOver
                    ? "bg-destructive"
                    : "bg-amber-500"
                }`}
                initial={false}
                animate={{ width: `${Math.min(100, totalWeight)}%` }}
                transition={{ duration: 0.25 }}
              />
            </div>
          </div>

          {criteria.length === 0 && (
            <div className="text-center py-8 border border-dashed rounded-xl bg-muted/20 text-xs text-muted-foreground">
              No evaluation criteria added yet. Click &quot;Add Custom Evaluation Criterion&quot; or choose a template above.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criteria List */}
      <div className="space-y-3">
        {criteria.map((criterion, index) => {
          const isExpanded = expandedIndex === index;

          return (
            <Card
              key={index}
              className={`border transition-all duration-200 overflow-hidden ${
                criterion.isMustHave
                  ? "border-amber-500/40 bg-amber-500/[0.02]"
                  : "border-border/80 bg-card"
              }`}
            >
              <div className="p-4 space-y-3">
                {/* Collapsed / Row Summary View */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-[11px] font-bold text-muted-foreground border border-border/40">
                      {index + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      {readOnly ? (
                        <span className="font-semibold text-sm truncate block">
                          {criterion.name}
                        </span>
                      ) : (
                        <Input
                          value={criterion.name}
                          onChange={(e) =>
                            handleCriterionChange(index, "name", e.target.value)
                          }
                          placeholder="Criterion Name (e.g. Core Java & Spring Boot)"
                          className="font-medium text-sm h-8"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Must-Have Badge or Toggle */}
                    {readOnly ? (
                      criterion.isMustHave && (
                        <Badge variant="warning" className="text-[11px] gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          <span>Must-Have Gate</span>
                        </Badge>
                      )
                    ) : (
                      <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
                        <input
                          type="checkbox"
                          checked={criterion.isMustHave || false}
                          onChange={(e) =>
                            handleCriterionChange(index, "isMustHave", e.target.checked)
                          }
                          className="rounded border-input text-primary h-3.5 w-3.5 focus:ring-primary"
                        />
                        <span className="font-medium">Must-Have Gate</span>
                      </label>
                    )}

                    {/* Weight Input */}
                    <div className="flex items-center gap-1">
                      {readOnly ? (
                        <Badge variant="outline" className="font-mono text-xs font-semibold">
                          {criterion.weight}% Weight
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={criterion.weight}
                            onChange={(e) =>
                              handleCriterionChange(
                                index,
                                "weight",
                                Math.max(0, parseInt(e.target.value, 10) || 0)
                              )
                            }
                            className="w-16 h-8 text-right font-mono text-xs"
                          />
                          <span className="text-xs font-semibold text-muted-foreground">%</span>
                        </div>
                      )}
                    </div>

                    {/* Expand/Collapse Guidelines */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedIndex(isExpanded ? null : index)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>

                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveCriterion(index)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded Details: Description & Scoring Rubric */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.16 }}
                      className="pt-3 border-t border-border/60 space-y-3 text-xs"
                    >
                      <div>
                        <Label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                          Evaluation Description
                        </Label>
                        {readOnly ? (
                          <p className="text-foreground/90">
                            {criterion.description || "No description provided."}
                          </p>
                        ) : (
                          <Input
                            value={criterion.description || ""}
                            onChange={(e) =>
                              handleCriterionChange(index, "description", e.target.value)
                            }
                            placeholder="What specific skills or competencies are being assessed?"
                            className="h-8 text-xs"
                          />
                        )}
                      </div>

                      <div>
                        <Label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                          Scoring Rubric & Guidelines (Scale: 1 to 10)
                        </Label>
                        {readOnly ? (
                          <div className="bg-muted/40 p-2.5 rounded-lg font-mono text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                            {criterion.guidelines || "No specific guidelines specified."}
                          </div>
                        ) : (
                          <Textarea
                            value={criterion.guidelines || ""}
                            onChange={(e) =>
                              handleCriterionChange(index, "guidelines", e.target.value)
                            }
                            placeholder="e.g. 1-4: Basic syntax only; 5-7: Strong collections & concurrency; 8-10: Expert low-latency, async pipelines, JVM tuning."
                            className="text-xs font-mono min-h-[60px]"
                          />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add Criterion Button */}
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          onClick={handleAddCriterion}
          className="w-full border-dashed h-9 text-xs gap-1.5 hover:bg-muted/40"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Custom Evaluation Criterion</span>
        </Button>
      )}
    </div>
  );
}
