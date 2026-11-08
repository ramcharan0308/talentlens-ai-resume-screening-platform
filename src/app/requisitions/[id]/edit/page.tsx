import { requireRequisitionEditPageAuth } from "@/lib/page-auth";
import { EditRequisitionClientView } from "./edit-requisition-client";

export const metadata = {
  title: "Edit Requisition - TalentLens",
  description: "Edit staffing requisition and scorecard criteria.",
};

export default async function EditRequisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { requisition } = await requireRequisitionEditPageAuth(id);

  return <EditRequisitionClientView id={id} initialData={requisition} />;
}
