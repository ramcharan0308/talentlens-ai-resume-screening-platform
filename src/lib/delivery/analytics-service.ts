import { prisma } from "@/lib/prisma";
import { AuthenticatedUser } from "@/lib/auth";
import { ApplicationStatus, OrganizationType, RequisitionStatus, UserRole } from "@prisma/client";
import { Permissions } from "@/lib/permissions";

const CLIENT_SHORTLIST_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.CLIENT_SHORTLISTED,
  ApplicationStatus.INTERVIEW_SCHEDULED,
  ApplicationStatus.INTERVIEW_COMPLETED,
  ApplicationStatus.OFFERED,
  ApplicationStatus.JOINED,
];

const INTERVIEW_STAGE_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.INTERVIEW_PROPOSED,
  ApplicationStatus.INTERVIEW_SCHEDULED,
  ApplicationStatus.INTERVIEW_COMPLETED,
  ApplicationStatus.OFFERED,
  ApplicationStatus.JOINED,
];

const INTERVIEW_SCHEDULED_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.INTERVIEW_SCHEDULED,
  ApplicationStatus.INTERVIEW_COMPLETED,
  ApplicationStatus.OFFERED,
  ApplicationStatus.JOINED,
];

const INTERVIEW_COMPLETED_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.INTERVIEW_COMPLETED,
  ApplicationStatus.OFFERED,
  ApplicationStatus.JOINED,
];

const OFFERED_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.OFFERED,
  ApplicationStatus.JOINED,
];

export interface DeliveryDashboardFilters {
  startDate?: string;
  endDate?: string;
  recruiterId?: string;
  clientOrganizationId?: string;
  requisitionId?: string;
}

export interface ExecutiveKpiOverview {
  activeRequisitionsCount: number;
  requisitionsOpenedInPeriod: number;
  requisitionsClosedInPeriod: number;
  candidatesSourcedInPeriod: number;
  candidatesScreenedInPeriod: number;
  candidatesSubmittedInPeriod: number;
  clientShortlistedInPeriod: number;
  interviewsProposedInPeriod: number;
  interviewsScheduledInPeriod: number;
  interviewsCompletedInPeriod: number;
  offersMadeInPeriod: number;
  candidatesJoinedInPeriod: number;
  overdueSlaRequisitionsCount: number;
}

export interface RecruiterProductivityMetric {
  recruiterId: string;
  recruiterName: string;
  recruiterEmail: string;
  role: string;
  candidatesSourced: number;
  evaluationsReviewed: number;
  candidatesSubmitted: number;
  clientShortlistsReceived: number;
  interviewsAttributable: number;
  joinsAttributable: number;
  submissionToShortlistRate: number | null; // percentage
  avgReviewTurnaroundHours: number | null;
  avgTimeToFirstSubmissionHours: number | null;
}

export interface RequisitionTurnaroundMetric {
  requisitionId: string;
  title: string;
  department: string | null;
  clientOrganizationId: string | null;
  clientOrganizationName: string | null;
  status: RequisitionStatus;
  createdAt: string;
  ageDays: number;
  totalApplications: number;
  totalSubmissions: number;
  totalShortlists: number;
  timeToFirstSubmissionHours: number | null;
  timeToFirstShortlistHours: number | null;
  timeToFirstInterviewHours: number | null;
  timeToOfferHours: number | null;
  timeToJoinHours: number | null;
  isOverdueSla: boolean;
  isInactive: boolean;
  daysSinceLastActivity: number;
}

export interface ScreeningEfficiencyMetrics {
  eligibleCandidatesCount: number;
  screenedCandidatesCount: number;
  screeningCompletionRate: number; // percentage
  averageOverallScore: number | null; // 0 - 100
  averageEvidenceCoverage: number | null; // 0 - 100
  mustHaveWarningCount: number;
  mustHaveWarningRate: number; // percentage
  evaluationsReviewedCount: number;
  recruiterReviewCompletionRate: number; // percentage
  avgTimeToReviewHours: number | null;
  disclaimer: string;
}

export interface ClientAcceptanceMetrics {
  candidatesSubmitted: number;
  clientShortlists: number;
  clientRejections: number;
  interviewProposals: number;
  acceptanceRate: number | null; // percentage: shortlists / submitted
  acceptanceRateDisplay: string;
  priorPeriodSubmitted: number;
  priorPeriodShortlists: number;
  priorPeriodAcceptanceRate: number | null;
  periodOverPeriodChangePoints: number | null;
}

export interface PipelineConversionStage {
  stage: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null; // percentage
  overallYield: number; // percentage of sourced
}

