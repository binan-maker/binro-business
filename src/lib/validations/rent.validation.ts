import type { CreateRentChargePayload } from "@/types/app.types";

export interface RentValidationErrors {
  [key: string]: string | undefined;
}

export interface RentValidationResult<T> {
  valid: boolean;
  errors: RentValidationErrors;
  sanitized: T;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates whether a string is a well-formed ISO calendar date (YYYY-MM-DD).
 */
export function isValidDateString(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  const trimmed = dateStr.trim();
  if (!DATE_REGEX.test(trimmed)) return false;
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return false;
  // Ensure components match to catch invalid days like Feb 31st
  const [y, m, d] = trimmed.split("-").map(Number);
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() + 1 === m &&
    parsed.getUTCDate() === d
  );
}

/**
 * Validates a database entity identifier (UUID or non-empty string token).
 */
export function isValidId(id?: string | null): boolean {
  if (!id || typeof id !== "string") return false;
  const trimmed = id.trim();
  return trimmed.length > 0 && trimmed.length <= 64;
}

/**
 * Validates input for creating a single rent charge.
 *
 * Rules:
 * - business_id, property_id, tenant_id, occupancy_id must be valid non-empty IDs.
 * - period_start and period_end must be valid YYYY-MM-DD dates.
 * - period_end must be on or after period_start (period_end >= period_start).
 * - due_date must be a valid YYYY-MM-DD date.
 * - amount must be a positive integer representing paise (> 0).
 * - description and notes are capped at reasonable string limits.
 */
export function validateCreateRentChargeInput(
  input: CreateRentChargePayload
): RentValidationResult<CreateRentChargePayload> {
  const errors: RentValidationErrors = {};

  const businessId = (input.business_id || "").trim();
  const propertyId = (input.property_id || "").trim();
  const tenantId = (input.tenant_id || "").trim();
  const occupancyId = (input.occupancy_id || "").trim();
  const periodStart = (input.period_start || "").trim();
  const periodEnd = (input.period_end || "").trim();
  const dueDate = (input.due_date || "").trim();
  const rawAmount = input.amount;
  const description = input.description ? input.description.trim() : null;
  const notes = input.notes ? input.notes.trim() : null;

  // 1. Required Identifiers
  if (!isValidId(businessId)) {
    errors.business_id = "Business identifier is required.";
  }
  if (!isValidId(propertyId)) {
    errors.property_id = "Property identifier is required.";
  }
  if (!isValidId(tenantId)) {
    errors.tenant_id = "Tenant identifier is required.";
  }
  if (!isValidId(occupancyId)) {
    errors.occupancy_id = "Occupancy identifier is required.";
  }

  // 2. Billing Period Dates
  if (!isValidDateString(periodStart)) {
    errors.period_start = "Period start date must be a valid date in YYYY-MM-DD format.";
  }
  if (!isValidDateString(periodEnd)) {
    errors.period_end = "Period end date must be a valid date in YYYY-MM-DD format.";
  }

  if (isValidDateString(periodStart) && isValidDateString(periodEnd)) {
    if (periodEnd < periodStart) {
      errors.period_end = `Period end date (${periodEnd}) cannot precede period start date (${periodStart}).`;
    }
  }

  // 3. Due Date
  if (!isValidDateString(dueDate)) {
    errors.due_date = "Due date must be a valid date in YYYY-MM-DD format.";
  }

  // 4. Amount in Paise
  const numAmount = Number(rawAmount);
  if (
    rawAmount === undefined ||
    rawAmount === null ||
    isNaN(numAmount) ||
    !Number.isInteger(numAmount) ||
    numAmount <= 0
  ) {
    errors.amount = "Amount must be a positive integer in paise (e.g., 850000 for ₹8,500).";
  }

  // 5. Length caps on optional text fields
  if (description && description.length > 255) {
    errors.description = "Description cannot exceed 255 characters.";
  }
  if (notes && notes.length > 1000) {
    errors.notes = "Notes cannot exceed 1000 characters.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      business_id: businessId,
      property_id: propertyId,
      tenant_id: tenantId,
      occupancy_id: occupancyId,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate,
      amount: numAmount > 0 && Number.isInteger(numAmount) ? numAmount : 0,
      description: description || null,
      notes: notes || null,
    },
  };
}

/**
 * Validates input for waiving a rent charge.
 */
export function validateWaiveRentChargeInput(input: {
  rent_charge_id: string;
  reason?: string | null;
}): RentValidationResult<{ rent_charge_id: string; reason: string | null }> {
  const errors: RentValidationErrors = {};
  const chargeId = (input.rent_charge_id || "").trim();
  const reason = input.reason ? input.reason.trim() : null;

  if (!isValidId(chargeId)) {
    errors.rent_charge_id = "Rent charge identifier is required.";
  }
  if (reason && reason.length > 500) {
    errors.reason = "Waiver reason cannot exceed 500 characters.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      rent_charge_id: chargeId,
      reason,
    },
  };
}

/**
 * Validates input for operational rent charge updates (e.g. description, notes, and amount).
 */
export function validateUpdateRentChargeInput(input: {
  rent_charge_id: string;
  description?: string | null;
  notes?: string | null;
  amount?: number | null;
}): RentValidationResult<{
  rent_charge_id: string;
  description: string | null;
  notes: string | null;
  amount?: number;
}> {
  const errors: RentValidationErrors = {};
  const chargeId = (input.rent_charge_id || "").trim();
  const description = input.description !== undefined && input.description !== null ? input.description.trim() : null;
  const notes = input.notes !== undefined && input.notes !== null ? input.notes.trim() : null;

  if (!isValidId(chargeId)) {
    errors.rent_charge_id = "Rent charge identifier is required.";
  }
  if (description && description.length > 255) {
    errors.description = "Description cannot exceed 255 characters.";
  }
  if (notes && notes.length > 1000) {
    errors.notes = "Notes cannot exceed 1000 characters.";
  }

  let sanitizedAmount: number | undefined = undefined;
  if (input.amount !== undefined && input.amount !== null) {
    const numAmount = Number(input.amount);
    if (isNaN(numAmount) || !Number.isInteger(numAmount) || numAmount <= 0) {
      errors.amount = "Amount must be a positive integer in paise (e.g., 850000 for ₹8,500).";
    } else {
      sanitizedAmount = numAmount;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      rent_charge_id: chargeId,
      description,
      notes,
      amount: sanitizedAmount,
    },
  };
}

