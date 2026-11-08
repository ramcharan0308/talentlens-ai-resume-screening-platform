import { AuthenticatedUser } from "@/lib/auth";
import { UserRole, OrganizationType, ApplicationStatus } from "@prisma/client";

/**
 * Statuses where a candidate is explicitly submitted to a client organization
 * and visible to CLIENT_HIRING_MGR.
 */
export const CLIENT_VISIBLE_APPLICATION_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED_TO_CLIENT,
  ApplicationStatus.CLIENT_SHORTLISTED,
  ApplicationStatus.CLIENT_REJECTED,
  ApplicationStatus.INTERVIEW_PROPOSED,
  ApplicationStatus.INTERVIEW_SCHEDULED,
  ApplicationStatus.INTERVIEW_COMPLETED,
  ApplicationStatus.OFFERED,
  ApplicationStatus.JOINED,
];

/**
 * Centralized Role-Based Access Control and Multi-Tenant Permission Engine.
 */
export class Permissions {
  /**
   * RECRUITER or DELIVERY_HEAD of the owning agency can manage/create requisitions.
   * Client hiring managers are strictly forbidden from creating agency requisitions.
   */
  static canCreateRequisitions(user: AuthenticatedUser): boolean {
    return (
      user.organizationType === OrganizationType.AGENCY &&
      (user.role === UserRole.RECRUITER || user.role === UserRole.DELIVERY_HEAD)
    );
  }

  /**
   * Only recruiters and delivery heads within the same agency can edit/update requisitions.
   */
  static canEditRequisition(user: AuthenticatedUser, requisitionOrgId: string): boolean {
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.organizationId === requisitionOrgId &&
      (user.role === UserRole.RECRUITER || user.role === UserRole.DELIVERY_HEAD)
    );
  }

  /**
   * Only recruiters of the owning agency can upload resumes for ingestion.
   */
  static canUploadResumes(user: AuthenticatedUser): boolean {
    return user.organizationType === OrganizationType.AGENCY && user.role === UserRole.RECRUITER;
  }

  /**
   * Only recruiters and delivery heads of the owning agency can view batch upload progress.
   */
  static canViewBatchJob(user: AuthenticatedUser, batchAgencyId: string): boolean {
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.organizationId === batchAgencyId &&
      (user.role === UserRole.RECRUITER || user.role === UserRole.DELIVERY_HEAD)
    );
  }

  /**
   * Recruiter and delivery head can access raw CV documents for their agency.
   * Client hiring managers are explicitly forbidden from downloading raw candidate resumes.
   */
  static canDownloadDocument(user: AuthenticatedUser, docAgencyId: string): boolean {
    if (user.role === UserRole.CLIENT_HIRING_MGR) {
      return false;
    }
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.organizationId === docAgencyId &&
      (user.role === UserRole.RECRUITER || user.role === UserRole.DELIVERY_HEAD)
    );
  }

  /**
   * Only Agency DELIVERY_HEAD can view agency-wide delivery operational analytics and dashboard.
   * Client hiring managers and Recruiters are strictly forbidden.
   */
  static canViewDeliveryDashboard(user: AuthenticatedUser): boolean {
    if (user.role === UserRole.CLIENT_HIRING_MGR) return false;
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.role === UserRole.DELIVERY_HEAD
    );
  }

  /**
   * Agency delivery heads can view audit trails and compliance dashboards for their agency.
   * Cannot view audit logs belonging to another agency.
   */
  static canViewAuditLogs(user: AuthenticatedUser, targetOrgId: string): boolean {
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.role === UserRole.DELIVERY_HEAD &&
      user.organizationId === targetOrgId
    );
  }

  /**
   * Determines if candidate details (such as full name or internal notes) should be masked.
   * Client hiring managers see masked contact info / pseudonymous references (e.g. CND-XXXXX).
   */
  static shouldMaskCandidateDetails(user: AuthenticatedUser): boolean {
    return user.role === UserRole.CLIENT_HIRING_MGR;
  }

  /**
   * Only agency recruiters can alter scorecard criteria and weights.
   */
  static canAlterScorecard(user: AuthenticatedUser, requisitionOrgId: string): boolean {
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.organizationId === requisitionOrgId &&
      (user.role === UserRole.RECRUITER || user.role === UserRole.DELIVERY_HEAD)
    );
  }

  /**
   * Agency staff (RECRUITER or DELIVERY_HEAD) can manage candidate consent records.
   * Client hiring managers are strictly forbidden.
   */
  static canManageConsent(user: AuthenticatedUser, targetAgencyId: string): boolean {
    if (user.role === UserRole.CLIENT_HIRING_MGR) return false;
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.organizationId === targetAgencyId &&
      (user.role === UserRole.RECRUITER || user.role === UserRole.DELIVERY_HEAD)
    );
  }

  /**
   * Agency recruiters and delivery heads can request candidate deletion.
   */
  static canRequestDeletion(user: AuthenticatedUser, targetAgencyId: string): boolean {
    if (user.role === UserRole.CLIENT_HIRING_MGR) return false;
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.organizationId === targetAgencyId &&
      (user.role === UserRole.RECRUITER || user.role === UserRole.DELIVERY_HEAD)
    );
  }

  /**
   * Only Agency DELIVERY_HEAD can review, approve, and execute candidate deletions.
   */
  static canApproveOrExecuteDeletion(user: AuthenticatedUser, targetAgencyId: string): boolean {
    if (user.role === UserRole.CLIENT_HIRING_MGR) return false;
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.organizationId === targetAgencyId &&
      user.role === UserRole.DELIVERY_HEAD
    );
  }

  /**
   * Only Agency DELIVERY_HEAD can configure retention policies.
   */
  static canManageRetentionPolicy(user: AuthenticatedUser, targetAgencyId: string): boolean {
    if (user.role === UserRole.CLIENT_HIRING_MGR) return false;
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.organizationId === targetAgencyId &&
      user.role === UserRole.DELIVERY_HEAD
    );
  }

  /**
   * Agency staff can review candidates flagged for retention.
   */
  static canViewRetentionReview(user: AuthenticatedUser, targetAgencyId: string): boolean {
    if (user.role === UserRole.CLIENT_HIRING_MGR) return false;
    return (
      user.organizationType === OrganizationType.AGENCY &&
      user.organizationId === targetAgencyId &&
      (user.role === UserRole.RECRUITER || user.role === UserRole.DELIVERY_HEAD)
    );
  }
}

