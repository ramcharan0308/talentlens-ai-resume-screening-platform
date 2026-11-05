# TalentLens — AI Resume Screening & Client Shortlist Portal

TalentLens is an enterprise recruitment intelligence platform designed for staffing firms (specifically modeled around **Company A, Noida**: 300 requisitions/month, 120 CVs per job). The system automates bulk resume ingestion, anti-bias demographic sanitization, structured evidence-based scoring against job descriptions, and multi-tenant client shortlist review.

---

## 1. Technology Stack

* **Fullstack Framework**: Next.js 16.4.5 (App Router, Turbopack, React 19.2)
* **Language**: TypeScript with strict mode enabled
* **Styling**: Tailwind CSS + shadcn/ui design tokens
* **Database & ORM**: PostgreSQL + Prisma ORM (v5.22.0)
* **Architecture**: Stateless RBAC-ready structure, append-only audit logging, DPDP Act 2023 principles

---

## 2. Milestone 1 Scope: Architecture & Database Foundation

This repository currently implements **Milestone 1**:
- [x] Initialized Next.js App Router application with strict TypeScript.
- [x] Configured Tailwind CSS and shadcn/ui base design system.
- [x] Established scalable directory layout (`src/app`, `src/components/ui`, `src/lib`, `src/types`, `prisma`).
- [x] Authored and validated complete initial Prisma schema with 8 essential entities, custom enums, relations, and indexes.
- [x] Generated type-safe Prisma Client (`@prisma/client`).
- [x] Created environment configuration template (`.env.example`) with security-conscious placeholders.
- [x] Created useful `.gitignore` strictly excluding environment secrets, build artifacts, and local uploads.
- [x] Added minimal application shell and dashboard overview.

### Explicitly Out of Scope for Milestone 1 (Planned for Subsequent Milestones)
* User authentication and session flows (Auth.js / NextAuth v5).
* Resume file upload processing and text parsers (`pdf-parse`, `mammoth`).
* OCR fallback execution (`tesseract.js`).
* AI scoring with Google Gemini 3.8 Flash.
* Client review portal interactions (Shortlist/Reject/Interview scheduling).
* Background worker execution and chunked batch queues.

---

## 3. Database Schema Overview

The initial schema (`prisma/schema.prisma`) models the following core entities:

| Model | Purpose & Relationships | Key Constraints & Indexes |
| :--- | :--- | :--- |
| **`Organization`** | Represents staffing agencies and corporate clients. | Indexed on `type` (`AGENCY` \| `CLIENT`). |
| **`User`** | System actors (`RECRUITER`, `CLIENT_HIRING_MGR`, `DELIVERY_HEAD`). | `email` unique; indexed on `[organizationId, role]`. |
| **`Requisition`** | Job openings created by agency users. | Scoped to `Organization`; indexed on `[organizationId, status]`. |
| **`Candidate`** | Agency-owned candidate vault with DPDP purge tracking. | `candidateReference` unique; foreign key `agencyId` (scoped to `AGENCY`); indexed on `[agencyId]`, `purgeStatus`. |
| **`UploadedDocument`**| Reusable, agency-scoped parsed documents decoupled from specific requisitions. | Agency-scoped deduplication `@@unique([agencyId, fileHash])`; indexed on `[agencyId]`, `[candidateId]`, `[fileHash]`, `[processingStatus]`. |
| **`BatchUploadJob`** | Tracks batch submission counters and lifecycle with explicit agency scoping and status. | Scoped to `Organization` (`agencyId`) and `Requisition` (`requisitionId`); indexed on `[agencyId]`, `[requisitionId]`, `[status]`. |
| **`BatchFileItem`** | Individual submitted files within a batch, referencing reusable documents. | Network retry idempotency `@@unique([batchJobId, idempotencyKey])`; payload mismatch protection (`payloadHash`); indexed on `[batchJobId, status]`. |
| **`Application`** | Candidacy for a specific requisition. | Unique composite constraint `@@unique([candidateId, requisitionId])`. |
| **`ConsentRecord`** | Agency-scoped DPDP candidate consent. | Indexed on `[candidateId, agencyId, status]`. |
| **`AuditLog`** | Event audit log with append-only database policy. | Indexed on `[entityType, entityId]`, `[organizationId, createdAt]`. |

> **Audit Policy Note**: "Append-only" is an application and database security invariant, not an inherent property of the Prisma ORM. In production, this is enforced at the PostgreSQL database privilege layer via:
> ```sql
> REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "AuditLog" FROM talentlens_runtime;
> GRANT SELECT, INSERT ON TABLE "AuditLog" TO talentlens_runtime;
> ```
> Direct personal identifiers (name, email, phone, CV text) are never stored in `AuditLog`; only pseudonymous references (`candidateReference`, actorId) are preserved.

---

## 4. Local Setup Instructions

### Prerequisites
* **Node.js**: v18.18+ or v20+ (`node -v`)
* **npm**: v9+ (`npm -v`)
* **PostgreSQL**: A running instance (local PostgreSQL or serverless provider like Neon / Supabase)

### Step-by-Step Installation

1. **Clone the repository and enter the directory**:
   ```bash
   cd IsoCode_SE
   ```

2. **Install project dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment template to `.env`:
   ```bash
   copy .env.example .env    # Windows Command Prompt / PowerShell
   # or cp .env.example .env # macOS / Linux
   ```
   Edit `.env` to configure your PostgreSQL connection string:
   ```env
   DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/talentlens?schema=public"
   ```

4. **Validate Schema & Generate Prisma Client**:
   ```bash
   npm run prisma:validate
   npm run prisma:generate
   ```

5. **Apply Database Migrations (requires active PostgreSQL instance)**:
   ```bash
   npx prisma migrate dev --name init
   ```
   *(Note: If a PostgreSQL database is not running locally, the application can still build and run using pre-generated Prisma client types; see Migration Status below).*

6. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. Available Scripts

* `npm run dev` — Launches the Next.js development server with hot-reloading.
* `npm run build` — Compiles an optimized production build.
* `npm run start` — Starts the production server.
* `npm run lint` — Runs ESLint code style and syntax checks.
* `npm run prisma:validate` — Validates the `prisma/schema.prisma` file.
* `npm run prisma:generate` — Regenerates the TypeScript `@prisma/client` library.

---

## 6. Security & Privacy Notes

* **No Secrets in Version Control**: `.env` is explicitly ignored in `.gitignore`. Only `.env.example` containing placeholder variable names is tracked.
* **No Demographic Data for AI**: The database schema strictly excludes demographic variables (gender, age, marital status, religion, caste) to ensure compliance with anti-bias guidelines.
* **DPDP Act 2023 Principles**: The schema models consent scope, purge request timestamps, and audit records with pseudonymous references (`candidateReference`).
