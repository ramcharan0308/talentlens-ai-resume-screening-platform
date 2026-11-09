import { requireRequisitionDetailPageAuth } from "@/lib/page-auth";
import { RequisitionDetailClientView } from "./requisition-detail-client";

export const metadata = {
  title: "Requisition Details - TalentLens",
  description: "View requisition specification, evaluation criteria, and candidate pipeline.",
};

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, requisition } = await requireRequisitionDetailPageAuth(id);

  return (
    <RequisitionDetailClientView
      id={id}
      initialData={requisition}
      userRole={user.role}
    />
  );
}
