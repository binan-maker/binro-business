import type { UserRole } from "@/types/database.types";

export interface PropertyPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canChangeStatus: boolean;
  isWarden: boolean;
  isAdminOrOwner: boolean;
  accessiblePropertyIds: string[] | null; // null means all properties in business
}

/**
 * Determines whether the role can create a new property.
 * Under Supabase RLS Migration 002:
 * - "Admins can create properties" -> is_business_admin (owner, admin)
 * - Wardens CANNOT create properties.
 */
export function canCreateProperty(role?: UserRole | null): boolean {
  if (!role) return false;
  return role === "owner" || role === "admin";
}

/**
 * Determines whether the role can edit property name, address, or basic details.
 * Under Supabase RLS: only owners and admins.
 */
export function canEditProperty(role?: UserRole | null): boolean {
  if (!role) return false;
  return role === "owner" || role === "admin";
}

/**
 * Determines whether the role can change property status (active / inactive / archived).
 * Only owners and admins have UPDATE privilege on properties table.
 */
export function canChangePropertyStatus(role?: UserRole | null): boolean {
  if (!role) return false;
  return role === "owner" || role === "admin";
}

/**
 * Determines whether the role can delete/archive a property.
 * Only owners and admins have DELETE/ARCHIVE privilege on properties table.
 */
export function canDeleteProperty(role?: UserRole | null): boolean {
  if (!role) return false;
  return role === "owner" || role === "admin";
}

/**
 * Determines whether the user can view a given property.
 * Owners and admins can view all properties under the business.
 * Wardens can view only properties assigned to them in property_staff.
 */
export function canViewProperty(
  role: UserRole | null | undefined,
  propertyId: string,
  assignedPropertyIds?: string[] | null
): boolean {
  if (!role) return false;
  if (role === "owner" || role === "admin") return true;

  // For wardens: if they have specific assigned properties, check inclusion
  if (role === "warden") {
    if (!assignedPropertyIds || assignedPropertyIds.length === 0) {
      // If no assignments exist yet, warden cannot view unassigned properties
      return false;
    }
    return assignedPropertyIds.includes(propertyId);
  }

  return false;
}

/**
 * Builds a comprehensive permissions descriptor for the current user session.
 */
export function getPropertyPermissions(
  role: UserRole | null | undefined,
  assignedPropertyIds?: string[] | null
): PropertyPermissions {
  const isAdminOrOwner = role === "owner" || role === "admin";
  const isWarden = role === "warden";

  return {
    canCreate: isAdminOrOwner,
    canEdit: isAdminOrOwner,
    canDelete: isAdminOrOwner,
    canChangeStatus: isAdminOrOwner,
    isWarden,
    isAdminOrOwner,
    accessiblePropertyIds: isAdminOrOwner ? null : assignedPropertyIds || [],
  };
}
