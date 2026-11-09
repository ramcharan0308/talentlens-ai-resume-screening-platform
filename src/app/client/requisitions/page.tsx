import { requirePageAuth } from "@/lib/page-auth";
import { UserRole } from "@prisma/client";
import { ClientRequisitionsListView } from "./requisitions-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Assigned Requisitions - TalentLens Client Portal",
  description: "View requisitions assigned to your organization.",
};

export default async function ClientRequisitionsPage() {
  const user = await requirePageAuth({
    callbackUrl: "/client/requisitions",
    allowedRoles: [UserRole.CLIENT_HIRING_MGR],
  });

  return <ClientRequisitionsListView user={user} />;
}

