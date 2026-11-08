import type { UserRole } from "@/types/database.types";

export interface PaymentPermissions {
  canViewPayments: boolean;
  canRecordPayment: boolean;
  canAllocatePayment: boolean;
  canRemoveAllocation: boolean;
  canReversePayment: boolean;
  canDeletePayment: boolean; // Strictly false across all roles (payments table has no DELETE policy in RLS)
  isWarden: boolean;
  isAdminOrOwner: boolean;
  accessiblePropertyIds: string[] | null; // null means all properties under the business (Owner/Admin)
}

/**
 * Builds the UI payment permissions descriptor for the active user session.
 *
 * Rules:
 * - Owner/Admin: Full business-wide viewing, recording, allocating, and reversals.
 * - Assigned Warden: Scoped strictly to assigned properties for viewing, recording, and allocating payments.
 * - Unassigned Warden: Blocked (fails closed with accessiblePropertyIds = []).
 * - Administrative Actions: Reversing payments and deleting payment allocations are strictly restricted to Owners/Admins
 *   (aligning with Postgres RLS policies "Admins can update payments" and "Admins can delete payment allocations").
 * - Payment Deletion: Explicitly disabled for all roles. Payments represent immutable financial ledger records.
 */
export function getPaymentPermissions(
  role?: UserRole | null,
  assignedPropertyIds?: string[] | null
): PaymentPermissions {
  const isAdminOrOwner = role === "owner" || role === "admin";
  const isWarden = role === "warden";
  const isAssignedWarden = isWarden && Array.isArray(assignedPropertyIds) && assignedPropertyIds.length > 0;

  return {
    canViewPayments: isAdminOrOwner || isAssignedWarden,
    canRecordPayment: isAdminOrOwner || isAssignedWarden,
    canAllocatePayment: isAdminOrOwner || isAssignedWarden,
    canRemoveAllocation: isAdminOrOwner, // Strict Owner/Admin only (RLS: Admins can delete payment allocations)
    canReversePayment: isAdminOrOwner, // Strict Owner/Admin only (RLS: Admins can update payments)
    canDeletePayment: false, // Disallowed across all roles (audit preservation)
    isWarden,
    isAdminOrOwner,
    accessiblePropertyIds: isAdminOrOwner ? null : assignedPropertyIds || [],
  };
}

/**
 * Verifies if the user is authorized to view or access payment receipts for a specific property.
 * Owners and Admins can access all properties under the business.
 * Wardens can only access properties explicitly assigned to them.
 */
export function canAccessPaymentProperty(
  permissions: PaymentPermissions,
  propertyId?: string | null
): boolean {
  if (permissions.isAdminOrOwner) return true;
  if (!propertyId || !permissions.isWarden) return false;
  return permissions.accessiblePropertyIds !== null && permissions.accessiblePropertyIds.includes(propertyId);
}

/**
 * Verifies if the user is authorized to record a payment at a specific property.
 * Owners and Admins can record payments at any property in the business.
 * Wardens can only record payments at their assigned properties.
 */
export function canRecordPaymentAtProperty(
  permissions: PaymentPermissions,
  propertyId: string
): boolean {
  if (!permissions.canRecordPayment) return false;
  return canAccessPaymentProperty(permissions, propertyId);
}

/**
 * Verifies if the user is authorized to perform an administrative reversal on a payment.
 * Only Owners and Admins are permitted to reverse payments.
 */
export function canReversePaymentAtProperty(
  permissions: PaymentPermissions,
  propertyId?: string | null
): boolean {
  if (!permissions.canReversePayment) return false;
  return canAccessPaymentProperty(permissions, propertyId);
}

/**
 * Verifies if the user is authorized to remove an existing allocation row.
 * Only Owners and Admins can remove allocations (matching RLS policy).
 */
export function canRemoveAllocationAtProperty(
  permissions: PaymentPermissions,
  propertyId?: string | null
): boolean {
  if (!permissions.canRemoveAllocation) return false;
  return canAccessPaymentProperty(permissions, propertyId);
}
