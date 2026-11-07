import type {
  RegisterTenantPayload,
  UpdateTenantProfilePayload,
  CheckOutPayload,
  TransferBedPayload,
} from "@/types/app.types";
import type { TenantGender } from "@/types/database.types";

export interface TenantValidationErrors {
  [key: string]: string | undefined;
}

export interface TenantValidationResult<T> {
  valid: boolean;
  errors: TenantValidationErrors;
  sanitized: T;
}

const VALID_GENDERS: TenantGender[] = ["male", "female", "other", "prefer_not_to_say"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CLEAN_REGEX = /[\s\-()+]/g;

/**
 * Validates complete registration and check-in input before calling the RPC.
 */
export function validateRegisterTenantInput(
  input: RegisterTenantPayload
): TenantValidationResult<RegisterTenantPayload> {
  const errors: TenantValidationErrors = {};

  const fullName = (input.p_full_name || "").trim();
  const phone = (input.p_phone || "").trim();
  const email = input.p_email ? input.p_email.trim() : null;
  const emergencyContact = input.p_emergency_contact ? input.p_emergency_contact.trim() : null;
  const emergencyContactName = input.p_emergency_contact_name ? input.p_emergency_contact_name.trim() : null;
  const address = input.p_address ? input.p_address.trim() : null;
  const tenantNotes = input.p_tenant_notes ? input.p_tenant_notes.trim() : null;
  const occupancyNotes = input.p_occupancy_notes ? input.p_occupancy_notes.trim() : null;
  const checkInDate = input.p_check_in_date || new Date().toISOString().split("T")[0];
  const expectedCheckOut = input.p_expected_check_out_date || null;
  const monthlyRent = Number(input.p_monthly_rent ?? 0);
  const securityDeposit = Number(input.p_security_deposit ?? 0);

  // 1. Full name
  if (!fullName) {
    errors.p_full_name = "Tenant full name is required.";
  } else if (fullName.length < 2) {
    errors.p_full_name = "Full name must be at least 2 characters.";
  } else if (fullName.length > 100) {
    errors.p_full_name = "Full name cannot exceed 100 characters.";
  }

  // 2. Phone number
  const cleanPhone = phone.replace(PHONE_CLEAN_REGEX, "");
  if (!phone) {
    errors.p_phone = "Mobile phone number is required.";
  } else if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    errors.p_phone = "Please enter a valid phone number (at least 10 digits).";
  }

  // 3. Email (optional)
  if (email && !EMAIL_REGEX.test(email)) {
    errors.p_email = "Please enter a valid email address.";
  }

  // 4. Gender (optional)
  if (input.p_gender && !VALID_GENDERS.includes(input.p_gender)) {
    errors.p_gender = `Gender must be one of: ${VALID_GENDERS.join(", ")}.`;
  }

  // 5. Hierarchy IDs
  if (!input.p_property_id) {
    errors.p_property_id = "Property selection is required.";
  }
  if (!input.p_room_id) {
    errors.p_room_id = "Room selection is required.";
  }
  if (!input.p_bed_id) {
    errors.p_bed_id = "Available bed selection is required.";
  }

  // 6. Rent & Deposit
  if (isNaN(monthlyRent) || monthlyRent < 0) {
    errors.p_monthly_rent = "Monthly rent must be a non-negative amount.";
  }
  if (isNaN(securityDeposit) || securityDeposit < 0) {
    errors.p_security_deposit = "Security deposit must be a non-negative amount.";
  }

  // 7. Dates
  if (!checkInDate || isNaN(Date.parse(checkInDate))) {
    errors.p_check_in_date = "Please enter a valid check-in date.";
  }

  if (expectedCheckOut) {
    if (isNaN(Date.parse(expectedCheckOut))) {
      errors.p_expected_check_out_date = "Please enter a valid expected check-out date.";
    } else if (expectedCheckOut < checkInDate) {
      errors.p_expected_check_out_date = "Expected check-out date cannot precede the check-in date.";
    }
  }

  // 8. Length caps on optional text fields
  if (address && address.length > 500) {
    errors.p_address = "Address cannot exceed 500 characters.";
  }
  if (emergencyContact && emergencyContact.length > 50) {
    errors.p_emergency_contact = "Emergency contact cannot exceed 50 characters.";
  }
  if (emergencyContactName && emergencyContactName.length > 100) {
    errors.p_emergency_contact_name = "Emergency contact name cannot exceed 100 characters.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      ...input,
      p_full_name: fullName,
      p_phone: phone,
      p_email: email,
      p_emergency_contact: emergencyContact,
      p_emergency_contact_name: emergencyContactName,
      p_address: address,
      p_tenant_notes: tenantNotes,
      p_occupancy_notes: occupancyNotes,
      p_check_in_date: checkInDate,
      p_expected_check_out_date: expectedCheckOut,
      p_monthly_rent: monthlyRent,
      p_security_deposit: securityDeposit,
    },
  };
}

