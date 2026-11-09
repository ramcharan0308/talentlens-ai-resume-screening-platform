import { requirePageAuth } from "@/lib/page-auth";
import { UserRole } from "@prisma/client";
import { DeliveryDashboardClient } from "./delivery-dashboard-client";

export const metadata = {
  title: "Delivery Head Dashboard | TalentLens",
  description: "Operational analytics, recruiter productivity, requisition turnaround, and SLA tracking for TalentLens agency leadership.",
};

export default async function DeliveryDashboardPage() {
  const user = await requirePageAuth({
    callbackUrl: "/delivery/dashboard",
    allowedRoles: [UserRole.DELIVERY_HEAD],
  });

  return (
    <main className="container mx-auto py-8 px-4 sm:px-6 max-w-7xl">
      <DeliveryDashboardClient user={user} />
    </main>
  );
}

