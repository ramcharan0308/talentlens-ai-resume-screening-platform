import { requirePageAuth } from "@/lib/page-auth";
import { UserRole } from "@prisma/client";
import { ClientRequisitionDetailView } from "./client-requisition-view";

export const metadata = {
  title: "Requisition Candidate Pipeline - TalentLens Client Portal",
  description: "Review candidates submitted for this requisition.",
};

export default async function ClientRequisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageAuth({
    callbackUrl: "/client/requisitions",
    allowedRoles: [UserRole.CLIENT_HIRING_MGR],
  });

  const { id } = await params;

  return <ClientRequisitionDetailView user={user} requisitionId={id} />;
}

