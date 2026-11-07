import { createClient } from "@/lib/supabase/client";
import type { Tenant, Occupancy, CheckInPayload } from "@/types/app.types";

export interface TenantWithOccupancyInfo extends Tenant {
  property_name?: string;
  occupancy?: (Occupancy & {
    bed_number?: string;
    room_number?: string;
    property_name?: string;
  }) | null;
}

export const tenantService = {
  async getTenantsByBusiness(businessId: string): Promise<TenantWithOccupancyInfo[]> {
    const supabase = createClient();

    // 1. Fetch tenants
    const { data: tenants, error: tErr } = await supabase
      .from("tenants")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (tErr || !tenants) return [];

    // 2. Fetch active occupancies
    const { data: occupancies } = await supabase
      .from("occupancies")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "active");

    const occList = occupancies || [];
    const propertyIds = Array.from(new Set(occList.map((o) => o.property_id)));
    const roomIds = Array.from(new Set(occList.map((o) => o.room_id)));
    const bedIds = Array.from(new Set(occList.map((o) => o.bed_id)));

    const [propsRes, roomsRes, bedsRes] = await Promise.all([
      propertyIds.length > 0
        ? supabase.from("properties").select("id, name").in("id", propertyIds)
        : Promise.resolve({ data: [] }),
      roomIds.length > 0
        ? supabase.from("rooms").select("id, room_number").in("id", roomIds)
        : Promise.resolve({ data: [] }),
      bedIds.length > 0
        ? supabase.from("beds").select("id, bed_number").in("id", bedIds)
        : Promise.resolve({ data: [] }),
    ]);

    const propMap = (propsRes.data || []).reduce<Record<string, string>>((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {});

    const roomMap = (roomsRes.data || []).reduce<Record<string, string>>((acc, r) => {
      acc[r.id] = r.room_number;
      return acc;
    }, {});

    const bedMap = (bedsRes.data || []).reduce<Record<string, string>>((acc, b) => {
      acc[b.id] = b.bed_number;
      return acc;
    }, {});

    const occupancyByTenant = occList.reduce<
      Record<
        string,
        Occupancy & { bed_number?: string; room_number?: string; property_name?: string }
      >
    >((acc, occ) => {
      acc[occ.tenant_id] = {
        ...occ,
        property_name: propMap[occ.property_id] || "Property",
        room_number: roomMap[occ.room_id] || "Room",
        bed_number: bedMap[occ.bed_id] || "Bed",
      };
      return acc;
    }, {});

    return tenants.map((t) => {
      const occ = occupancyByTenant[t.id] || null;
      return {
        ...t,
        property_name: occ?.property_name,
        occupancy: occ,
      };
    });
  },

  async registerAndCheckIn(payload: CheckInPayload) {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

    // 1. Create occupancy record
    // Bed trigger automatically marks the bed as 'occupied'
    const { data: occ, error: occError } = await supabase
      .from("occupancies")
      .insert({
        business_id: payload.business_id,
        property_id: payload.property_id,
        tenant_id: payload.tenant_id,
        room_id: payload.room_id,
        bed_id: payload.bed_id,
        check_in_date: payload.check_in_date,
        expected_check_out_date: payload.expected_check_out_date || null,
        monthly_rent: payload.monthly_rent,
        security_deposit: payload.security_deposit,
        notes: payload.notes || null,
        created_by: userData?.user?.id || null,
        status: "active",
      })
      .select()
      .single();

    if (occError) throw occError;
    return occ as Occupancy;
  },

  async createTenant(
    businessId: string,
    fullName: string,
    phone: string,
    email?: string,
    emergencyContact?: string
  ) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tenants")
      .insert({
        business_id: businessId,
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        emergency_contact: emergencyContact?.trim() || null,
        status: "active",
      })
      .select()
      .single();

    if (error) throw error;
    return data as Tenant;
  },

  async checkOut(occupancyId: string) {
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];

    // Bed status sync trigger will automatically mark bed as 'available'
    const { data, error } = await supabase
      .from("occupancies")
      .update({
        status: "completed",
        check_out_date: today,
      })
      .eq("id", occupancyId)
      .select()
      .single();

    if (error) throw error;
    return data as Occupancy;
  },
};
