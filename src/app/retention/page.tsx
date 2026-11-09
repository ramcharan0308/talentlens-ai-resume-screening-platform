import { requireRetentionPageAuth } from "@/lib/page-auth";
import { RetentionClientView } from "./retention-client";

export const metadata = {
  title: "Candidate Governance & Retention - TalentLens",
  description: "Candidate consent tracking, deletion request lifecycle, and data retention governance.",
};

export default async function RetentionPage() {
  const user = await requireRetentionPageAuth();

  return (
    <RetentionClientView
      userRole={user.role}
      userId={user.id}
      userName={user.name}
    />
  );
}

