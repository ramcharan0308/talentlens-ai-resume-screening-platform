import { prisma } from "@/lib/prisma";
import { OrganizationType, UserRole } from "@prisma/client";

/**
 * Ensures a default Agency Organization and Recruiter User exist in PostgreSQL.
 * Used for staffing operations at Company A (Noida) to satisfy foreign key constraints.
 */
export async function getDefaultAgencyAndRecruiter() {
  // Find or create default agency organization
  let agency = await prisma.organization.findFirst({
    where: { type: OrganizationType.AGENCY },
  });

  if (!agency) {
    agency = await prisma.organization.create({
      data: {
        name: "Company A Staffing Services (Noida)",
        type: OrganizationType.AGENCY,
      },
    });
  }

  // Find or create default recruiter user for this agency
  let recruiter = await prisma.user.findFirst({
    where: {
      organizationId: agency.id,
      role: UserRole.RECRUITER,
    },
  });

  if (!recruiter) {
    recruiter = await prisma.user.create({
      data: {
        name: "Priya Sharma",
        email: "priya.sharma@companya-noida.internal",
        role: UserRole.RECRUITER,
        organizationId: agency.id,
      },
    });
  }

  return { agency, recruiter };
}
