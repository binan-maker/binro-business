import type { UserRole, BedStatus } from "@/types/database.types";
import type { FloorWithStats, RoomWithDetails, BedWithOccupant } from "@/types/app.types";

export interface InventoryPermissions {
  canCreateFloor: boolean;
  canEditFloor: boolean;
  canDeleteFloor: boolean;
  canCreateRoom: boolean;
  canEditRoom: boolean;
  canDeleteRoom: boolean;
  canCreateBed: boolean;
  canEditBed: boolean;
  canDeleteBed: boolean;
  isWarden: boolean;
  isAdminOrOwner: boolean;
}

/**
 * Resolves permissions for floors, rooms, and beds based on user role.
 * Under Supabase RLS Migration 002:
 * - can_manage_property(property_id) requires is_business_admin (owner or admin).
 * - Wardens have SELECT only via is_property_staff(property_id).
 */
export function getInventoryPermissions(role?: UserRole | null): InventoryPermissions {
  const isAdminOrOwner = role === "owner" || role === "admin";
  const isWarden = role === "warden";

  return {
    canCreateFloor: isAdminOrOwner,
    canEditFloor: isAdminOrOwner,
    canDeleteFloor: isAdminOrOwner,
    canCreateRoom: isAdminOrOwner,
    canEditRoom: isAdminOrOwner,
    canDeleteRoom: isAdminOrOwner,
    canCreateBed: isAdminOrOwner,
    canEditBed: isAdminOrOwner,
    canDeleteBed: isAdminOrOwner,
    isWarden,
    isAdminOrOwner,
  };
}

/**
 * Checks if a floor can safely be deleted.
 * Prevents accidental or cascading deletion if rooms exist.
 */
export function canDeleteFloorSafely(floor: FloorWithStats): { canDelete: boolean; reason?: string } {
  if (floor.roomsCount > 0) {
    return {
      canDelete: false,
      reason: `Floor "${floor.name}" has ${floor.roomsCount} room(s) assigned. Delete or move the rooms before deleting this floor.`,
    };
  }
  return { canDelete: true };
}

/**
 * Checks if a room can safely be deleted.
 * Prevents deletion if any beds in the room are currently occupied.
 */
export function canDeleteRoomSafely(room: RoomWithDetails): { canDelete: boolean; reason?: string } {
  if (room.bedsOccupied > 0) {
    return {
      canDelete: false,
      reason: `Room ${room.room_number} has ${room.bedsOccupied} active occupant(s). Check out all occupants in Tenants before deleting this room.`,
    };
  }
  return { canDelete: true };
}

/**
 * Checks if a bed can safely be deleted.
 * Prevents deletion if bed is occupied.
 */
export function canDeleteBedSafely(bed: BedWithOccupant): { canDelete: boolean; reason?: string } {
  if (bed.status === "occupied" || bed.current_occupant) {
    return {
      canDelete: false,
      reason: `Bed ${bed.bed_number} is currently occupied by an active tenant. Check out the tenant in Tenants to remove this bed.`,
    };
  }
  return { canDelete: true };
}

/**
 * Checks if a bed's status can be manually updated.
 * Rule 5: Database occupancy trigger is authoritative.
 * Never change a bed from occupied to available while an active occupancy exists.
 */
export function canChangeBedStatusSafely(
  bed: BedWithOccupant,
  newStatus: BedStatus
): { canChange: boolean; reason?: string } {
  if (bed.status === "occupied" && newStatus !== "occupied") {
    return {
      canChange: false,
      reason: `Bed ${bed.bed_number} is actively occupied. Its status is automatically managed by tenant check-in/out records.`,
    };
  }
  return { canChange: true };
}
