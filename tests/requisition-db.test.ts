import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, RequisitionStatus } from "@prisma/client";

const prisma = new PrismaClient();

test("Database Integration: Verify seeded requisitions and criteria", async () => {
  const requisitions = await prisma.requisition.findMany({
    include: {
      scorecardCriteria: true,
      createdBy: true,
    },
  });

  assert.ok(requisitions.length >= 3, "Expected at least 3 seeded requisitions");

  // Check Benchmark Requisition
  const benchmark = requisitions.find((r) => r.title === "Senior Java Developer");
  assert.ok(benchmark, "Benchmark Java requisition must exist");
  assert.equal(benchmark.status, RequisitionStatus.ACTIVE);
  assert.equal(benchmark.location, "Noida, Uttar Pradesh (Hybrid)");
  assert.equal(benchmark.minExperienceYears, 5);
  assert.equal(benchmark.maxExperienceYears, 8);
  assert.equal(benchmark.maxNoticeDays, 60);
  assert.ok(benchmark.coreSkills.includes("Java"));
  assert.ok(benchmark.coreSkills.includes("Spring Boot"));

  // Check 100% Scorecard Criteria Weight
  const totalWeight = benchmark.scorecardCriteria.reduce((sum, c) => sum + c.weight, 0);
  assert.equal(totalWeight, 100, "Active requisition scorecard criteria must total 100%");
  assert.ok(benchmark.scorecardCriteria.some((c) => c.isMustHave), "Must have criteria should be marked");
});

test("Database Invariant: Cascading deletion cleans up scorecard criteria", async () => {
  // Create a temporary test requisition
  const agency = await prisma.organization.findFirst({ where: { type: "AGENCY" } });
  const recruiter = await prisma.user.findFirst({ where: { role: "RECRUITER" } });

  assert.ok(agency && recruiter);

  const testReq = await prisma.requisition.create({
    data: {
      title: "Temp Test Requisition for Cascade",
      jobDescription: "Temporary requisition to verify cascade deletion of criteria.",
      organizationId: agency.id,
      createdById: recruiter.id,
      scorecardCriteria: {
        create: [
          { name: "Criterion A", weight: 50 },
          { name: "Criterion B", weight: 50 },
        ],
      },
    },
  });

  const criteriaBefore = await prisma.scorecardCriterion.findMany({
    where: { requisitionId: testReq.id },
  });
  assert.equal(criteriaBefore.length, 2);

  // Delete requisition
  await prisma.requisition.delete({ where: { id: testReq.id } });

  // Criteria must be automatically cascade deleted
  const criteriaAfter = await prisma.scorecardCriterion.findMany({
    where: { requisitionId: testReq.id },
  });
  assert.equal(criteriaAfter.length, 0);
});

test.after(async () => {
  await prisma.$disconnect();
});
