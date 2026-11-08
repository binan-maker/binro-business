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

/**
 * Normalizes Indian mobile phone numbers to standard E.164 format (+91XXXXXXXXXX).
 * Accepts:
 * - 10-digit mobile number: e.g. "9876543210" or "98765 43210" -> "+919876543210"
 * - Number with +91: e.g. "+919876543210" or "+91 98765 43210" -> "+919876543210"
 * - Number with 91 prefix: e.g. "919876543210" -> "+919876543210"
 * - Number with 0 prefix: e.g. "09876543210" -> "+919876543210"
 * Rejects numbers with non-10 digit local number or non-matching Indian mobile conventions.
 */
export function normalizeIndianPhone(phoneInput: string): {
  valid: boolean;
  phone: string;
  error?: string;
} {
  if (!phoneInput || typeof phoneInput !== "string") {
    return { valid: false, phone: "", error: "Mobile phone number is required." };
  }

  const trimmed = phoneInput.trim();
  const stripped = trimmed.replace(/[\s\-\(\)\.]/g, "");

  let digitsOnly = stripped;
  if (stripped.startsWith("+")) {
    digitsOnly = stripped.slice(1);
  }

  if (!/^\d+$/.test(digitsOnly)) {
    return { valid: false, phone: trimmed, error: "Phone number contains invalid characters." };
  }

  let tenDigitNumber = "";

  if (digitsOnly.length === 10) {
    tenDigitNumber = digitsOnly;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    tenDigitNumber = digitsOnly.slice(1);
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    tenDigitNumber = digitsOnly.slice(2);
  } else {
    return {
      valid: false,
      phone: trimmed,
      error: "Please enter a valid 10-digit Indian mobile number.",
    };
  }

  if (!/^[6-9]\d{9}$/.test(tenDigitNumber)) {
    return {
      valid: false,
      phone: trimmed,
      error: "Indian mobile numbers must be 10 digits starting with 6, 7, 8, or 9.",
    };
  }

  return {
    valid: true,
    phone: `+91${tenDigitNumber}`,
  };
}

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
  const phoneNorm = normalizeIndianPhone(phone);
  if (!phone) {
    errors.p_phone = "Mobile phone number is required.";
  } else if (!phoneNorm.valid) {
    errors.p_phone = phoneNorm.error || "Please enter a valid 10-digit Indian mobile number.";
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
      p_phone: phoneNorm.valid ? phoneNorm.phone : phone,
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

  const phoneNorm = normalizeIndianPhone(phone);
  if (!phone) {
    errors.p_phone = "Mobile phone number is required.";
  } else if (!phoneNorm.valid) {
    errors.p_phone = phoneNorm.error || "Please enter a valid 10-digit Indian mobile number.";
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
      p_phone: phoneNorm.valid ? phoneNorm.phone : phone,
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

  if (
    input.new_monthly_rent !== undefined &&
    (isNaN(input.new_monthly_rent) || input.new_monthly_rent < 0)
  ) {
    errors.new_monthly_rent = "New monthly rent must be a non-negative amount.";
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
