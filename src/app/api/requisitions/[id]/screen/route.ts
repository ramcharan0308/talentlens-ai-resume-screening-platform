import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { UserRole, OrganizationType } from "@prisma/client";
import { screenCandidate, ScreeningError } from "@/lib/screening";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request, [
      UserRole.RECRUITER,
      UserRole.DELIVERY_HEAD,
    ]);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { user } = authResult;

    // Must be an agency organization
    if (user.organizationType !== OrganizationType.AGENCY) {
      return NextResponse.json(
        { success: false, error: "Only agency personnel can trigger AI screening." },
        { status: 403 }
      );
    }

    const { id: requisitionId } = await context.params;

    // Verify Requisition belongs to the recruiter's agency
    const requisition = await prisma.requisition.findFirst({
      where: {
        id: requisitionId,
        organizationId: user.organizationId,
      },
      include: {
        scorecardCriteria: true,
      },
    });

    if (!requisition) {
      return NextResponse.json(
        { success: false, error: "Requisition not found or access denied." },
        { status: 404 }
      );
    }

    if (!requisition.scorecardCriteria || requisition.scorecardCriteria.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Requisition does not have scorecard criteria configured. Screening requires weighted criteria.",
        },
        { status: 400 }
      );
    }

    // Parse request body
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body
    }

    let targetCandidateIds: string[] = [];

    if (body.candidateId && typeof body.candidateId === "string") {
      targetCandidateIds = [body.candidateId];
    } else if (Array.isArray(body.candidateIds) && body.candidateIds.length > 0) {
      targetCandidateIds = body.candidateIds.filter((id: any) => typeof id === "string");
    } else {
      // If no candidates specified, find all candidates linked via Applications or uploaded documents for this requisition
      const applications = await prisma.application.findMany({
        where: { requisitionId },
        select: { candidateId: true },
      });
      targetCandidateIds = applications.map((a) => a.candidateId);
    }

    if (targetCandidateIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No candidates specified or linked to this requisition for screening.",
        },
        { status: 400 }
      );
    }

    const results = [];
    const errors = [];

    for (const candidateId of targetCandidateIds) {
      try {
        const evalResult = await screenCandidate({
          agencyId: user.organizationId,
          requisitionId,
          candidateId,
          actorId: user.id,
        });
        results.push(evalResult);
      } catch (err: any) {
        errors.push({
          candidateId,
          error: err.message || "Failed to screen candidate",
          statusCode: err instanceof ScreeningError ? err.statusCode : 400,
        });
      }
    }

    if (targetCandidateIds.length === 1 && results.length === 0 && errors.length === 1) {
      const singleError = errors[0];
      return NextResponse.json(
        {
          success: false,
          error: singleError.error,
          candidateId: singleError.candidateId,
        },
        { status: singleError.statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      totalRequested: targetCandidateIds.length,
      evaluatedCount: results.length,
      evaluations: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    if (err instanceof ScreeningError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error during screening." },
      { status: 500 }
    );
  }
}
