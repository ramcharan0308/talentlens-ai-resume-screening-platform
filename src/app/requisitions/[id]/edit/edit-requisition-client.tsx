"use client";

import * as React from "react";
import { RequisitionForm } from "@/components/requisitions/requisition-form";
import { CreateRequisitionInput } from "@/types";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EditRequisitionClientView({
  id,
  initialData,
}: {
  id: string;
  initialData?: any;
}) {
  const [data, setData] = React.useState<
    (Partial<CreateRequisitionInput> & { id: string }) | null
  >(initialData ?? null);
  const [isLoading, setIsLoading] = React.useState(!initialData);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialData) return;

    async function loadData() {
      if (!id) return;
      try {
        const res = await fetch(`/api/requisitions/${id}`);
        const json = await res.json();
        if (json.success && json.data) {
          setData({
            id: json.data.id,
            title: json.data.title,
            department: json.data.department,
            location: json.data.location,
            minExperienceYears: json.data.minExperienceYears,
            maxExperienceYears: json.data.maxExperienceYears,
            maxNoticeDays: json.data.maxNoticeDays,
            targetSalaryRange: json.data.targetSalaryRange,
            coreSkills: json.data.coreSkills,
            jobDescription: json.data.jobDescription,
            status: json.data.status,
            clientOrganizationId: json.data.clientOrganizationId,
            scorecardCriteria: json.data.scorecardCriteria,
          });
        } else {
          setError(json.error || "Failed to load requisition data.");
        }
      } catch (err) {
        console.error("Failed to load requisition:", err);
        setError("Network error loading requisition.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [id, initialData]);

  if (isLoading) {
    return (
      <div className="container py-10 max-w-5xl space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-10 w-96 bg-muted rounded" />
          <div className="h-64 w-full bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container py-12 max-w-5xl text-center space-y-4">
        <h2 className="text-xl font-bold">Error Loading Requisition</h2>
        <p className="text-xs text-muted-foreground">{error || "Requisition not found."}</p>
        <Link href="/requisitions">
          <Button size="sm">Back to Requisitions</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-5xl">
      <RequisitionForm initialData={data} isEdit={true} />
    </div>
  );
}