export interface PipelineConversionFunnel {
  stages: PipelineConversionStage[];
  overallYield: number;
}

export interface SlaPerformanceMetrics {
  targetHours: number; // 48
  targetPercentage: number; // 80%
  evaluatedRequisitionsCount: number;
  metSlaCount: number;
  actualSlaPercentage: number | null;
  overdueCount: number;
  overdueRequisitions: Array<{
    requisitionId: string;
    title: string;
    clientOrganizationName: string | null;
    createdAt: string;
    elapsedHours: number;
    overdueHours: number;
  }>;
}

export interface DeliveryDashboardData {
  filtersApplied: {
    startDate: string;
    endDate: string;
    recruiterId: string | null;
    clientOrganizationId: string | null;
    requisitionId: string | null;
    isFiltered: boolean;
  };
  kpiOverview: ExecutiveKpiOverview;
  recruiterProductivity: RecruiterProductivityMetric[];
  requisitionTurnaround: RequisitionTurnaroundMetric[];
  screeningEfficiency: ScreeningEfficiencyMetrics;
  clientAcceptance: ClientAcceptanceMetrics;
  pipelineConversion: PipelineConversionFunnel;
  slaPerformance: SlaPerformanceMetrics;
}

export interface DeliveryDashboardResult {
  success: boolean;
  data?: DeliveryDashboardData;
  error?: string;
  code?: string;
  statusCode: number;
}

/**
 * Parses and validates date range boundaries.
 * Defaults to last 30 days if not provided.
 */
function parseDateRange(startDateStr?: string, endDateStr?: string): {
  startDate: Date;
  endDate: Date;
  priorStartDate: Date;
  priorEndDate: Date;
} {
  const now = new Date();
  let endDate = now;
  if (endDateStr) {
    const parsed = new Date(endDateStr);
    if (!isNaN(parsed.getTime())) {
      if (endDateStr.length <= 10) {
        // YYYY-MM-DD format -> set to end of that day
        parsed.setHours(23, 59, 59, 999);
      }
      endDate = parsed;
    }
  }

  let startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (startDateStr) {
    const parsed = new Date(startDateStr);
    if (!isNaN(parsed.getTime())) {
      if (startDateStr.length <= 10) {
        // YYYY-MM-DD format -> set to start of that day
        parsed.setHours(0, 0, 0, 0);
      }
      startDate = parsed;
    }
  }

  // Ensure start is not after end
  if (startDate.getTime() > endDate.getTime()) {
    const temp = startDate;
    startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    endDate = temp;
  }

  const durationMs = endDate.getTime() - startDate.getTime();
  const priorEndDate = new Date(startDate.getTime());
  const priorStartDate = new Date(startDate.getTime() - durationMs);

  return { startDate, endDate, priorStartDate, priorEndDate };
}

/**
 * Calculates Delivery Head operational analytics and reporting.
 * Strictly scoped to authenticated DELIVERY_HEAD's agency.
 */
