import type {
  RecordPaymentPayload,
  PaymentAllocationItem,
  PaymentMethod,
} from "@/types/app.types";

export interface PaymentValidationErrors {
  [key: string]: string | undefined;
}

export interface PaymentValidationResult<T> {
  valid: boolean;
  errors: PaymentValidationErrors;
  sanitized: T;
}

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "upi",
  "bank_transfer",
  "other",
];

/**
 * Validates a database entity identifier (UUID or non-empty string token).
 */
export function isValidId(id?: string | null): boolean {
  if (!id || typeof id !== "string") return false;
  const trimmed = id.trim();
  return trimmed.length > 0 && trimmed.length <= 64;
}

/**
 * Validates an ISO timestamp or datetime string.
 */
export function isValidDateTimeString(dtStr?: string | null): boolean {
  if (!dtStr || typeof dtStr !== "string") return false;
  const parsed = new Date(dtStr);
  return !isNaN(parsed.getTime());
}

/**
 * Validates input for recording a manual payment and optional rent allocations.
 *
 * Rules:
 * - business_id, property_id, tenant_id must be valid non-empty IDs.
 * - amount must be a positive integer in paise (> 0).
 * - payment_method must be one of 'cash', 'upi', 'bank_transfer', 'other'.
 * - paid_at must be a valid ISO date/datetime string.
 * - transaction_reference is optional but capped at 100 characters.
 * - notes is optional but capped at 1000 characters.
 * - allocations:
 *   - Each item must have a valid rent_charge_id.
 *   - Each allocated_amount must be a positive integer in paise (> 0).
 *   - No duplicate rent_charge_id across the allocations array.
 *   - Sum of allocated_amount across all items must not exceed the payment amount.
 */
export function validateRecordPaymentInput(
  input: RecordPaymentPayload
): PaymentValidationResult<RecordPaymentPayload> {
  const errors: PaymentValidationErrors = {};

  const businessId = (input.business_id || "").trim();
  const propertyId = (input.property_id || "").trim();
  const tenantId = (input.tenant_id || "").trim();
  const rawAmount = input.amount;
  const method = input.payment_method;
  const reference = input.transaction_reference ? input.transaction_reference.trim() : null;
  const notes = input.notes ? input.notes.trim() : null;
  const paidAt = input.paid_at ? input.paid_at.trim() : new Date().toISOString();

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

  // 2. Amount in Paise
  const numAmount = Number(rawAmount);
  if (
    rawAmount === undefined ||
    rawAmount === null ||
    isNaN(numAmount) ||
    !Number.isInteger(numAmount) ||
    numAmount <= 0
  ) {
    errors.amount = "Payment amount must be a positive integer in paise (e.g., 850000 for ₹8,500).";
  }

  // 3. Payment Method
  if (!method || !VALID_PAYMENT_METHODS.includes(method)) {
    errors.payment_method = `Payment method must be one of: ${VALID_PAYMENT_METHODS.join(", ")}.`;
  }

  // 4. Payment Timestamp
  if (!isValidDateTimeString(paidAt)) {
    errors.paid_at = "Payment date and time must be a valid timestamp.";
  }

  // 5. Transaction Reference & Notes Caps
  if (reference && reference.length > 100) {
    errors.transaction_reference = "Transaction reference cannot exceed 100 characters.";
  }
  if (notes && notes.length > 1000) {
    errors.notes = "Notes cannot exceed 1000 characters.";
  }

  // 6. Allocations Validation
  const sanitizedAllocations: PaymentAllocationItem[] = [];
  if (input.allocations && input.allocations.length > 0) {
    let totalAllocatedPaise = 0;
    const seenRentChargeIds = new Set<string>();

    input.allocations.forEach((alloc, idx) => {
      const chargeId = (alloc.rent_charge_id || "").trim();
      const rawAllocAmount = alloc.allocated_amount;
      const numAllocAmount = Number(rawAllocAmount);

      if (!isValidId(chargeId)) {
        errors[`allocations[${idx}].rent_charge_id`] = "Valid rent charge identifier is required.";
      } else if (seenRentChargeIds.has(chargeId)) {
        errors[`allocations[${idx}].rent_charge_id`] = "Duplicate rent charge in allocation list.";
      } else {
        seenRentChargeIds.add(chargeId);
      }

      if (
        rawAllocAmount === undefined ||
        rawAllocAmount === null ||
        isNaN(numAllocAmount) ||
        !Number.isInteger(numAllocAmount) ||
        numAllocAmount <= 0
      ) {
        errors[`allocations[${idx}].allocated_amount`] =
          "Allocated amount must be a positive integer in paise.";
      } else {
        totalAllocatedPaise += numAllocAmount;
        sanitizedAllocations.push({
          rent_charge_id: chargeId,
          allocated_amount: numAllocAmount,
        });
      }
    });

    if (numAmount > 0 && totalAllocatedPaise > numAmount) {
      errors.allocations = `Total allocated amount (₹${(totalAllocatedPaise / 100).toLocaleString("en-IN")}) exceeds total payment amount (₹${(numAmount / 100).toLocaleString("en-IN")}).`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      business_id: businessId,
      property_id: propertyId,
      tenant_id: tenantId,
      amount: numAmount > 0 && Number.isInteger(numAmount) ? numAmount : 0,
      payment_method: method,
      transaction_reference: reference || null,
      notes: notes || null,
      paid_at: paidAt,
      auto_allocate: Boolean(input.auto_allocate),
      allocations: sanitizedAllocations.length > 0 ? sanitizedAllocations : undefined,
    },
  };
}

