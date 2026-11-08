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

  async getRentCharges(businessId: string): Promise<RentChargeWithTenant[]> {
    const supabase = createClient();

    const { data: charges, error: cErr } = await supabase
      .from("rent_charges")
      .select("*")
      .eq("business_id", businessId)
      .order("due_date", { ascending: false });

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
    });
    if (!valid.valid) {
      const errMsgs = Object.values(valid.errors).filter(Boolean).join(", ");
      throw new Error(errMsgs || "Invalid rent charge update.");
    }

    const supabase = createClient();

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
    if (updates.amount !== undefined) payload.amount = updates.amount;
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
};


