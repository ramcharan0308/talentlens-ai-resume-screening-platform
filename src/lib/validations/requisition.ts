import { RequisitionStatus } from "@prisma/client";
import { CreateRequisitionInput, ScorecardCriterionInput } from "@/types";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  isValid: boolean;
  errors: ValidationError[];
  data?: T;
}

export function validateRequisitionInput(
  input: Partial<CreateRequisitionInput>,
  isCreate = true
): ValidationResult<Partial<CreateRequisitionInput>> {
  const errors: ValidationError[] = [];

  if (isCreate || input.title !== undefined) {
    if (!input.title || input.title.trim().length < 3) {
      errors.push({ field: "title", message: "Job title must be at least 3 characters long." });
    } else if (input.title.trim().length > 150) {
      errors.push({ field: "title", message: "Job title must not exceed 150 characters." });
    }
  }

  if (isCreate || input.jobDescription !== undefined) {
    if (!input.jobDescription || input.jobDescription.trim().length < 10) {
      errors.push({
        field: "jobDescription",
        message: "Job description must be at least 10 characters long.",
      });
    }
  }

  const minExp = input.minExperienceYears;
  const maxExp = input.maxExperienceYears;

  if (minExp !== undefined && minExp !== null) {
    if (minExp < 0 || isNaN(minExp)) {
      errors.push({ field: "minExperienceYears", message: "Minimum experience cannot be negative." });
    }
  }

  if (maxExp !== undefined && maxExp !== null) {
    if (maxExp < 0 || isNaN(maxExp)) {
      errors.push({ field: "maxExperienceYears", message: "Maximum experience cannot be negative." });
    }
  }

  if (
    minExp !== undefined &&
    minExp !== null &&
    maxExp !== undefined &&
    maxExp !== null &&
    !isNaN(minExp) &&
    !isNaN(maxExp)
  ) {
    if (minExp > maxExp) {
      errors.push({
        field: "maxExperienceYears",
        message: "Maximum experience must be greater than or equal to minimum experience.",
      });
    }
  }

  if (input.maxNoticeDays !== undefined && input.maxNoticeDays !== null) {
    if (input.maxNoticeDays < 0 || isNaN(input.maxNoticeDays)) {
      errors.push({ field: "maxNoticeDays", message: "Notice period cannot be negative." });
    }
  }

  if (input.status) {
    const validStatuses = Object.values(RequisitionStatus);
    if (!validStatuses.includes(input.status)) {
      errors.push({
        field: "status",
        message: `Status must be one of: ${validStatuses.join(", ")}`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0 ? input : undefined,
  };
}

export function validateScorecardCriteria(
  criteria: ScorecardCriterionInput[],
  requireHundredPercent = true
): ValidationResult<ScorecardCriterionInput[]> {
  const errors: ValidationError[] = [];

  if (requireHundredPercent && (!criteria || criteria.length === 0)) {
    errors.push({
      field: "scorecardCriteria",
      message: "At least one evaluation criterion is required to activate a requisition.",
    });
    return { isValid: false, errors };
  }

  let totalWeight = 0;

  criteria.forEach((crit, idx) => {
    if (!crit.name || crit.name.trim().length < 2) {
      errors.push({
        field: `scorecardCriteria[${idx}].name`,
        message: `Criterion #${idx + 1} name must be at least 2 characters.`,
      });
    }

    if (crit.weight === undefined || crit.weight === null || isNaN(crit.weight) || crit.weight < 0) {
      errors.push({
        field: `scorecardCriteria[${idx}].weight`,
        message: `Criterion "${crit.name || `#${idx + 1}`}" weight must be a non-negative number.`,
      });
    } else {
      totalWeight += Number(crit.weight);
    }

    const minScore = crit.minScore ?? 1;
    const maxScore = crit.maxScore ?? 10;
    if (minScore >= maxScore) {
      errors.push({
        field: `scorecardCriteria[${idx}].maxScore`,
        message: `Criterion "${crit.name || `#${idx + 1}`}" maximum score must be greater than minimum score.`,
      });
    }
  });

  if (requireHundredPercent && totalWeight !== 100) {
    errors.push({
      field: "scorecardCriteriaTotalWeight",
      message: `Total criteria weight must sum to exactly 100% (currently ${totalWeight}%).`,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0 ? criteria : undefined,
  };
}