export async function getDeliveryDashboardAnalytics(
  actor: AuthenticatedUser,
  filters?: DeliveryDashboardFilters
): Promise<DeliveryDashboardResult> {
  // 1. Authorization: strictly DELIVERY_HEAD of an AGENCY
  if (!Permissions.canViewDeliveryDashboard(actor)) {
    return {
      success: false,
      error: "Access denied. Delivery Head dashboard is restricted to agency Delivery Heads.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  const agencyId = actor.organizationId;
  const { startDate, endDate, priorStartDate, priorEndDate } = parseDateRange(
    filters?.startDate,
    filters?.endDate
  );

  // 2. Validate requested filters belong to this agency
  let validatedRecruiterId: string | null = null;
  if (filters?.recruiterId) {
    const recruiter = await prisma.user.findFirst({
      where: {
        id: filters.recruiterId,
        organizationId: agencyId,
        role: { in: [UserRole.RECRUITER, UserRole.DELIVERY_HEAD] },
      },
    });
    if (!recruiter) {
      return {
        success: false,
        error: "Recruiter filter specified is invalid or belongs to another organization.",
        code: "INVALID_FILTER",
        statusCode: 400,
      };
    }
    validatedRecruiterId = recruiter.id;
  }

  let validatedClientOrgId: string | null = null;
  if (filters?.clientOrganizationId) {
    const clientOrg = await prisma.organization.findFirst({
      where: {
        id: filters.clientOrganizationId,
        agencyId,
        type: OrganizationType.CLIENT,
      },
    });
    if (!clientOrg) {
      return {
        success: false,
        error: "Client organization filter specified is invalid or not managed by your agency.",
        code: "INVALID_FILTER",
        statusCode: 400,
      };
    }
    validatedClientOrgId = clientOrg.id;
  }

  let validatedRequisitionId: string | null = null;
  if (filters?.requisitionId) {
    const req = await prisma.requisition.findFirst({
      where: {
        id: filters.requisitionId,
        organizationId: agencyId,
      },
    });
    if (!req) {
      return {
        success: false,
        error: "Requisition filter specified is invalid or belongs to another agency.",
        code: "INVALID_FILTER",
        statusCode: 400,
      };
    }
    validatedRequisitionId = req.id;
  }

  const isFiltered = Boolean(
    validatedRecruiterId || validatedClientOrgId || validatedRequisitionId || filters?.startDate || filters?.endDate
  );

  // Base requisition filter clause
  const reqBaseWhere: any = {
    organizationId: agencyId,
    ...(validatedClientOrgId ? { clientOrganizationId: validatedClientOrgId } : {}),
    ...(validatedRequisitionId ? { id: validatedRequisitionId } : {}),
    ...(validatedRecruiterId
      ? {
          OR: [
            { createdById: validatedRecruiterId },
            { applications: { some: { submittedById: validatedRecruiterId } } },
          ],
        }
      : {}),
  };

  // Base application filter clause
  const appBaseWhere: any = {
    requisition: {
      organizationId: agencyId,
      ...(validatedClientOrgId ? { clientOrganizationId: validatedClientOrgId } : {}),
      ...(validatedRequisitionId ? { id: validatedRequisitionId } : {}),
    },
    ...(validatedRecruiterId ? { submittedById: validatedRecruiterId } : {}),
  };

  const now = new Date();

  // 3. Query Requisitions (Tenant-Scoped)
  const requisitions = await prisma.requisition.findMany({
    where: reqBaseWhere,
    include: {
      clientOrganization: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true, role: true } },
      applications: {
        select: {
          id: true,
          candidateId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          submittedAt: true,
          submittedById: true,
          clientDecisionAt: true,
          proposedInterviewSlot: true,
          interviewScheduledSlot: true,
          offeredAt: true,
          joinedAt: true,
          rejectedAt: true,
        },
      },
      evaluations: {
        select: {
          id: true,
          candidateId: true,
          status: true,
          overallScore: true,
          evidenceCoverage: true,
          hasMustHaveWarnings: true,
          isReviewedByRecruiter: true,
          reviewedAt: true,
          reviewedById: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 4. Executive KPI Overview Calculations
  const activeRequisitionsCount = requisitions.filter((r) => r.status === RequisitionStatus.ACTIVE).length;
  const requisitionsOpenedInPeriod = requisitions.filter(
    (r) => r.createdAt >= startDate && r.createdAt <= endDate
  ).length;

  // Requisitions closed in period (status in FILLED/ARCHIVED with updatedAt in period)
  const requisitionsClosedInPeriod = requisitions.filter(
    (r) =>
      (r.status === RequisitionStatus.FILLED || r.status === RequisitionStatus.ARCHIVED) &&
      r.updatedAt >= startDate &&
      r.updatedAt <= endDate
  ).length;

  // Aggregate applications across the filtered requisitions
  const allApplications = requisitions
    .flatMap((r) => r.applications)
    .filter((a) => !validatedRecruiterId || a.submittedById === validatedRecruiterId);

  const candidatesSourcedInPeriod = allApplications.filter(
    (a) => a.createdAt >= startDate && a.createdAt <= endDate
  ).length;

  const candidatesSubmittedInPeriod = allApplications.filter(
    (a) => a.submittedAt && a.submittedAt >= startDate && a.submittedAt <= endDate
  ).length;

  const clientShortlistedInPeriod = allApplications.filter(
    (a) =>
      a.clientDecisionAt &&
      a.clientDecisionAt >= startDate &&
      a.clientDecisionAt <= endDate &&
      CLIENT_SHORTLIST_STATUSES.includes(a.status)
  ).length;

  const interviewsProposedInPeriod = allApplications.filter(
    (a) =>
      a.proposedInterviewSlot &&
      a.clientDecisionAt &&
      a.clientDecisionAt >= startDate &&
      a.clientDecisionAt <= endDate
  ).length;

  const interviewsScheduledInPeriod = allApplications.filter(
    (a) =>
      a.interviewScheduledSlot &&
      a.updatedAt >= startDate &&
      a.updatedAt <= endDate &&
      INTERVIEW_SCHEDULED_STATUSES.includes(a.status)
  ).length;

  const interviewsCompletedInPeriod = allApplications.filter(
    (a) =>
      a.updatedAt >= startDate &&
      a.updatedAt <= endDate &&
      INTERVIEW_COMPLETED_STATUSES.includes(a.status)
  ).length;

  const offersMadeInPeriod = allApplications.filter(
    (a) => a.offeredAt && a.offeredAt >= startDate && a.offeredAt <= endDate
  ).length;

  const candidatesJoinedInPeriod = allApplications.filter(
    (a) => a.joinedAt && a.joinedAt >= startDate && a.joinedAt <= endDate
  ).length;

  // Evaluations in period
  const allEvaluations = requisitions.flatMap((r) => r.evaluations);
  const candidatesScreenedInPeriod = allEvaluations.filter(
    (e) => e.status === "COMPLETED" && e.createdAt >= startDate && e.createdAt <= endDate
  ).length;

  // 5. SLA Tracking (Business Target: Initial Shortlist / Submission within 48 Hours)
  const SLA_TARGET_HOURS = 48.0;
  const SLA_TARGET_PERCENTAGE = 80.0;
  const overdueRequisitionsList: SlaPerformanceMetrics["overdueRequisitions"] = [];
  let evaluatedSlaRequisitionsCount = 0;
  let metSlaCount = 0;

  for (const req of requisitions) {
    const submissions = req.applications
      .filter((a) => a.submittedAt !== null)
      .map((a) => a.submittedAt!.getTime());

    const hasSubmissions = submissions.length > 0;
    const firstSubmissionTime = hasSubmissions ? Math.min(...submissions) : null;
    const reqAgeHours = (now.getTime() - req.createdAt.getTime()) / (1000 * 60 * 60);

    if (firstSubmissionTime !== null) {
      evaluatedSlaRequisitionsCount++;
      const turnaroundHours = (firstSubmissionTime - req.createdAt.getTime()) / (1000 * 60 * 60);
      if (turnaroundHours <= SLA_TARGET_HOURS) {
        metSlaCount++;
      } else {
        // Missed SLA: first submission took longer than 48 hours
        overdueRequisitionsList.push({
          requisitionId: req.id,
          title: req.title,
          clientOrganizationName: req.clientOrganization?.name || null,
          createdAt: req.createdAt.toISOString(),
          elapsedHours: Math.round(turnaroundHours * 10) / 10,
          overdueHours: Math.round((turnaroundHours - SLA_TARGET_HOURS) * 10) / 10,
        });
      }
    } else if (req.status === RequisitionStatus.ACTIVE && reqAgeHours > SLA_TARGET_HOURS) {
      // Overdue active requisition with 0 submissions
      evaluatedSlaRequisitionsCount++;
      overdueRequisitionsList.push({
        requisitionId: req.id,
        title: req.title,
        clientOrganizationName: req.clientOrganization?.name || null,
        createdAt: req.createdAt.toISOString(),
        elapsedHours: Math.round(reqAgeHours * 10) / 10,
        overdueHours: Math.round((reqAgeHours - SLA_TARGET_HOURS) * 10) / 10,
      });
    }
  }

  const actualSlaPercentage =
    evaluatedSlaRequisitionsCount > 0
      ? Math.round((metSlaCount / evaluatedSlaRequisitionsCount) * 1000) / 10
      : null;

  const overdueSlaCount = overdueRequisitionsList.length;

  // 6. Recruiter Productivity Metrics
  // Fetch agency staff (recruiters & delivery heads)
  const agencyStaff = await prisma.user.findMany({
    where: {
      organizationId: agencyId,
      role: { in: [UserRole.RECRUITER, UserRole.DELIVERY_HEAD] },
      ...(validatedRecruiterId ? { id: validatedRecruiterId } : {}),
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  const recruiterProductivity: RecruiterProductivityMetric[] = agencyStaff.map((staff) => {
    // Sourced candidates: applications on requisitions created by this user
    const staffRequisitions = requisitions.filter((r) => r.createdById === staff.id);
    const staffCreatedApps = staffRequisitions.flatMap((r) => r.applications);
    const candidatesSourced = staffCreatedApps.filter(
      (a) => a.createdAt >= startDate && a.createdAt <= endDate
    ).length;

    // Evaluations reviewed by this staff member
    const reviewedEvals = allEvaluations.filter(
      (e) =>
        e.reviewedById === staff.id &&
        e.isReviewedByRecruiter &&
        e.reviewedAt &&
        e.reviewedAt >= startDate &&
        e.reviewedAt <= endDate
    );
    const evaluationsReviewed = reviewedEvals.length;

    // Review turnaround times
    let avgReviewTurnaroundHours: number | null = null;
    if (reviewedEvals.length > 0) {
      const totalReviewTimeMs = reviewedEvals.reduce((acc, e) => {
        return acc + (e.reviewedAt!.getTime() - e.createdAt.getTime());
      }, 0);
      avgReviewTurnaroundHours =
        Math.round((totalReviewTimeMs / (reviewedEvals.length * 1000 * 60 * 60)) * 10) / 10;
    }

    // Submissions attributed to this recruiter
    const staffSubmittedApps = allApplications.filter(
      (a) => a.submittedById === staff.id && a.submittedAt && a.submittedAt >= startDate && a.submittedAt <= endDate
    );
    const candidatesSubmitted = staffSubmittedApps.length;

    // Client shortlists for candidates submitted by this recruiter
    const clientShortlistsReceived = staffSubmittedApps.filter((a) =>
      CLIENT_SHORTLIST_STATUSES.includes(a.status)
    ).length;

    // Attributable interviews
    const interviewsAttributable = staffSubmittedApps.filter((a) =>
      INTERVIEW_STAGE_STATUSES.includes(a.status)
    ).length;

    // Attributable joins
    const joinsAttributable = staffSubmittedApps.filter((a) => a.status === ApplicationStatus.JOINED).length;

    const submissionToShortlistRate =
      candidatesSubmitted > 0
        ? Math.round((clientShortlistsReceived / candidatesSubmitted) * 1000) / 10
        : null;

    // Turnaround to first submission for requisitions created by this recruiter
    const staffReqsWithSubmissions = staffRequisitions.filter((r) =>
      r.applications.some((a) => a.submittedAt !== null)
    );
    let avgTimeToFirstSubmissionHours: number | null = null;
    if (staffReqsWithSubmissions.length > 0) {
      const totalFirstSubMs = staffReqsWithSubmissions.reduce((acc, r) => {
        const subTimes = r.applications
          .filter((a) => a.submittedAt !== null)
          .map((a) => a.submittedAt!.getTime());
        const minSub = Math.min(...subTimes);
        return acc + (minSub - r.createdAt.getTime());
      }, 0);
      avgTimeToFirstSubmissionHours =
        Math.round((totalFirstSubMs / (staffReqsWithSubmissions.length * 1000 * 60 * 60)) * 10) / 10;
    }

    return {
      recruiterId: staff.id,
      recruiterName: staff.name,
      recruiterEmail: staff.email,
      role: staff.role,
      candidatesSourced,
      evaluationsReviewed,
      candidatesSubmitted,
      clientShortlistsReceived,
      interviewsAttributable,
      joinsAttributable,
      submissionToShortlistRate,
      avgReviewTurnaroundHours,
      avgTimeToFirstSubmissionHours,
    };
  });

  // 7. Requisition Turnaround & Timelines
  const requisitionTurnaround: RequisitionTurnaroundMetric[] = requisitions.map((req) => {
    const ageDays = Math.floor((now.getTime() - req.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    const submissions = req.applications
      .filter((a) => a.submittedAt !== null)
      .map((a) => a.submittedAt!.getTime());
    const firstSubMs = submissions.length > 0 ? Math.min(...submissions) : null;
    const timeToFirstSubmissionHours =
      firstSubMs !== null
        ? Math.round(((firstSubMs - req.createdAt.getTime()) / (1000 * 60 * 60)) * 10) / 10
        : null;

    const shortlists = req.applications
      .filter(
        (a) =>
          a.clientDecisionAt !== null &&
          CLIENT_SHORTLIST_STATUSES.includes(a.status)
      )
      .map((a) => a.clientDecisionAt!.getTime());
    const firstShortlistMs = shortlists.length > 0 ? Math.min(...shortlists) : null;
    const timeToFirstShortlistHours =
      firstShortlistMs !== null
        ? Math.round(((firstShortlistMs - req.createdAt.getTime()) / (1000 * 60 * 60)) * 10) / 10
        : null;

    const interviews = req.applications
      .filter(
        (a) =>
          a.interviewScheduledSlot !== null ||
          a.proposedInterviewSlot !== null
      )
      .map((a) => (a.interviewScheduledSlot || a.proposedInterviewSlot)!.getTime());
    const firstInterviewMs = interviews.length > 0 ? Math.min(...interviews) : null;
    const timeToFirstInterviewHours =
      firstInterviewMs !== null
        ? Math.round(((firstInterviewMs - req.createdAt.getTime()) / (1000 * 60 * 60)) * 10) / 10
        : null;

    const offers = req.applications
      .filter((a) => a.offeredAt !== null)
      .map((a) => a.offeredAt!.getTime());
    const firstOfferMs = offers.length > 0 ? Math.min(...offers) : null;
    const timeToOfferHours =
      firstOfferMs !== null
        ? Math.round(((firstOfferMs - req.createdAt.getTime()) / (1000 * 60 * 60)) * 10) / 10
        : null;

    const joins = req.applications
      .filter((a) => a.joinedAt !== null)
      .map((a) => a.joinedAt!.getTime());
    const firstJoinMs = joins.length > 0 ? Math.min(...joins) : null;
    const timeToJoinHours =
      firstJoinMs !== null
        ? Math.round(((firstJoinMs - req.createdAt.getTime()) / (1000 * 60 * 60)) * 10) / 10
        : null;

    const isOverdueSla =
      (timeToFirstSubmissionHours !== null && timeToFirstSubmissionHours > SLA_TARGET_HOURS) ||
      (firstSubMs === null &&
        req.status === RequisitionStatus.ACTIVE &&
        (now.getTime() - req.createdAt.getTime()) / (1000 * 60 * 60) > SLA_TARGET_HOURS);

    // Check inactivity: no application created or updated in past 7 days
    const recentActivityDates = [
      req.updatedAt.getTime(),
      ...req.applications.map((a) => a.updatedAt.getTime()),
    ];
    const latestActivityTime = Math.max(...recentActivityDates);
    const daysSinceLastActivity = Math.floor((now.getTime() - latestActivityTime) / (1000 * 60 * 60 * 24));
    const isInactive = req.status === RequisitionStatus.ACTIVE && daysSinceLastActivity >= 7;

    return {
      requisitionId: req.id,
      title: req.title,
      department: req.department,
      clientOrganizationId: req.clientOrganizationId,
      clientOrganizationName: req.clientOrganization?.name || null,
      status: req.status,
      createdAt: req.createdAt.toISOString(),
      ageDays,
      totalApplications: req.applications.length,
      totalSubmissions: submissions.length,
      totalShortlists: shortlists.length,
      timeToFirstSubmissionHours,
      timeToFirstShortlistHours,
      timeToFirstInterviewHours,
      timeToOfferHours,
      timeToJoinHours,
      isOverdueSla,
      isInactive,
      daysSinceLastActivity,
    };
  });

  // 8. Screening Efficiency Metrics
  const eligibleCandidatesCount = await prisma.candidate.count({
    where: {
      agencyId,
      purgeStatus: "ACTIVE",
      uploadedDocuments: {
        some: {
          processingStatus: "EXTRACTED",
        },
      },
    },
  });

  const completedEvalsInPeriod = allEvaluations.filter(
    (e) => e.status === "COMPLETED" && e.createdAt >= startDate && e.createdAt <= endDate
  );
  const screenedCandidatesCount = completedEvalsInPeriod.length;

  const screeningCompletionRate =
    eligibleCandidatesCount > 0
      ? Math.round((screenedCandidatesCount / eligibleCandidatesCount) * 1000) / 10
      : 0;

  let averageOverallScore: number | null = null;
  let averageEvidenceCoverage: number | null = null;
  let mustHaveWarningCount = 0;

  if (completedEvalsInPeriod.length > 0) {
    const totalScore = completedEvalsInPeriod.reduce((sum, e) => sum + (e.overallScore || 0), 0);
    const totalCoverage = completedEvalsInPeriod.reduce((sum, e) => sum + (e.evidenceCoverage || 0), 0);
    averageOverallScore = Math.round((totalScore / completedEvalsInPeriod.length) * 10) / 10;
    averageEvidenceCoverage = Math.round((totalCoverage / completedEvalsInPeriod.length) * 10) / 10;
    mustHaveWarningCount = completedEvalsInPeriod.filter((e) => e.hasMustHaveWarnings).length;
  }

  const mustHaveWarningRate =
    screenedCandidatesCount > 0
      ? Math.round((mustHaveWarningCount / screenedCandidatesCount) * 1000) / 10
      : 0;

  const reviewedEvalsInPeriod = completedEvalsInPeriod.filter((e) => e.isReviewedByRecruiter);
  const evaluationsReviewedCount = reviewedEvalsInPeriod.length;

  const recruiterReviewCompletionRate =
    screenedCandidatesCount > 0
      ? Math.round((evaluationsReviewedCount / screenedCandidatesCount) * 1000) / 10
      : 0;

  let avgTimeToReviewHours: number | null = null;
  if (reviewedEvalsInPeriod.length > 0) {
    const totalReviewDurationMs = reviewedEvalsInPeriod.reduce((sum, e) => {
      const revTime = e.reviewedAt ? e.reviewedAt.getTime() : e.createdAt.getTime();
      return sum + (revTime - e.createdAt.getTime());
    }, 0);
    avgTimeToReviewHours =
      Math.round((totalReviewDurationMs / (reviewedEvalsInPeriod.length * 1000 * 60 * 60)) * 10) / 10;
  }

  const screeningEfficiency: ScreeningEfficiencyMetrics = {
    eligibleCandidatesCount,
    screenedCandidatesCount,
    screeningCompletionRate,
    averageOverallScore,
    averageEvidenceCoverage,
    mustHaveWarningCount,
    mustHaveWarningRate,
    evaluationsReviewedCount,
    recruiterReviewCompletionRate,
    avgTimeToReviewHours,
    disclaimer:
      "AI screening scores reflect criteria matching evidence and are advisory only; human recruiter evaluation is required before making any candidate decisions.",
  };

  // 9. Client Acceptance Metrics
  const currentSubmissions = allApplications.filter(
    (a) => a.submittedAt && a.submittedAt >= startDate && a.submittedAt <= endDate
  );
  const candidatesSubmitted = currentSubmissions.length;

  const clientShortlists = currentSubmissions.filter((a) =>
    CLIENT_SHORTLIST_STATUSES.includes(a.status)
  ).length;

  const clientRejections = currentSubmissions.filter(
    (a) => a.status === ApplicationStatus.CLIENT_REJECTED
  ).length;

  const interviewProposals = currentSubmissions.filter(
    (a) => a.proposedInterviewSlot !== null
  ).length;

  const clientAcceptanceRate =
    candidatesSubmitted > 0
      ? Math.round((clientShortlists / candidatesSubmitted) * 1000) / 10
      : null;

  const acceptanceRateDisplay =
    candidatesSubmitted > 0
      ? `${clientShortlists} / ${candidatesSubmitted} (${clientAcceptanceRate !== null ? `${clientAcceptanceRate.toFixed(1)}%` : "0.0%"})`
      : "N/A";

  // Period-over-period comparison
  const priorSubmissions = allApplications.filter(
    (a) => a.submittedAt && a.submittedAt >= priorStartDate && a.submittedAt <= priorEndDate
  );
  const priorPeriodSubmitted = priorSubmissions.length;
  const priorPeriodShortlists = priorSubmissions.filter((a) =>
    CLIENT_SHORTLIST_STATUSES.includes(a.status)
  ).length;

  const priorPeriodAcceptanceRate =
    priorPeriodSubmitted > 0
      ? Math.round((priorPeriodShortlists / priorPeriodSubmitted) * 1000) / 10
      : null;

  const periodOverPeriodChangePoints =
    clientAcceptanceRate !== null && priorPeriodAcceptanceRate !== null
      ? Math.round((clientAcceptanceRate - priorPeriodAcceptanceRate) * 10) / 10
      : null;

  const clientAcceptance: ClientAcceptanceMetrics = {
    candidatesSubmitted,
    clientShortlists,
    clientRejections,
    interviewProposals,
    acceptanceRate: clientAcceptanceRate,
    acceptanceRateDisplay,
    priorPeriodSubmitted,
    priorPeriodShortlists,
    priorPeriodAcceptanceRate,
    periodOverPeriodChangePoints,
  };

  // 10. Pipeline Conversion Funnel (Cohort-based within filtered dates)
  const cohortApplications = allApplications.filter(
    (a) => a.createdAt >= startDate && a.createdAt <= endDate
  );
  const sourcedCohortCount = cohortApplications.length;

  // Screening: candidate has at least one completed evaluation
  const screenedCohortCount = cohortApplications.filter((a) =>
    allEvaluations.some((e) => e.candidateId === a.candidateId && e.status === "COMPLETED")
  ).length;

  const submittedCohortCount = cohortApplications.filter((a) => a.submittedAt !== null).length;

  const shortlistedCohortCount = cohortApplications.filter((a) =>
    CLIENT_SHORTLIST_STATUSES.includes(a.status)
  ).length;

  const interviewCohortCount = cohortApplications.filter((a) =>
    INTERVIEW_STAGE_STATUSES.includes(a.status)
  ).length;

  const offeredCohortCount = cohortApplications.filter((a) =>
    OFFERED_STATUSES.includes(a.status)
  ).length;

  const joinedCohortCount = cohortApplications.filter((a) => a.status === ApplicationStatus.JOINED).length;

  const computeRate = (numerator: number, denominator: number): number | null => {
    if (denominator <= 0) return null;
    return Math.round((numerator / denominator) * 1000) / 10;
  };

  const computeYield = (count: number): number => {
    if (sourcedCohortCount <= 0) return 0;
    return Math.round((count / sourcedCohortCount) * 1000) / 10;
  };

  const pipelineStages: PipelineConversionStage[] = [
    {
      stage: "SOURCED",
      label: "Candidates Sourced",
      count: sourcedCohortCount,
      conversionFromPrevious: null,
      overallYield: 100.0,
    },
    {
      stage: "SCREENED",
      label: "AI Screened",
      count: screenedCohortCount,
      conversionFromPrevious: computeRate(screenedCohortCount, sourcedCohortCount),
      overallYield: computeYield(screenedCohortCount),
    },
    {
      stage: "SUBMITTED",
      label: "Submitted to Client",
      count: submittedCohortCount,
      conversionFromPrevious: computeRate(submittedCohortCount, screenedCohortCount),
      overallYield: computeYield(submittedCohortCount),
    },
    {
      stage: "SHORTLISTED",
      label: "Client Shortlisted",
      count: shortlistedCohortCount,
      conversionFromPrevious: computeRate(shortlistedCohortCount, submittedCohortCount),
      overallYield: computeYield(shortlistedCohortCount),
    },
    {
      stage: "INTERVIEW",
      label: "Interview Stage",
      count: interviewCohortCount,
      conversionFromPrevious: computeRate(interviewCohortCount, shortlistedCohortCount),
      overallYield: computeYield(interviewCohortCount),
    },
    {
      stage: "OFFERED",
      label: "Job Offered",
      count: offeredCohortCount,
      conversionFromPrevious: computeRate(offeredCohortCount, interviewCohortCount),
      overallYield: computeYield(offeredCohortCount),
    },
    {
      stage: "JOINED",
      label: "Candidates Joined",
      count: joinedCohortCount,
      conversionFromPrevious: computeRate(joinedCohortCount, offeredCohortCount),
      overallYield: computeYield(joinedCohortCount),
    },
  ];

  const overallFunnelYield =
    sourcedCohortCount > 0
      ? Math.round((joinedCohortCount / sourcedCohortCount) * 1000) / 10
      : 0;

  const pipelineConversion: PipelineConversionFunnel = {
    stages: pipelineStages,
    overallYield: overallFunnelYield,
  };

  const slaPerformance: SlaPerformanceMetrics = {
    targetHours: SLA_TARGET_HOURS,
    targetPercentage: SLA_TARGET_PERCENTAGE,
    evaluatedRequisitionsCount: evaluatedSlaRequisitionsCount,
    metSlaCount,
    actualSlaPercentage,
    overdueCount: overdueSlaCount,
    overdueRequisitions: overdueRequisitionsList,
  };

  const kpiOverview: ExecutiveKpiOverview = {
    activeRequisitionsCount,
    requisitionsOpenedInPeriod,
    requisitionsClosedInPeriod,
    candidatesSourcedInPeriod,
    candidatesScreenedInPeriod,
    candidatesSubmittedInPeriod,
    clientShortlistedInPeriod,
    interviewsProposedInPeriod,
    interviewsScheduledInPeriod,
    interviewsCompletedInPeriod,
    offersMadeInPeriod,
    candidatesJoinedInPeriod,
    overdueSlaRequisitionsCount: overdueSlaCount,
  };

  return {
    success: true,
    data: {
      filtersApplied: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        recruiterId: validatedRecruiterId,
        clientOrganizationId: validatedClientOrgId,
        requisitionId: validatedRequisitionId,
        isFiltered,
      },
      kpiOverview,
      recruiterProductivity,
      requisitionTurnaround,
      screeningEfficiency,
      clientAcceptance,
      pipelineConversion,
      slaPerformance,
    },
    statusCode: 200,
  };
}

/**
 * Retrieves available filter metadata (recruiters, clients, requisitions) for the agency.
 */
export async function getDeliveryDashboardFilters(actor: AuthenticatedUser) {
  if (!Permissions.canViewDeliveryDashboard(actor)) {
    return {
      success: false,
      error: "Access denied. Delivery Head dashboard is restricted to agency Delivery Heads.",
      code: "FORBIDDEN",
      statusCode: 403,
    };
  }

  const agencyId = actor.organizationId;

  const [recruiters, clientOrganizations, requisitions] = await Promise.all([
    prisma.user.findMany({
      where: {
        organizationId: agencyId,
        role: { in: [UserRole.RECRUITER, UserRole.DELIVERY_HEAD] },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.organization.findMany({
      where: {
        agencyId,
        type: OrganizationType.CLIENT,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.requisition.findMany({
      where: {
        organizationId: agencyId,
      },
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    success: true,
    data: {
      recruiters,
      clientOrganizations,
      requisitions,
    },
    statusCode: 200,
  };
}
