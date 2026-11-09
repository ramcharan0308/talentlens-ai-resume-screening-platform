import { requireResumeUploadPageAuth } from "@/lib/page-auth";
import { ResumeUploadClientView } from "./resume-upload-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bulk Resume Upload - TalentLens",
  description: "Bulk resume upload, anti-bias text extraction, and candidate ingestion.",
};

export default async function ResumeUploadPage() {
  await requireResumeUploadPageAuth();

  return <ResumeUploadClientView />;
}
