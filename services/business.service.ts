import { createClient } from "@/lib/supabase/client";
import type { Business, BusinessMember } from "@/types/app.types";

export interface StaffMemberWithDetails {
  id: string;
  business_id: string;
  user_id: string;
  role: "owner" | "admin" | "warden";
  status: "active" | "invited" | "suspended";
  created_at: string;
  full_name: string;
  phone: string;
  email?: string | null;
  property_id?: string | null;
  property_name?: string | null;
}

export const businessService = {
  async getActiveBusiness() {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return null;

    // 1. Fetch user's business membership
    const { data: members, error: memError } = await supabase
      .from("business_members")
      .select("id, business_id, role, status")
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .limit(1);

    if (memError || !members || members.length === 0) {
      // Check if user owns a business directly
      const { data: owned } = await supabase
        .from("businesses")
        .select("*")
        .eq("owner_user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return owned as Business | null;
    }

    const { data: biz } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", members[0].business_id)
      .single();

    return biz as Business | null;
  },

  async getBusinessMembers(businessId: string): Promise<BusinessMember[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("business_members")
      .select("*")
      .eq("business_id", businessId);

    if (error) {
      console.error("Error fetching members:", error);
      return [];
    }
    return data || [];
  },

  async getBusinessMembersDetailed(businessId: string): Promise<StaffMemberWithDetails[]> {
    const supabase = createClient();
    const { data: members, error } = await supabase
      .from("business_members")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true });

    if (error || !members || members.length === 0) return [];

    const userIds = members.map((m) => m.user_id);
    const memberIds = members.map((m) => m.id);

    const [profilesRes, propStaffRes, propertiesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, phone, email").in("id", userIds),
      supabase
        .from("property_staff")
        .select("business_member_id, property_id")
        .eq("business_id", businessId)
        .in("business_member_id", memberIds),
      supabase.from("properties").select("id, name").eq("business_id", businessId),
    ]);

    const profileMap = (profilesRes.data || []).reduce<
      Record<string, { full_name: string | null; phone: string | null; email: string | null }>
    >((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {});

    const propertyMap = (propertiesRes.data || []).reduce<Record<string, string>>((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {});

    const staffPropMap = (propStaffRes.data || []).reduce<Record<string, string>>((acc, ps) => {
      acc[ps.business_member_id] = ps.property_id;
      return acc;
    }, {});

    return members.map((m) => {
      const prof = profileMap[m.user_id];
      const propId = staffPropMap[m.id] || null;
      return {
        id: m.id,
        business_id: m.business_id,
        user_id: m.user_id,
        role: m.role as "owner" | "admin" | "warden",
        status: m.status as "active" | "invited" | "suspended",
        created_at: m.created_at,
        full_name: prof?.full_name || (m.role === "owner" ? "Owner" : "Staff Member"),
        phone: prof?.phone || "Phone not registered",
        email: prof?.email || null,
        property_id: propId,
        property_name: propId ? propertyMap[propId] || "Assigned Property" : "All Properties",
      };
    });
  },

  async assignStaffProperty(businessId: string, memberId: string, propertyId: string) {
    const supabase = createClient();
    // First remove any existing property assignment for this member
    await supabase
      .from("property_staff")
      .delete()
      .eq("business_id", businessId)
      .eq("business_member_id", memberId);

    // If propertyId is provided (not "all"), insert new row
    if (propertyId && propertyId !== "all") {
      const { error } = await supabase.from("property_staff").insert({
        business_id: businessId,
        business_member_id: memberId,
        property_id: propertyId,
      });
      if (error) throw error;
    }
  },

  async updateBusiness(businessId: string, name: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("businesses")
      .update({ name: name.trim() })
      .eq("id", businessId)
      .select()
      .single();

    if (error) throw error;
    return data as Business;
  },
};
