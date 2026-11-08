import type { UserRole } from "@/types/database.types";

export interface RentPermissions {
  canViewRent: boolean;
  canGenerateBill: boolean;
  canEditBill: boolean;
  canWaiveBill: boolean;
  canDeleteBill: boolean;
  isWarden: boolean;
  isAdminOrOwner: boolean;
  accessiblePropertyIds: string[] | null; // null means all properties under the business (Owner/Admin)
}

/**
 * Builds the UI rent permissions descriptor for the active user session.
 *
 * Rules:
 * - Owner/Admin: Full business-wide visibility, bill generation, waivers, and deletion.
 * - Assigned Warden: Scoped strictly to assigned properties for viewing, bill generation, and editing.
 * - Unassigned Warden: Blocked (fails closed with accessiblePropertyIds = []).
 * - Administrative Actions: Rent waivers and deletion are restricted to Owners/Admins
 *   (aligning with Postgres RLS policy "Admins can delete rent charges").
 */
export function getRentPermissions(
  role?: UserRole | null,
  assignedPropertyIds?: string[] | null
): RentPermissions {
  const isAdminOrOwner = role === "owner" || role === "admin";
  const isWarden = role === "warden";
  const isAssignedWarden = isWarden && Array.isArray(assignedPropertyIds) && assignedPropertyIds.length > 0;

  return {
    canViewRent: isAdminOrOwner || isAssignedWarden,
    canGenerateBill: isAdminOrOwner || isAssignedWarden,
    canEditBill: isAdminOrOwner || isAssignedWarden,
    canWaiveBill: isAdminOrOwner, // Strict Owner/Admin only
    canDeleteBill: isAdminOrOwner, // Strict Owner/Admin only (Database RLS enforces is_business_admin)
    isWarden,
    isAdminOrOwner,
    accessiblePropertyIds: isAdminOrOwner ? null : assignedPropertyIds || [],
  };
}

/**
 * Verifies if the user is authorized to view or access rent charges for a specific property.
 * Owners and Admins can access all properties under the business.
 * Wardens can only access properties explicitly assigned to them.
 */
export function canAccessRentProperty(
  permissions: RentPermissions,
  propertyId?: string | null
): boolean {
  if (permissions.isAdminOrOwner) return true;
  if (!propertyId || !permissions.isWarden) return false;
  return permissions.accessiblePropertyIds !== null && permissions.accessiblePropertyIds.includes(propertyId);
}

/**
 * Verifies if the user is authorized to generate a rent charge at a specific property.
 * Owners and Admins can generate bills at any property in the business.
 * Wardens can only generate bills at their assigned properties.
 */
export function canGenerateBillAtProperty(
  permissions: RentPermissions,
  propertyId: string
): boolean {
  if (!permissions.canGenerateBill) return false;
  return canAccessRentProperty(permissions, propertyId);
}

/**
 * Verifies if the user is authorized to edit a rent bill.
 * Owners and Admins can edit bills at any property.
 * Wardens can edit bills (description/notes) only at their assigned properties.
 */
export function canEditBillAtProperty(
  permissions: RentPermissions,
  propertyId?: string | null
): boolean {
  if (!permissions.canEditBill) return false;
  return canAccessRentProperty(permissions, propertyId);
}

/**
 * Verifies if the user is authorized to waive a rent bill.
 * Only Owners and Admins can perform rent waivers.
 */
export function canWaiveBillAtProperty(
  permissions: RentPermissions,
  propertyId?: string | null
): boolean {
  if (!permissions.canWaiveBill) return false;
  return canAccessRentProperty(permissions, propertyId);
}

/**
 * Verifies if the user is authorized to delete a rent bill.
 * Only Owners and Admins can delete rent bills (enforces RLS parity).
 */
export function canDeleteBillAtProperty(
  permissions: RentPermissions,
  propertyId?: string | null
): boolean {
  if (!permissions.canDeleteBill) return false;
  return canAccessRentProperty(permissions, propertyId);
}

