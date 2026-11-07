import { createClient } from "@/lib/supabase/client";
import type { RentCharge } from "@/types/app.types";

export interface RentChargeWithTenant extends RentCharge {
  tenant_name?: string;
}

export const rentService = {
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
