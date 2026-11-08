import { requirePageAuth } from "@/lib/page-auth";
import { UserRole } from "@prisma/client";
import { ClientDashboardView } from "./client-dashboard";

export const metadata = {
  title: "Client Hiring Portal - TalentLens",
  description: "Review candidates submitted for your requisitions.",
};

export default async function ClientPortalPage() {
  const user = await requirePageAuth({
    callbackUrl: "/client",
    allowedRoles: [UserRole.CLIENT_HIRING_MGR],
  });

  return <ClientDashboardView user={user} />;
}

