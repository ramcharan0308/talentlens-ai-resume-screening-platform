import {
  UserRole,
  OrganizationType,
  RequisitionStatus,
  CandidatePurgeStatus,
  DocumentProcessingStatus,
  BatchJobStatus,
  BatchItemStatus,
  ApplicationStatus,
  ConsentStatus,
  ConsentEvidenceType,
} from "@prisma/client";

import type {
  Requisition,
  ScorecardCriterion,
  Organization,
  User,
} from "@prisma/client";

export {
  UserRole,
  OrganizationType,
  RequisitionStatus,
  CandidatePurgeStatus,
  DocumentProcessingStatus,
  BatchJobStatus,
  BatchItemStatus,
  ApplicationStatus,
  ConsentStatus,
  ConsentEvidenceType,
};

export type {
  Requisition,
  ScorecardCriterion,
  Organization,
  User,
};

/**
 * Benchmark candidate data interface matching official IsoCode assignment fixtures
 */
export interface BenchmarkCandidateFixture {
  candidateReference: string;
  fullName: string;
  currentRole: string;
  experienceYears: number;
  keySkills: string[];
  noticeDays: number;
}

/**
 * Scorecard Criterion input for creation and updates
 */
export interface ScorecardCriterionInput {
  id?: string;
  name: string;
  description?: string;
  weight: number;
  isMustHave?: boolean;
  minScore?: number;
  maxScore?: number;
  guidelines?: string;
  orderIndex?: number;
}

/**
 * Requisition creation payload
 */
export interface CreateRequisitionInput {
  title: string;
  department?: string;
  location?: string;
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
  maxNoticeDays?: number | null;
  targetSalaryRange?: string;
  coreSkills?: string[];
  jobDescription: string;
  status?: RequisitionStatus;
  scorecardCriteria?: ScorecardCriterionInput[];
}

/**
 * Requisition update payload
 */
export interface UpdateRequisitionInput {
  title?: string;
  department?: string;
  location?: string;
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null;
  maxNoticeDays?: number | null;
  targetSalaryRange?: string;
  coreSkills?: string[];
  jobDescription?: string;
  status?: RequisitionStatus;
}

/**
 * Requisition with relation counts and full criteria
 */
export interface RequisitionDetail extends Requisition {
  createdBy: Pick<User, "id" | "name" | "email" | "role">;
  organization: Pick<Organization, "id" | "name" | "type">;
  scorecardCriteria: ScorecardCriterion[];
  _count?: {
    applications: number;
    batchJobs: number;
  };
}

/**
 * Requisition list item summary
 */
export interface RequisitionSummary extends Requisition {
  createdBy: Pick<User, "id" | "name">;
  _count: {
    scorecardCriteria: number;
    applications: number;
  };
}
