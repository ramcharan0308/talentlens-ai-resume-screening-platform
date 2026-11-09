import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRequisitionInput,
  validateScorecardCriteria,
} from "../src/lib/validations/requisition";
import { RequisitionStatus } from "@prisma/client";

test("Requisition Validation: Valid requisition payload passes", () => {
  const result = validateRequisitionInput({
    title: "Senior Java Developer",
    jobDescription: "Detailed enterprise Java developer role requiring 5+ years experience.",
    minExperienceYears: 5,
    maxExperienceYears: 8,
    maxNoticeDays: 60,
    status: RequisitionStatus.ACTIVE,
  });

  assert.equal(result.isValid, true);
  assert.equal(result.errors.length, 0);
});

test("Requisition Validation: Rejects short title or short description", () => {
  const result = validateRequisitionInput({
    title: "J",
    jobDescription: "Short",
  });

  assert.equal(result.isValid, false);
  assert.equal(result.errors.some((e) => e.field === "title"), true);
  assert.equal(result.errors.some((e) => e.field === "jobDescription"), true);
});

test("Requisition Validation: Rejects minExperience > maxExperience", () => {
  const result = validateRequisitionInput({
    title: "Senior Lead",
    jobDescription: "Requires 10 to 5 years experience.",
    minExperienceYears: 10,
    maxExperienceYears: 5,
  });

  assert.equal(result.isValid, false);
  assert.equal(
    result.errors.some((e) => e.field === "maxExperienceYears"),
    true
  );
});

test("Scorecard Validation: Accepts criteria summing to exactly 100%", () => {
  const criteria = [
    { name: "Core Java", weight: 40, isMustHave: true, minScore: 1, maxScore: 10 },
    { name: "Spring Boot", weight: 35, isMustHave: true, minScore: 1, maxScore: 10 },
    { name: "PostgreSQL", weight: 25, isMustHave: false, minScore: 1, maxScore: 10 },
  ];

  const result = validateScorecardCriteria(criteria, true);
  assert.equal(result.isValid, true);
  assert.equal(result.errors.length, 0);
});

test("Scorecard Validation: Rejects criteria sum not equaling 100%", () => {
  const criteria = [
    { name: "Core Java", weight: 40 },
    { name: "Spring Boot", weight: 30 }, // Sums to 70%
  ];

  const result = validateScorecardCriteria(criteria, true);
  assert.equal(result.isValid, false);
  assert.equal(
    result.errors.some((e) => e.field === "scorecardCriteriaTotalWeight"),
    true
  );
  assert.match(result.errors[0].message, /100%/);
});

test("Scorecard Validation: Rejects negative weight or invalid bounds", () => {
  const criteria = [
    { name: "Negative Weight", weight: -10 },
    { name: "Valid Criterion", weight: 110 },
  ];

  const result = validateScorecardCriteria(criteria, false);
  assert.equal(result.isValid, false);
  assert.equal(
    result.errors.some((e) => e.field.includes("weight")),
    true
  );
});

test("Scorecard Validation: Rejects minScore >= maxScore", () => {
  const criteria = [
    { name: "Inverted Score Range", weight: 100, minScore: 10, maxScore: 5 },
  ];

  const result = validateScorecardCriteria(criteria, false);
  assert.equal(result.isValid, false);
  assert.equal(
    result.errors.some((e) => e.field.includes("maxScore")),
    true
  );
});

