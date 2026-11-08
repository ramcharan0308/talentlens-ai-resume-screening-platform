import { requirePageAuth } from "@/lib/page-auth";
import { UserRole } from "@prisma/client";
import { ClientCandidateDetailView } from "./client-candidate-view";

export const metadata = {
  title: "Candidate Dossier - TalentLens Client Portal",
  description: "View candidate profile and AI screening evidence.",
};

export default async function ClientCandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageAuth({
    callbackUrl: "/client",
    allowedRoles: [UserRole.CLIENT_HIRING_MGR],
  });

  const { id } = await params;

  return <ClientCandidateDetailView user={user} candidateId={id} />;
}