/**
 * Validates restricted profile update input before invoking the RPC.
 */
export function validateUpdateTenantProfileInput(
  input: UpdateTenantProfilePayload
): TenantValidationResult<UpdateTenantProfilePayload> {
  const errors: TenantValidationErrors = {};

  const fullName = (input.p_full_name || "").trim();
  const phone = (input.p_phone || "").trim();
  const email = input.p_email ? input.p_email.trim() : null;
  const emergencyContact = input.p_emergency_contact ? input.p_emergency_contact.trim() : null;
  const emergencyContactName = input.p_emergency_contact_name ? input.p_emergency_contact_name.trim() : null;
  const address = input.p_address ? input.p_address.trim() : null;

  if (!input.p_tenant_id) {
    errors.p_tenant_id = "Tenant ID is required.";
  }

  if (!fullName) {
    errors.p_full_name = "Full name is required.";
  } else if (fullName.length < 2) {
    errors.p_full_name = "Full name must be at least 2 characters.";
  } else if (fullName.length > 100) {
    errors.p_full_name = "Full name cannot exceed 100 characters.";
  }

  const cleanPhone = phone.replace(PHONE_CLEAN_REGEX, "");
  if (!phone) {
    errors.p_phone = "Mobile phone number is required.";
  } else if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    errors.p_phone = "Please enter a valid phone number (at least 10 digits).";
  }

  if (email && !EMAIL_REGEX.test(email)) {
    errors.p_email = "Please enter a valid email address.";
  }

  if (address && address.length > 500) {
    errors.p_address = "Address cannot exceed 500 characters.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      p_tenant_id: input.p_tenant_id,
      p_full_name: fullName,
      p_phone: phone,
      p_email: email,
      p_emergency_contact: emergencyContact,
      p_emergency_contact_name: emergencyContactName,
      p_address: address,
    },
  };
}

/**
 * Validates checkout request.
 */
export function validateCheckOutInput(
  input: CheckOutPayload,
  checkInDate?: string | null
): { valid: boolean; errors: TenantValidationErrors; sanitized: CheckOutPayload } {
  const errors: TenantValidationErrors = {};
  const checkOutDate = input.check_out_date || new Date().toISOString().split("T")[0];

  if (!input.occupancy_id) {
    errors.occupancy_id = "Occupancy ID is required.";
  }

  if (!input.tenant_id) {
    errors.tenant_id = "Tenant ID is required.";
  }

  if (!checkOutDate || isNaN(Date.parse(checkOutDate))) {
    errors.check_out_date = "Please enter a valid check-out date.";
  } else if (checkInDate && checkOutDate < checkInDate) {
    errors.check_out_date = `Check-out date (${checkOutDate}) cannot be before check-in date (${checkInDate}).`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      ...input,
      check_out_date: checkOutDate,
      notes: input.notes ? input.notes.trim() : null,
    },
  };
}

/**
 * Validates bed transfer request.
 */
export function validateTransferBedInput(
  input: TransferBedPayload
): { valid: boolean; errors: TenantValidationErrors; sanitized: TransferBedPayload } {
  const errors: TenantValidationErrors = {};

  if (!input.occupancy_id) {
    errors.occupancy_id = "Occupancy ID is required.";
  }
  if (!input.new_room_id) {
    errors.new_room_id = "Destination room is required.";
  }
  if (!input.new_bed_id) {
    errors.new_bed_id = "Destination bed is required.";
  } else if (input.new_bed_id === input.current_bed_id) {
    errors.new_bed_id = "Destination bed must be different from current bed.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      ...input,
      notes: input.notes ? input.notes.trim() : null,
    },
  };
}
