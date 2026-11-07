import type { PropertyStatus } from "@/types/database.types";
import type { PropertyFormData } from "@/types/app.types";

export interface PropertyValidationErrors {
  name?: string;
  address?: string;
  status?: string;
}

export interface PropertyValidationResult {
  valid: boolean;
  errors: PropertyValidationErrors;
  sanitized: PropertyFormData;
}

/**
 * Validates property creation and edit input.
 * Ensures data integrity and defense-in-depth before sending to Supabase.
 */
export function validatePropertyInput(input: {
  name: string;
  address?: string | null;
  status?: PropertyStatus;
}): PropertyValidationResult {
  const errors: PropertyValidationErrors = {};
  const trimmedName = (input.name || "").trim();
  const trimmedAddress = input.address !== undefined && input.address !== null ? input.address.trim() : null;

  // 1. Property Name validation
  if (!trimmedName) {
    errors.name = "Property name is required.";
  } else if (trimmedName.length < 2) {
    errors.name = "Property name must be at least 2 characters.";
  } else if (trimmedName.length > 100) {
    errors.name = "Property name cannot exceed 100 characters.";
  } else if (/^[^a-zA-Z0-9]+$/.test(trimmedName)) {
    errors.name = "Property name must include alphanumeric characters.";
  }

  // 2. Address validation (optional, but length-capped)
  if (trimmedAddress && trimmedAddress.length > 500) {
    errors.address = "Property address cannot exceed 500 characters.";
  }

  // 3. Status validation (active, inactive, archived)
  const validStatuses: PropertyStatus[] = ["active", "inactive", "archived"];
  if (input.status && !validStatuses.includes(input.status)) {
    errors.status = `Status must be one of: ${validStatuses.join(", ")}.`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      name: trimmedName,
      address: trimmedAddress || null,
      status: input.status || "active",
    },
  };
}
