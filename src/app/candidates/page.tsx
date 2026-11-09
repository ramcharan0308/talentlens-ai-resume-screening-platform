import { requirePageAuth } from "@/lib/page-auth";
import { CandidatesClientView } from "./candidates-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Candidate Profiles - TalentLens",
  description: "Browse candidate profiles and intake pools.",
};

export default async function CandidatesPage() {
  const user = await requirePageAuth({
    callbackUrl: "/candidates",
  });

  return <CandidatesClientView userRole={user.role} />;
}
