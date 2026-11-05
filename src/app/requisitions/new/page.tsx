import { RequisitionForm } from "@/components/requisitions/requisition-form";

export const metadata = {
  title: "Create Requisition - TalentLens",
  description: "Create and configure a new staffing requisition and scorecard evaluation criteria.",
};

export default function NewRequisitionPage() {
  return (
    <div className="container py-8 max-w-5xl">
      <RequisitionForm />
    </div>
  );
}