/**
 * Validates standalone payment allocation input and financial integrity constraints.
 */
export function validatePaymentAllocationInput(input: {
  payment_id: string;
  rent_charge_id: string;
  allocated_amount: number;
  available_payment_paise?: number;
  outstanding_rent_paise?: number;
  payment_status?: string;
  rent_charge_status?: string;
  payment_business_id?: string;
  rent_charge_business_id?: string;
  payment_property_id?: string;
  rent_charge_property_id?: string;
  payment_tenant_id?: string;
  rent_charge_tenant_id?: string;
  is_duplicate?: boolean;
}): PaymentValidationResult<{
  payment_id: string;
  rent_charge_id: string;
  allocated_amount: number;
}> {
  const errors: PaymentValidationErrors = {};
  const paymentId = (input.payment_id || "").trim();
  const chargeId = (input.rent_charge_id || "").trim();
  const numAllocAmount = Number(input.allocated_amount);

  if (!isValidId(paymentId)) {
    errors.payment_id = "Payment identifier is required.";
  }
  if (!isValidId(chargeId)) {
    errors.rent_charge_id = "Rent charge identifier is required.";
  }

  // 1. Positive Integer Amount in Paise
  if (
    input.allocated_amount === undefined ||
    input.allocated_amount === null ||
    isNaN(numAllocAmount) ||
    !Number.isInteger(numAllocAmount) ||
    numAllocAmount <= 0
  ) {
    errors.allocated_amount = "Allocated amount must be a positive integer in paise.";
  } else {
    if (
      input.available_payment_paise !== undefined &&
      numAllocAmount > input.available_payment_paise
    ) {
      errors.allocated_amount = `Allocation (₹${(numAllocAmount / 100).toLocaleString("en-IN")}) exceeds available payment balance (₹${(input.available_payment_paise / 100).toLocaleString("en-IN")}).`;
    }
    if (
      input.outstanding_rent_paise !== undefined &&
      numAllocAmount > input.outstanding_rent_paise
    ) {
      errors.allocated_amount = `Allocation (₹${(numAllocAmount / 100).toLocaleString("en-IN")}) exceeds outstanding rent bill due (₹${(input.outstanding_rent_paise / 100).toLocaleString("en-IN")}).`;
    }
  }

  // 2. Payment Status Check
  if (input.payment_status && input.payment_status !== "received") {
    errors.payment_status = `Cannot allocate a payment with status '${input.payment_status}'. Only received payments can be allocated.`;
  }

  // 3. Rent Charge Status Check
  if (input.rent_charge_status === "waived") {
    errors.rent_charge_status = "Cannot allocate payments to a waived rent charge.";
  } else if (input.rent_charge_status === "paid") {
    errors.rent_charge_status = "Rent charge is already fully paid.";
  }

  // 4. Duplicate Check
  if (input.is_duplicate) {
    errors.duplicate = "An allocation already exists linking this payment to this rent charge.";
  }

  // 5. Relationship Matching (Same Business, Property, Tenant)
  if (
    input.payment_business_id &&
    input.rent_charge_business_id &&
    input.payment_business_id !== input.rent_charge_business_id
  ) {
    errors.business_match = "Payment and rent charge do not belong to the same business.";
  }
  if (
    input.payment_property_id &&
    input.rent_charge_property_id &&
    input.payment_property_id !== input.rent_charge_property_id
  ) {
    errors.property_match = "Payment and rent charge belong to different properties.";
  }
  if (
    input.payment_tenant_id &&
    input.rent_charge_tenant_id &&
    input.payment_tenant_id !== input.rent_charge_tenant_id
  ) {
    errors.tenant_match = "Payment and rent charge belong to different tenants.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      payment_id: paymentId,
      rent_charge_id: chargeId,
      allocated_amount: numAllocAmount > 0 && Number.isInteger(numAllocAmount) ? numAllocAmount : 0,
    },
  };
}

/**
 * Validates payment reversal input.
 */
export function validateReversePaymentInput(input: {
  payment_id: string;
  reason?: string | null;
}): PaymentValidationResult<{ payment_id: string; reason: string | null }> {
  const errors: PaymentValidationErrors = {};
  const paymentId = (input.payment_id || "").trim();
  const reason = input.reason ? input.reason.trim() : null;

  if (!isValidId(paymentId)) {
    errors.payment_id = "Payment identifier is required.";
  }
  if (reason && reason.length > 500) {
    errors.reason = "Reversal reason cannot exceed 500 characters.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      payment_id: paymentId,
      reason,
    },
  };
}
