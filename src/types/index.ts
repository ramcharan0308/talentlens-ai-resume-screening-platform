import type {
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

export type {
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
