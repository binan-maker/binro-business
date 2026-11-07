import type { RoomType, RoomStatus, BedStatus } from "@/types/database.types";
import type { FloorFormData, RoomFormData, BedFormData } from "@/types/app.types";

export interface ValidationResult<T> {
  valid: boolean;
  errors: Record<string, string>;
  sanitized: T;
}

/**
 * Validates floor creation and edit input.
 */
export function validateFloorInput(input: {
  name: string;
  floor_number?: number | null;
}): ValidationResult<FloorFormData> {
  const errors: Record<string, string> = {};
  const trimmedName = (input.name || "").trim();

  if (!trimmedName) {
    errors.name = "Floor name is required.";
  } else if (trimmedName.length > 50) {
    errors.name = "Floor name cannot exceed 50 characters.";
  }

  let floorNum: number | null = null;
  if (input.floor_number !== undefined && input.floor_number !== null && !isNaN(Number(input.floor_number))) {
    floorNum = parseInt(String(input.floor_number), 10);
    if (floorNum < -10 || floorNum > 100) {
      errors.floor_number = "Floor number must be between -10 and 100.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      name: trimmedName,
      floor_number: floorNum,
    },
  };
}

/**
 * Validates room creation and edit input.
 */
export function validateRoomInput(input: {
  room_number: string;
  room_type?: RoomType;
  floor_id?: string | null;
  status?: RoomStatus;
}): ValidationResult<RoomFormData> {
  const errors: Record<string, string> = {};
  const trimmedNumber = (input.room_number || "").trim();

  if (!trimmedNumber) {
    errors.room_number = "Room number is required.";
  } else if (trimmedNumber.length > 20) {
    errors.room_number = "Room number cannot exceed 20 characters.";
  }

  const validTypes: RoomType[] = ["single", "shared", "dormitory"];
  const roomType: RoomType = input.room_type && validTypes.includes(input.room_type) ? input.room_type : "shared";

  const validStatuses: RoomStatus[] = ["active", "inactive", "maintenance"];
  const status: RoomStatus = input.status && validStatuses.includes(input.status) ? input.status : "active";

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      room_number: trimmedNumber,
      room_type: roomType,
      floor_id: input.floor_id || null,
      status,
    },
  };
}

/**
 * Validates bed creation and edit input.
 */
export function validateBedInput(input: {
  bed_number: string;
  monthly_rent_rupees: number;
  status?: BedStatus;
}): ValidationResult<BedFormData> {
  const errors: Record<string, string> = {};
  const trimmedNumber = (input.bed_number || "").trim();

  if (!trimmedNumber) {
    errors.bed_number = "Bed label/number is required.";
  } else if (trimmedNumber.length > 20) {
    errors.bed_number = "Bed label cannot exceed 20 characters.";
  }

  const rentRupees = Number(input.monthly_rent_rupees);
  if (isNaN(rentRupees) || rentRupees < 0) {
    errors.monthly_rent = "Monthly rent must be a non-negative number.";
  }

  const validStatuses: BedStatus[] = ["available", "occupied", "maintenance", "inactive"];
  const status: BedStatus = input.status && validStatuses.includes(input.status) ? input.status : "available";

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      bed_number: trimmedNumber,
      monthly_rent: Math.round(Math.max(0, rentRupees) * 100), // convert to paise
      status,
    },
  };
}
