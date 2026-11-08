import { requireCandidateDetailPageAuth } from "@/lib/page-auth";
import { CandidateDetailClientView } from "./candidate-detail-client";

export const metadata = {
  title: "Candidate Dossier - TalentLens",
  description: "Detailed candidate dossier, experience, skills, and verified evidence.",
};

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, candidate } = await requireCandidateDetailPageAuth(id);

  return (
    <CandidateDetailClientView
      id={id}
      initialData={candidate}
      userRole={user.role}
    />
  );
}
