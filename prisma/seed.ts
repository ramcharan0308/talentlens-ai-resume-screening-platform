import { PrismaClient, OrganizationType, UserRole, RequisitionStatus, ApplicationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding TalentLens database...");

  // 1. Pre-flight Demo Account Check
  const demoUsersConfig = [
    {
      email: "priya.sharma@companya-noida.internal",
      name: "Priya Sharma",
      role: UserRole.RECRUITER,
      organizationId: "00000000-0000-0000-0000-000000000001",
    },
    {
      email: "ananya.roy@companya-noida.internal",
      name: "Ananya Roy",
      role: UserRole.DELIVERY_HEAD,
      organizationId: "00000000-0000-0000-0000-000000000001",
    },
    {
      email: "rajesh.kumar@fintechglobal.com",
      name: "Rajesh Kumar",
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: "00000000-0000-0000-0000-000000000002",
    },
  ];

  const explicitResetRequested = process.env.RESET_DEMO_PASSWORDS === "true";
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: demoUsersConfig.map((u) => u.email) } },
  });

  const existingEmailSet = new Set(
    existingUsers.filter((u) => u.passwordHash !== null).map((u) => u.email)
  );
  const uninitializedUsers = demoUsersConfig.filter((u) => !existingEmailSet.has(u.email));
  const requiresPasswordHash = uninitializedUsers.length > 0 || explicitResetRequested;

  let newPasswordHash: string | undefined = undefined;

  if (requiresPasswordHash) {
    const rawDemoPassword = process.env.DEMO_USER_PASSWORD;
    if (!rawDemoPassword || rawDemoPassword.trim().length === 0) {
      throw new Error(
        "DEMO_USER_PASSWORD environment variable is required to create demo user accounts. Pre-flight check failed before modifying database records."
      );
    }
    newPasswordHash = await bcrypt.hash(rawDemoPassword, 12);
  }

  // 1. Agency Organization
  const agency = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Company A Staffing Services (Noida)",
      type: OrganizationType.AGENCY,
    },
  });

  // 2. Client Organization
  const clientOrg = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {
      agencyId: agency.id,
    },
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "FinTech Global Technologies",
      type: OrganizationType.CLIENT,
      agencyId: agency.id,
    },
  });

  // 3. Recruiter User (Preserve existing password unless explicit reset requested)
  const recruiter = await prisma.user.upsert({
    where: { email: "priya.sharma@companya-noida.internal" },
    update: {
      name: "Priya Sharma",
      role: UserRole.RECRUITER,
      organizationId: agency.id,
      isActive: true,
      ...(explicitResetRequested && newPasswordHash ? { passwordHash: newPasswordHash } : {}),
    },
    create: {
      name: "Priya Sharma",
      email: "priya.sharma@companya-noida.internal",
      passwordHash: newPasswordHash || null,
      role: UserRole.RECRUITER,
      organizationId: agency.id,
      isActive: true,
    },
  });

  // 4. Delivery Head User
  await prisma.user.upsert({
    where: { email: "ananya.roy@companya-noida.internal" },
    update: {
      name: "Ananya Roy",
      role: UserRole.DELIVERY_HEAD,
      organizationId: agency.id,
      isActive: true,
      ...(explicitResetRequested && newPasswordHash ? { passwordHash: newPasswordHash } : {}),
    },
    create: {
      name: "Ananya Roy",
      email: "ananya.roy@companya-noida.internal",
      passwordHash: newPasswordHash || null,
      role: UserRole.DELIVERY_HEAD,
      organizationId: agency.id,
      isActive: true,
    },
  });

  // 5. Client Hiring Manager
  await prisma.user.upsert({
    where: { email: "rajesh.kumar@fintechglobal.com" },
    update: {
      name: "Rajesh Kumar",
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientOrg.id,
      isActive: true,
      ...(explicitResetRequested && newPasswordHash ? { passwordHash: newPasswordHash } : {}),
    },
    create: {
      name: "Rajesh Kumar",
      email: "rajesh.kumar@fintechglobal.com",
      passwordHash: newPasswordHash || null,
      role: UserRole.CLIENT_HIRING_MGR,
      organizationId: clientOrg.id,
      isActive: true,
    },
  });

  // 6. Benchmark Requisition: REQ-2026-JAVA01 (Active)
  const existingBenchmark = await prisma.requisition.findFirst({
    where: { title: "Senior Java Developer", organizationId: agency.id },
  });

  let benchmarkId = existingBenchmark?.id;

  if (existingBenchmark && !existingBenchmark.clientOrganizationId) {
    await prisma.requisition.update({
      where: { id: existingBenchmark.id },
      data: { clientOrganizationId: clientOrg.id },
    });
  }

  if (!existingBenchmark) {
    const createdBenchmark = await prisma.requisition.create({
      data: {
        title: "Senior Java Developer",
        department: "BFSI & Enterprise Platforms",
        location: "Noida, Uttar Pradesh (Hybrid)",
        minExperienceYears: 5.0,
        maxExperienceYears: 8.0,
        maxNoticeDays: 60,
        targetSalaryRange: "₹18,00,000 - ₹26,00,000 PA",
        coreSkills: ["Java", "Spring Boot", "Microservices", "REST APIs", "PostgreSQL", "Kafka"],
        jobDescription: `Company A is seeking an experienced Senior Java Developer for our premier financial technology client in Noida.

Key Responsibilities:
• Design and build enterprise-grade microservices handling high-throughput financial transactions with low latency.
• Implement scalable persistence architectures using PostgreSQL and Hibernate/JPA with query optimization.
• Configure resilient event-driven messaging with Apache Kafka, consumer groups, and dead-letter queues.
• Ensure full test automation (unit, integration, contract) using JUnit 5 and Mockito with >85% code coverage.
• Participate in Agile sprints, peer code reviews, and production troubleshooting.`,
        status: RequisitionStatus.ACTIVE,
        organizationId: agency.id,
        clientOrganizationId: clientOrg.id,
        createdById: recruiter.id,
        scorecardCriteria: {
          create: [
            {
              name: "Core Java & Concurrency Mastery",
              description: "Proficiency in Java 17+, JVM memory model, garbage collection profiling, and concurrent data structures.",
              weight: 25,
              isMustHave: true,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Basic syntax only; 5-7: Solid collections, multithreading & lock management; 8-10: Advanced async pipelines, lock-free structures, JVM profiling.",
              orderIndex: 0,
            },
            {
              name: "Spring Boot & Microservices Architecture",
              description: "Hands-on experience developing RESTful microservices, Spring Security, and distributed patterns.",
              weight: 30,
              isMustHave: true,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Basic MVC controllers; 5-7: Production Spring Boot, configuration server, circuit breakers; 8-10: Distributed Saga patterns, zero-downtime canary deployment.",
              orderIndex: 1,
            },
            {
              name: "Database & Persistence (PostgreSQL)",
              description: "Relational modeling, indexing strategies, complex join optimization, and connection pool management.",
              weight: 20,
              isMustHave: false,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Basic CRUD and simple JPA; 5-7: Query tuning, index selection, transaction isolation; 8-10: Execution plan profiling, partitioning, schema migrations.",
              orderIndex: 2,
            },
            {
              name: "Distributed Messaging & Event Streams (Kafka)",
              description: "Event-driven design, Kafka topic design, consumer rebalancing, and message delivery guarantees.",
              weight: 15,
              isMustHave: false,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Basic producer/consumer; 5-7: Partitioning strategies, consumer group rebalancing; 8-10: Exactly-once semantics, Kafka Streams, lag remediation.",
              orderIndex: 3,
            },
            {
              name: "Engineering Practices & Test Automation",
              description: "Clean code principles, JUnit 5/Mockito testing, OpenAPI specs, and CI/CD pipelines.",
              weight: 10,
              isMustHave: false,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Minimal tests; 5-7: Thorough unit/mock testing and API docs; 8-10: TDD, mutation testing, automated quality gates.",
              orderIndex: 4,
            },
          ],
        },
      },
    });
    benchmarkId = createdBenchmark.id;
  }

  // 7. Draft Requisition
  const existingDraft = await prisma.requisition.findFirst({
    where: { title: "Full Stack React & Node.js Lead", organizationId: agency.id },
  });

  if (!existingDraft) {
    await prisma.requisition.create({
      data: {
        title: "Full Stack React & Node.js Lead",
        department: "Digital Consumer Platforms",
        location: "Noida, Uttar Pradesh (Onsite)",
        minExperienceYears: 6.0,
        maxExperienceYears: 10.0,
        maxNoticeDays: 45,
        targetSalaryRange: "₹22,00,000 - ₹32,00,000 PA",
        coreSkills: ["React", "TypeScript", "Node.js", "Next.js", "GraphQL", "AWS"],
        jobDescription: `Leading the frontend and API gateway modernization for retail banking applications.
Requires deep modern React 19 architecture, Server Components, TypeScript strictness, and GraphQL federation.`,
        status: RequisitionStatus.DRAFT,
        organizationId: agency.id,
        createdById: recruiter.id,
        scorecardCriteria: {
          create: [
            {
              name: "Modern React & State Management",
              description: "Expertise in React 18/19, Server Components, and client state orchestration.",
              weight: 40,
              isMustHave: true,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Basic hooks; 5-7: Custom hooks, memoization, state architecture; 8-10: RSC, streaming SSR, bundle optimization.",
              orderIndex: 0,
            },
            {
              name: "Node.js & Backend API Design",
              description: "Fastify/Express, TypeScript backend services, and GraphQL schemas.",
              weight: 35,
              isMustHave: true,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Basic endpoints; 5-7: High performance async I/O, middleware; 8-10: Event loop profiling, clustering, schema federation.",
              orderIndex: 1,
            },
            {
              name: "Cloud & DevOps (AWS / Docker)",
              description: "Containerization, ECS/EKS deployments, and cloud infrastructure.",
              weight: 25,
              isMustHave: false,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Basic Docker; 5-7: Multi-stage builds, ECS/Terraform; 8-10: Production Kubernetes and observability.",
              orderIndex: 2,
            },
          ],
        },
      },
    });
  }

  // 8. Filled Requisition
  const existingFilled = await prisma.requisition.findFirst({
    where: { title: "Senior DevOps & Cloud Engineer", organizationId: agency.id },
  });

  if (!existingFilled) {
    await prisma.requisition.create({
      data: {
        title: "Senior DevOps & Cloud Engineer",
        department: "Cloud Infrastructure",
        location: "Noida, Uttar Pradesh (Hybrid)",
        minExperienceYears: 4.0,
        maxExperienceYears: 7.0,
        maxNoticeDays: 30,
        targetSalaryRange: "₹16,00,000 - ₹24,00,000 PA",
        coreSkills: ["Kubernetes", "Docker", "Terraform", "AWS", "GitHub Actions"],
        jobDescription: `Manage infrastructure as code and automated deployment pipelines across multi-region AWS environments.`,
        status: RequisitionStatus.FILLED,
        organizationId: agency.id,
        createdById: recruiter.id,
        scorecardCriteria: {
          create: [
            {
              name: "Kubernetes & Container Orchestration",
              description: "Cluster configuration, Helm charts, ingress controllers, and auto-scaling.",
              weight: 40,
              isMustHave: true,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Pod deployment; 5-7: Helm, HPA, ingress; 8-10: Service mesh, cluster security, GitOps.",
              orderIndex: 0,
            },
            {
              name: "Infrastructure as Code (Terraform)",
              description: "Reusable modules, remote state management, and drift remediation.",
              weight: 35,
              isMustHave: true,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Simple resources; 5-7: Modules, state locks; 8-10: Multi-account landing zones, policy as code.",
              orderIndex: 1,
            },
            {
              name: "CI/CD & Observability",
              description: "GitHub Actions, Prometheus/Grafana, and alerting rules.",
              weight: 25,
              isMustHave: false,
              minScore: 1,
              maxScore: 10,
              guidelines: "1-4: Basic scripts; 5-7: Parallel build pipelines, dashboards; 8-10: SLO/SLI tracking, automated rollback.",
              orderIndex: 2,
            },
          ],
        },
      },
    });
  }

  // 9. Benchmark Candidate Fixtures (Idempotent)
  const candidateFixtures = [
    {
      candidateReference: "CND-91022",
      fullName: "Ritika Bansal",
      currentRole: "Senior Java Developer",
      experienceYears: 6.5,
      keySkills: ["Java", "Spring Boot", "microservices"],
      noticeDays: 60,
      linkToBenchmark: true,
    },
    {
      candidateReference: "CND-91047",
      fullName: "Arjun Rawat",
      currentRole: "KYC Analyst",
      experienceYears: 3.0,
      keySkills: ["KYC", "AML checks", "Excel"],
      noticeDays: 30,
      linkToBenchmark: false, // Invariant: Do not link Arjun to Senior Java Developer requisition
    },
    {
      candidateReference: "CND-91088",
      fullName: "Pooja Nair",
      currentRole: "Java Developer",
      experienceYears: 4.0,
      keySkills: ["Java", "Hibernate", "REST APIs"],
      noticeDays: 90,
      linkToBenchmark: true,
    },
  ];

  for (const fixture of candidateFixtures) {
    const candidate = await prisma.candidate.upsert({
      where: { candidateReference: fixture.candidateReference },
      update: {
        fullName: fixture.fullName,
        currentRole: fixture.currentRole,
        experienceYears: fixture.experienceYears,
        keySkills: fixture.keySkills,
        noticeDays: fixture.noticeDays,
        isFixture: true,
      },
      create: {
        candidateReference: fixture.candidateReference,
        agencyId: agency.id,
        fullName: fixture.fullName,
        currentRole: fixture.currentRole,
        experienceYears: fixture.experienceYears,
        keySkills: fixture.keySkills,
        noticeDays: fixture.noticeDays,
        isFixture: true,
      },
    });

    if (fixture.linkToBenchmark && benchmarkId) {
      await prisma.application.upsert({
        where: {
          candidateId_requisitionId: {
            candidateId: candidate.id,
            requisitionId: benchmarkId,
          },
        },
        update: {},
        create: {
          candidateId: candidate.id,
          requisitionId: benchmarkId,
          status: ApplicationStatus.SOURCED,
        },
      });
    }
  }

  console.log("Database seeded successfully with benchmark data and candidate fixtures!");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

