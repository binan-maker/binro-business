import type { UserRole } from "@/types/database.types";

export interface TenantPermissions {
  canRegisterTenant: boolean;
  canEditTenantProfile: boolean;
  canCheckOutTenant: boolean;
  canTransferBed: boolean;
  canDeleteTenant: boolean; // Stage 010 UI explicitly disallows tenant deletion
  isWarden: boolean;
  isAdminOrOwner: boolean;
  accessiblePropertyIds: string[] | null; // null means all properties under the business
}

/**
 * Builds the UI tenant permissions for the active user session.
 * - Owner/Admin: Full business-wide tenant registration, editing, check-out, and transfers.
 * - Assigned Warden: Scoped strictly to assigned properties.
 * - Unassigned Warden: Read-only / no operational capabilities.
 * - Deletion: Explicitly disabled across all roles in Stage 010.
 */
export function getTenantPermissions(
  role?: UserRole | null,
  assignedPropertyIds?: string[] | null
): TenantPermissions {
  const isAdminOrOwner = role === "owner" || role === "admin";
  const isWarden = role === "warden";
  const isAssignedWarden = isWarden && Array.isArray(assignedPropertyIds) && assignedPropertyIds.length > 0;

  return {
    canRegisterTenant: isAdminOrOwner || isAssignedWarden,
    canEditTenantProfile: isAdminOrOwner || isAssignedWarden,
    canCheckOutTenant: isAdminOrOwner || isAssignedWarden,
    canTransferBed: isAdminOrOwner || isAssignedWarden,
    canDeleteTenant: false, // Stage 010 UI strict constraint
    isWarden,
    isAdminOrOwner,
    accessiblePropertyIds: isAdminOrOwner ? null : assignedPropertyIds || [],
  };
}

/**
 * Verifies if the user is authorized to register a tenant at a specific property.
 * Owners and Admins can register at any property in the business.
 * Wardens can only register at properties explicitly assigned to them.
 */
export function canRegisterAtProperty(
  permissions: TenantPermissions,
  propertyId: string
): boolean {
  if (permissions.isAdminOrOwner) return true;
  if (!permissions.isWarden) return false;
  return permissions.accessiblePropertyIds !== null && permissions.accessiblePropertyIds.includes(propertyId);
}

/**
 * Verifies if the user is authorized to view or manage a tenant associated with a property.
 */
export function canAccessTenantProperty(
  permissions: TenantPermissions,
  propertyId?: string | null
): boolean {
  if (permissions.isAdminOrOwner) return true;
  if (!propertyId || !permissions.isWarden) return false;
  return permissions.accessiblePropertyIds !== null && permissions.accessiblePropertyIds.includes(propertyId);
}

/**
 * Verifies if the user is authorized to perform check-out or bed transfer on an active stay at a property.
 */
export function canManageStay(
  permissions: TenantPermissions,
  occupancyPropertyId: string
): boolean {
  if (permissions.isAdminOrOwner) return true;
  if (!permissions.isWarden) return false;
  return permissions.accessiblePropertyIds !== null && permissions.accessiblePropertyIds.includes(occupancyPropertyId);
}
