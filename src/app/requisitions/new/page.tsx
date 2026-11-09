import { RequisitionForm } from "@/components/requisitions/requisition-form";
import { requirePageAuth } from "@/lib/page-auth";
import { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create Requisition - TalentLens",
  description: "Create and configure a new staffing requisition and scorecard evaluation criteria.",
};

export default async function NewRequisitionPage() {
  await requirePageAuth({
    callbackUrl: "/requisitions/new",
    allowedRoles: [UserRole.RECRUITER, UserRole.DELIVERY_HEAD],
  });

  return (
    <div className="container py-8 max-w-5xl">
      <RequisitionForm />
    </div>
  );
}
