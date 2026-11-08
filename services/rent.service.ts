import { createClient } from "@/lib/supabase/client";
import type { RentCharge, UserRole, RentChargeStatus } from "@/types/app.types";

import { getRentPermissions, type RentPermissions } from "@/lib/permissions/rent.permissions";
import {
  validateWaiveRentChargeInput,
  validateUpdateRentChargeInput,
  isValidId,
} from "@/lib/validations/rent.validation";


export interface RentChargeWithTenant extends RentCharge {
  tenant_name?: string;
}

export interface OverdueRentChargeItem {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string;
  property_id: string;
  property_name: string;
  room_number: string;
  bed_number: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount: number; // in paise
  amount_paid: number; // in paise
  outstanding_balance: number; // in paise
  days_overdue: number;
  status: string;
}

export const rentService = {
  async getUserRentPermissions(businessId: string): Promise<{
    role: UserRole | null;
    permissions: RentPermissions;
    userId: string | null;
    assignedPropertyIds: string[] | null;
  }> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      const permissions = getRentPermissions(null, null);
      return { role: null, permissions, userId: null, assignedPropertyIds: null };
    }

    // 1. Fetch active business membership
    const { data: members, error: memError } = await supabase
      .from("business_members")
      .select("id, role, status")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1);

    let role: UserRole | null = null;
    let memberId: string | null = null;

    if (!memError && members && members.length > 0) {
      role = members[0].role as UserRole;
      memberId = members[0].id;
    } else {
      // Check if user is the direct owner in businesses table
      const { data: biz } = await supabase
        .from("businesses")
        .select("id, owner_user_id")
        .eq("id", businessId)
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (biz) {
        role = "owner";
      }
    }

    if (!role) {
      const permissions = getRentPermissions(null, null);
      return { role: null, permissions, userId: user.id, assignedPropertyIds: null };
    }

    // 2. If warden, fetch specifically assigned property IDs from property_staff
    let assignedPropertyIds: string[] | null = null;
    if (role === "warden" && memberId) {
      const { data: staffRows } = await supabase
        .from("property_staff")
        .select("property_id")
        .eq("business_member_id", memberId);

      assignedPropertyIds = (staffRows || []).map((r) => r.property_id);
    }

    const permissions = getRentPermissions(role, assignedPropertyIds);
    return {
      role,
      permissions,
      userId: user.id,
      assignedPropertyIds,
    };
  },

  async getRentCharges(
    businessId: string,
    options?: { propertyId?: string | null }
  ): Promise<RentChargeWithTenant[]> {
    const supabase = createClient();
    const userContext = await this.getUserRentPermissions(businessId);

    let query = supabase
      .from("rent_charges")
      .select("*")
      .eq("business_id", businessId);

    if (userContext.permissions.accessiblePropertyIds !== null) {
      if (userContext.permissions.accessiblePropertyIds.length === 0) {
        return [];
      }
      if (options?.propertyId && options.propertyId !== "all") {
        if (!userContext.permissions.accessiblePropertyIds.includes(options.propertyId)) {
          return [];
        }
        query = query.eq("property_id", options.propertyId);
      } else {
        query = query.in("property_id", userContext.permissions.accessiblePropertyIds);
      }
    } else {
      if (options?.propertyId && options.propertyId !== "all") {
        query = query.eq("property_id", options.propertyId);
      }
    }

    query = query.order("due_date", { ascending: false });

    const { data: charges, error: cErr } = await query;

    if (cErr || !charges) return [];

    const tenantIds = Array.from(new Set(charges.map((c) => c.tenant_id)));
    if (tenantIds.length === 0) return charges;

    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, full_name")
      .in("id", tenantIds);

    const tenantMap = (tenants || []).reduce<Record<string, string>>((acc, t) => {
      acc[t.id] = t.full_name;
      return acc;
    }, {});

    return charges.map((c) => ({
      ...c,
      tenant_name: tenantMap[c.tenant_id] || "Tenant",
    }));
  },

  /**
   * Retrieves overdue rent charges for the business, calculating real outstanding balance
   * directly from amount - amount_paid (governed by payment allocations).
   * Excludes waived and fully paid charges. Enforces caller property scope and selected property filter.
   * Batches tenant, property, room, and bed relationships in parallel without per-row queries.
   */
  async getOverdueRentCharges(
    businessId: string,
    options?: { propertyId?: string | null }
  ): Promise<OverdueRentChargeItem[]> {
    const supabase = createClient();
    const userContext = await this.getUserRentPermissions(businessId);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let query = supabase
      .from("rent_charges")
      .select("*")
      .eq("business_id", businessId)
      .neq("status", "waived")
      .neq("status", "paid")
      .lt("due_date", todayStr);

    if (userContext.permissions.accessiblePropertyIds !== null) {
      if (userContext.permissions.accessiblePropertyIds.length === 0) {
        return [];
      }
      if (options?.propertyId && options.propertyId !== "all") {
        if (!userContext.permissions.accessiblePropertyIds.includes(options.propertyId)) {
          return [];
        }
        query = query.eq("property_id", options.propertyId);
      } else {
        query = query.in("property_id", userContext.permissions.accessiblePropertyIds);
      }
    } else {
      if (options?.propertyId && options.propertyId !== "all") {
        query = query.eq("property_id", options.propertyId);
      }
    }

    query = query.order("due_date", { ascending: true });

    const { data: rawCharges, error } = await query;
    if (error || !rawCharges || rawCharges.length === 0) return [];

    // Filter strictly positive outstanding balance
    const overdueCharges = rawCharges.filter((c) => Number(c.amount) > Number(c.amount_paid));
    if (overdueCharges.length === 0) return [];

    const tenantIds = Array.from(new Set(overdueCharges.map((c) => c.tenant_id)));
    const propertyIds = Array.from(new Set(overdueCharges.map((c) => c.property_id)));
    const explicitOccupancyIds = Array.from(
      new Set(overdueCharges.map((c) => c.occupancy_id).filter(Boolean))
    ) as string[];

    const [tenantsRes, propertiesRes, occupanciesRes, activeOccupanciesRes] = await Promise.all([
      tenantIds.length > 0
        ? supabase.from("tenants").select("id, full_name, phone").in("id", tenantIds)
        : Promise.resolve({ data: [] }),
      propertyIds.length > 0
        ? supabase.from("properties").select("id, name").in("id", propertyIds)
        : Promise.resolve({ data: [] }),
      explicitOccupancyIds.length > 0
        ? supabase.from("occupancies").select("id, room_id, bed_id, tenant_id").in("id", explicitOccupancyIds)
        : Promise.resolve({ data: [] }),
      tenantIds.length > 0
        ? supabase.from("occupancies").select("id, room_id, bed_id, tenant_id").in("tenant_id", tenantIds).eq("status", "active")
        : Promise.resolve({ data: [] }),
    ]);

    const tenantMap = (tenantsRes.data || []).reduce<Record<string, { full_name: string; phone: string | null }>>(
      (acc, t) => {
        acc[t.id] = { full_name: t.full_name, phone: t.phone };
        return acc;
      },
      {}
    );

    const propertyMap = (propertiesRes.data || []).reduce<Record<string, string>>((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {});

    const occMap: Record<string, { room_id: string; bed_id: string }> = {};
    (occupanciesRes.data || []).forEach((o) => {
      occMap[o.id] = { room_id: o.room_id, bed_id: o.bed_id };
    });

    const tenantActiveOccMap: Record<string, { room_id: string; bed_id: string }> = {};
    (activeOccupanciesRes.data || []).forEach((o) => {
      tenantActiveOccMap[o.tenant_id] = { room_id: o.room_id, bed_id: o.bed_id };
    });

    const roomIds = new Set<string>();
    const bedIds = new Set<string>();

    for (const c of overdueCharges) {
      const occ = (c.occupancy_id && occMap[c.occupancy_id]) || tenantActiveOccMap[c.tenant_id];
      if (occ) {
        if (occ.room_id) roomIds.add(occ.room_id);
        if (occ.bed_id) bedIds.add(occ.bed_id);
      }
    }

    const [roomsRes, bedsRes] = await Promise.all([
      roomIds.size > 0
        ? supabase.from("rooms").select("id, room_number").in("id", Array.from(roomIds))
        : Promise.resolve({ data: [] }),
      bedIds.size > 0
        ? supabase.from("beds").select("id, bed_number").in("id", Array.from(bedIds))
        : Promise.resolve({ data: [] }),
    ]);

    const roomMap = (roomsRes.data || []).reduce<Record<string, string>>((acc, r) => {
      acc[r.id] = r.room_number;
      return acc;
    }, {});

    const bedMap = (bedsRes.data || []).reduce<Record<string, string>>((acc, b) => {
      acc[b.id] = b.bed_number;
      return acc;
    }, {});

    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return overdueCharges.map((c) => {
      const occ = (c.occupancy_id && occMap[c.occupancy_id]) || tenantActiveOccMap[c.tenant_id];
      const [dy, dm, dd] = c.due_date.split("-").map(Number);
      const dueDateLocal = new Date(dy, dm - 1, dd).getTime();
      const daysOverdue = Math.max(1, Math.round((todayMs - dueDateLocal) / (1000 * 60 * 60 * 24)));
      const balance = Math.max(0, Number(c.amount) - Number(c.amount_paid));

      return {
        id: c.id,
        tenant_id: c.tenant_id,
        tenant_name: tenantMap[c.tenant_id]?.full_name || "Unknown Tenant",
        tenant_phone: tenantMap[c.tenant_id]?.phone || "—",
        property_id: c.property_id,
        property_name: propertyMap[c.property_id] || "Property",
        room_number: (occ && roomMap[occ.room_id]) || "—",
        bed_number: (occ && bedMap[occ.bed_id]) || "—",
        period_start: c.period_start,
        period_end: c.period_end,
        due_date: c.due_date,
        amount: Number(c.amount),
        amount_paid: Number(c.amount_paid),
        outstanding_balance: balance,
        days_overdue: daysOverdue,
        status: c.status,
      };
    });
  },

  async createRentCharge(payload: {
    business_id: string;
    property_id: string;
    tenant_id: string;
    occupancy_id: string;
    period_start: string;
    period_end: string;
    due_date: string;
    amount: number;
    description?: string;
  }) {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("rent_charges")
      .insert({
        business_id: payload.business_id,
        property_id: payload.property_id,
        tenant_id: payload.tenant_id,
        occupancy_id: payload.occupancy_id,
        period_start: payload.period_start,
        period_end: payload.period_end,
        due_date: payload.due_date,
        amount: payload.amount,
        amount_paid: 0,
        status: "pending",
        description: payload.description || "Monthly Room Rent",
        created_by: userData?.user?.id || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as RentCharge;
  },

  async waiveRentCharge(rentChargeId: string, reason?: string): Promise<RentCharge> {
    const valid = validateWaiveRentChargeInput({
      rent_charge_id: rentChargeId,
      reason: reason || null,
    });
    if (!valid.valid) {
      const errMsgs = Object.values(valid.errors).filter(Boolean).join(", ");
      throw new Error(errMsgs || "Invalid waiver request.");
    }

    const supabase = createClient();
    const { data: current, error: fetchErr } = await supabase
      .from("rent_charges")
      .select("id, status, amount, amount_paid, notes")
      .eq("id", rentChargeId)
      .single();

    if (fetchErr || !current) {
      throw new Error("Rent charge not found.");
    }

    if (current.amount_paid > 0) {
      throw new Error("Cannot waive a rent charge that has existing payments allocated.");
    }

    if (current.status === "waived") {
      throw new Error("Rent charge is already waived.");
    }

    const waiverNote = reason?.trim() ? `[Waived: ${reason.trim()}]` : "[Waived by owner/admin]";
    const updatedNotes = current.notes ? `${current.notes}\n${waiverNote}` : waiverNote;

    const { data, error } = await supabase
      .from("rent_charges")
      .update({
        status: "waived",
        notes: updatedNotes,
      })
      .eq("id", rentChargeId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || "Failed to waive rent charge.");
    }

    return data as RentCharge;
  },

  async restoreRentCharge(rentChargeId: string): Promise<RentCharge> {
    if (!isValidId(rentChargeId)) {
      throw new Error("Invalid rent charge ID.");
    }

    const supabase = createClient();
    const { data: current, error: fetchErr } = await supabase
      .from("rent_charges")
      .select("id, status, amount, amount_paid, notes")
      .eq("id", rentChargeId)
      .single();

    if (fetchErr || !current) {
      throw new Error("Rent charge not found.");
    }

    if (current.status !== "waived") {
      throw new Error("Only waived rent charges can be restored.");
    }

    const restoreNote = "[Restored from waived to pending]";
    const updatedNotes = current.notes ? `${current.notes}\n${restoreNote}` : restoreNote;

    const { data, error } = await supabase
      .from("rent_charges")
      .update({
        status: "pending",
        notes: updatedNotes,
      })
      .eq("id", rentChargeId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || "Failed to restore rent charge.");
    }

    return data as RentCharge;
  },

  async updateRentCharge(
    rentChargeId: string,
    updates: {
      description?: string | null;
      notes?: string | null;
      amount?: number;
      amount_paid?: number;
      status?: string;
    }
  ): Promise<RentCharge> {
    const valid = validateUpdateRentChargeInput({
      rent_charge_id: rentChargeId,
      description: updates.description,
      notes: updates.notes,
      amount: updates.amount,
    });
    if (!valid.valid) {
      const errMsgs = Object.values(valid.errors).filter(Boolean).join(", ");
      throw new Error(errMsgs || "Invalid rent charge update.");
    }

    const supabase = createClient();

    // 1. Fetch current rent charge to check existing amount & allocations
    const { data: current, error: fetchErr } = await supabase
      .from("rent_charges")
      .select("id, amount, amount_paid, business_id")
      .eq("id", rentChargeId)
      .maybeSingle();

    if (fetchErr) {
      throw new Error(fetchErr.message || "Failed to fetch rent charge.");
    }

    // 2. Strict enforcement: Cannot modify rent charge amount if payments have already been allocated
    if (current && updates.amount !== undefined && updates.amount !== current.amount) {
      if (current.amount_paid > 0) {
        throw new Error(
          `Cannot modify rent charge amount (${current.amount} paise) because ${current.amount_paid} paise has already been allocated.`
        );
      }

      // Check payment_allocations table directly to guarantee zero allocations
      const { data: allocations } = await supabase
        .from("payment_allocations")
        .select("allocated_amount")
        .eq("rent_charge_id", rentChargeId);

      const totalAllocated = (allocations || []).reduce(
        (sum, a) => sum + (Number(a.allocated_amount) || 0),
        0
      );

      if (totalAllocated > 0) {
        throw new Error(
          `Cannot modify rent charge amount (${current.amount} paise) because ${totalAllocated} paise has already been allocated.`
        );
      }
    }

    const payload: {
      description?: string | null;
      notes?: string | null;
      amount?: number;
      amount_paid?: number;
      status?: RentChargeStatus;
    } = {};
    if (updates.description !== undefined) payload.description = valid.sanitized.description;
    if (updates.notes !== undefined) payload.notes = valid.sanitized.notes;
    // Pass raw attempt of sensitive fields to test database triggers / RLS enforcement
    if (updates.amount !== undefined) payload.amount = valid.sanitized.amount ?? updates.amount;
    if (updates.amount_paid !== undefined) payload.amount_paid = updates.amount_paid;
    if (updates.status !== undefined) payload.status = updates.status as RentChargeStatus;

    const { data, error } = await supabase
      .from("rent_charges")
      .update(payload)
      .eq("id", rentChargeId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || "Failed to update rent charge.");
    }

    return data as RentCharge;
  },

  async getPendingRentTotal(businessId: string): Promise<number> {
    const supabase = createClient();
    const { data } = await supabase
      .from("rent_charges")
      .select("amount, amount_paid")
      .eq("business_id", businessId)
      .neq("status", "paid")
      .neq("status", "waived");

    if (!data) return 0;
    return data.reduce((acc, c) => acc + (c.amount - c.amount_paid), 0);
  },

  /**
   * Deletes an erroneous rent charge when it has zero payment allocations and zero payments recorded.
   * Enforces trusted DB permission checks (active owner/admin only),
   * verifies the charge belongs to the business, asserts no payment allocations exist,
   * asserts amount_paid == 0, and asserts status is unpaid.
   * Enforced at the database layer by RLS policy ("Admins can delete rent charges").
   */
  async deleteRentCharge(rentChargeId: string): Promise<void> {
    if (!isValidId(rentChargeId)) {
      throw new Error("Invalid rent charge identifier.");
    }

    const supabase = createClient();

    // 1. Fetch target rent charge
    const { data: rentCharge, error: rError } = await supabase
      .from("rent_charges")
      .select("id, business_id, property_id, tenant_id, amount, amount_paid, status")
      .eq("id", rentChargeId)
      .maybeSingle();

    if (rError || !rentCharge) {
      throw new Error(rError?.message || "Rent charge not found.");
    }

    // 2. Load authenticated user permissions from trusted database context
    const userContext = await this.getUserRentPermissions(rentCharge.business_id);
    if (!userContext.role) {
      throw new Error("You are not an active member of this business.");
    }

    // 3. Admin-only authorization check (Wardens can NEVER delete rent charges)
    if (!userContext.permissions.canDeleteBill) {
      throw new Error("Only business owners and administrators are authorized to delete rent charges.");
    }

    // 4. Verify no payment allocations exist
    const { data: allocations, error: aError } = await supabase
      .from("payment_allocations")
      .select("id, allocated_amount")
      .eq("rent_charge_id", rentCharge.id);

    if (aError) {
      throw new Error(aError.message || "Failed to verify rent charge payment allocations.");
    }

    if (allocations && allocations.length > 0) {
      throw new Error("Cannot delete a rent charge that has existing payment allocations. Please remove allocations first.");
    }

    // 5. Verify amount_paid is zero
    if (rentCharge.amount_paid > 0) {
      throw new Error(`Cannot delete a rent charge with recorded payments (₹${Math.round(rentCharge.amount_paid / 100).toLocaleString("en-IN")}).`);
    }

    // 6. Verify status consistency
    if (rentCharge.status === "paid" || rentCharge.status === "partially_paid") {
      throw new Error(`Cannot delete a rent charge with status '${rentCharge.status}'.`);
    }

    // 7. Delete record (enforced by RLS: "Admins can delete rent charges")
    const { error: delError } = await supabase
      .from("rent_charges")
      .delete()
      .eq("id", rentCharge.id);

    if (delError) {
      throw new Error(delError.message || "Failed to delete rent charge.");
    }
  },
};


