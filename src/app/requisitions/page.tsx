import { requirePageAuth } from "@/lib/page-auth";
import { RequisitionsClientView } from "./requisitions-client";

export const metadata = {
  title: "Requisitions Pipeline - TalentLens",
  description: "Manage staffing requisitions and scorecard criteria.",
};

export default async function RequisitionsPage() {
  const user = await requirePageAuth({
    callbackUrl: "/requisitions",
  });

  return <RequisitionsClientView userRole={user.role} />;
}
