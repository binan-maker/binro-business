import { createClient } from "@/lib/supabase/client";
import type { Business, BusinessMember, BusinessInvitation } from "@/types/app.types";
import { normalizeIndianPhone } from "@/lib/validations/tenant.validation";

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

  /**
   * Resolves the authenticated user's actual role in the specified business.
   * Strictly requires an active business_members record (owner, admin, warden).
   * Returns null if no active membership exists.
   */
  async getUserRole(businessId: string): Promise<"owner" | "admin" | "warden" | null> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      const isExplicitDemo =
        process.env.NODE_ENV !== "production" &&
        (typeof window !== "undefined"
          ? Boolean(
              sessionStorage.getItem("binro_user_session") ||
              sessionStorage.getItem("binro_active_business")
            )
          : false);
      return isExplicitDemo ? "owner" : null;
    }

    // Strictly verify active membership in business_members table
    const { data: member, error } = await supabase
      .from("business_members")
      .select("role, status")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!error && member?.role) {
      return member.role as "owner" | "admin" | "warden";
    }

    return null;
  },

  /**
   * Invites a warden to a specific property under the business.
   * Calls the secure create_staff_invitation RPC.
   */
  async createStaffInvitation(params: {
    businessId: string;
    propertyId: string;
    phone: string;
    fullName?: string | null;
    expiresInDays?: number;
  }): Promise<string> {
    const supabase = createClient();
    const norm = normalizeIndianPhone(params.phone);
    if (!norm.valid) {
      throw new Error(norm.error || "Phone must be a valid 10-digit Indian mobile number (+91XXXXXXXXXX)");
    }
    const cleaned = norm.phone;

    // Check demo mode
    const isExplicitDemo =
      process.env.NODE_ENV !== "production" &&
      (typeof window !== "undefined"
        ? Boolean(sessionStorage.getItem("binro_user_session") || sessionStorage.getItem("binro_active_business"))
        : false);

    if (isExplicitDemo) {
      const mockId = `demo-inv-${Date.now()}`;
      if (typeof window !== "undefined") {
        const existing: BusinessInvitation[] = JSON.parse(
          sessionStorage.getItem("binro_demo_invitations") || "[]"
        );
        const expires = new Date();
        expires.setDate(expires.getDate() + (params.expiresInDays || 7));
        existing.unshift({
          id: mockId,
          business_id: params.businessId,
          property_id: params.propertyId,
          phone: cleaned,
          full_name: params.fullName || null,
          invited_by_member_id: "demo-owner-id",
          status: "pending",
          expires_at: expires.toISOString(),
          created_at: new Date().toISOString(),
        });
        sessionStorage.setItem("binro_demo_invitations", JSON.stringify(existing));
      }
      return mockId;
    }

    const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: Error | null }>)(
      "create_staff_invitation",
      {
        target_business_id: params.businessId,
        target_property_id: params.propertyId,
        target_phone: cleaned,
        target_full_name: params.fullName?.trim() || null,
        target_expires_in_days: params.expiresInDays || 7,
      }
    );

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("Failed to generate invitation ID.");
    }

    return data as string;
  },

  /**
   * Fetches public/safe details about a staff invitation for the acceptance screen.
   */
  async getStaffInvitationDetails(invitationId: string): Promise<{
    id: string;
    business_id: string;
    business_name: string;
    property_id: string;
    property_name: string;
    invited_phone_masked: string;
    invited_phone_normalized: string;
    full_name: string | null;
    status: string;
    expires_at: string;
    is_expired: boolean;
  } | null> {
    const supabase = createClient();

    // 1. Check demo mode first
    const isExplicitDemo =
      process.env.NODE_ENV !== "production" &&
      (typeof window !== "undefined"
        ? Boolean(sessionStorage.getItem("binro_user_session") || sessionStorage.getItem("binro_active_business") || sessionStorage.getItem("binro_demo_invitations"))
        : false);

    if (isExplicitDemo && typeof window !== "undefined") {
      const demoList: BusinessInvitation[] = JSON.parse(
        sessionStorage.getItem("binro_demo_invitations") || "[]"
      );
      const found = demoList.find((i) => i.id === invitationId);
      if (found) {
        const digits = (found.phone || "").replace(/\D/g, "").slice(-10);
        const masked = digits.length === 10 ? `+91 ${digits.slice(0, 5)} *****` : "+91 ***** *****";
        return {
          id: found.id,
          business_id: found.business_id,
          business_name: "BinRo Demo Living",
          property_id: found.property_id,
          property_name: found.property_name || "Main Hostel Wing",
          invited_phone_masked: masked,
          invited_phone_normalized: `+91${digits}`,
          full_name: found.full_name,
          status: found.status,
          expires_at: found.expires_at,
          is_expired: new Date(found.expires_at) <= new Date(),
        };
      }
    }

    // 2. Try the secure get_staff_invitation_details RPC (Migration 0010)
    try {
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null; error: Error | null }>)(
        "get_staff_invitation_details",
        { target_invitation_id: invitationId }
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        const row = data[0] as {
          id: string;
          business_id: string;
          business_name: string;
          property_id: string;
          property_name: string;
          invited_phone_masked: string;
          invited_phone_normalized: string;
          full_name: string | null;
          status: string;
          expires_at: string;
          is_expired: boolean;
        };
        return row;
      }
    } catch {
      // RPC might not be deployed yet, fallback to direct query if permitted
    }

    // 3. Fallback direct select
    try {
      const { data: inv } = await supabase
        .from("business_invitations")
        .select("id, business_id, property_id, phone, full_name, status, expires_at")
        .eq("id", invitationId)
        .maybeSingle();

      if (inv) {
        const [bizRes, propRes] = await Promise.all([
          supabase.from("businesses").select("name").eq("id", inv.business_id).maybeSingle(),
          supabase.from("properties").select("name").eq("id", inv.property_id).maybeSingle(),
        ]);

        const digits = (inv.phone || "").replace(/\D/g, "").slice(-10);
        const masked = digits.length === 10 ? `+91 ${digits.slice(0, 5)} *****` : "+91 ***** *****";

        return {
          id: inv.id,
          business_id: inv.business_id,
          business_name: bizRes.data?.name || "Hostel Organization",
          property_id: inv.property_id,
          property_name: propRes.data?.name || "Assigned Property",
          invited_phone_masked: masked,
          invited_phone_normalized: `+91${digits}`,
          full_name: inv.full_name,
          status: inv.status,
          expires_at: inv.expires_at,
          is_expired: new Date(inv.expires_at) <= new Date(),
        };
      }
    } catch {
      // ignore
    }

    return null;
  },

  /**
   * Discovers any pending staff invitation for the current authenticated user.
   * Enables automatic routing for invited wardens without asking them to create a business.
   */
  async getMyPendingInvitation(): Promise<{
    id: string;
    business_id: string;
    business_name: string;
    property_id: string;
    property_name: string;
    full_name: string | null;
  } | null> {
    const supabase = createClient();

    // Check demo mode first
    const isExplicitDemo =
      process.env.NODE_ENV !== "production" &&
      (typeof window !== "undefined"
        ? Boolean(sessionStorage.getItem("binro_user_session") || sessionStorage.getItem("binro_demo_invitations"))
        : false);

    if (isExplicitDemo && typeof window !== "undefined") {
      const sessionStr = sessionStorage.getItem("binro_user_session");
      const phoneDigits = sessionStr
        ? (JSON.parse(sessionStr).phone || "").replace(/\D/g, "").slice(-10)
        : "";

      const demoList: BusinessInvitation[] = JSON.parse(
        sessionStorage.getItem("binro_demo_invitations") || "[]"
      );

      const found = demoList.find(
        (i) =>
          i.status === "pending" &&
          (i.phone.replace(/\D/g, "").slice(-10) === phoneDigits || !phoneDigits)
      );

      if (found) {
        return {
          id: found.id,
          business_id: found.business_id,
          business_name: "BinRo Demo Hostel",
          property_id: found.property_id,
          property_name: found.property_name || "Assigned Property",
          full_name: found.full_name,
        };
      }
    }

    try {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown[] | null; error: Error | null }>)(
        "get_my_pending_invitations"
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        const row = data[0] as {
          id: string;
          business_id: string;
          business_name: string;
          property_id: string;
          property_name: string;
          full_name: string | null;
        };
        return row;
      }
    } catch {
      // ignore
    }

    return null;
  },

  /**
   * Accepts a pending staff invitation for the current authenticated user.
   * Calls the secure accept_staff_invitation RPC.
   */
  async acceptStaffInvitation(invitationId: string): Promise<string> {
    const supabase = createClient();

    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfigured = Boolean(
      rawUrl &&
      !rawUrl.includes("placeholder-project.supabase.co")
    );

    const isExplicitDemo =
      !isConfigured ||
      (process.env.NODE_ENV !== "production" &&
      (typeof window !== "undefined"
        ? Boolean(sessionStorage.getItem("binro_user_session") || sessionStorage.getItem("binro_active_business"))
        : false));

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    if (!user) {
      if (isExplicitDemo) {
        if (typeof window !== "undefined") {
          const existing: BusinessInvitation[] = JSON.parse(
            sessionStorage.getItem("binro_demo_invitations") || "[]"
          );
          const inv = existing.find((i) => i.id === invitationId);
          if (inv) {
            inv.status = "accepted";
            sessionStorage.setItem("binro_demo_invitations", JSON.stringify(existing));
          }

          const phone = inv?.phone || "+919876543210";
          const propertyId = inv?.property_id || "demo-property-1";
          const businessId = inv?.business_id || "demo-business-1";

          sessionStorage.setItem(
            "binro_user_session",
            JSON.stringify({ phone, role: "warden", property_id: propertyId })
          );
          sessionStorage.setItem(
            "binro_active_business",
            JSON.stringify({ id: businessId, name: "BinRo Demo Hostel", owner_user_id: "demo-owner" })
          );
          sessionStorage.setItem("binro_active_property_id", propertyId);

          if (typeof document !== "undefined") {
            document.cookie = "binro_demo_session=1; path=/; SameSite=Lax";
          }
        }
        return "demo-member-accepted-id";
      }

      throw new Error("Authentication required. Please sign in with your mobile number to accept this invitation.");
    }

    const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: Error | null }>)(
      "accept_staff_invitation",
      {
        target_invitation_id: invitationId,
      }
    );

    if (error) {
      const errObj = error as unknown as Record<string, unknown>;
      const errMessage =
        typeof errObj.message === "string"
          ? errObj.message
          : typeof errObj.details === "string"
          ? errObj.details
          : "Failed to accept invitation.";

      // Check if this was caused by the unnormalized phone matching in migration 0009
      if (errMessage.toLowerCase().includes("different phone")) {
        throw new Error(
          "PHONE_MISMATCH_RAW: Invitation belongs to a different phone format or unnormalized record. If your phone matches, Migration 202611080010_normalize_phone_matching.sql must be applied in Supabase."
        );
      }

      throw new Error(errMessage);
    }

    if (!data) {
      throw new Error("Invitation has expired or is no longer valid.");
    }

    return data as string;
  },

  /**
   * Fetches pending invitations for a business with joined property names.
   * Visible to business owners and admins.
   */
  async getPendingInvitations(businessId: string): Promise<BusinessInvitation[]> {
    const supabase = createClient();

    const isExplicitDemo =
      process.env.NODE_ENV !== "production" &&
      (typeof window !== "undefined"
        ? Boolean(sessionStorage.getItem("binro_user_session") || sessionStorage.getItem("binro_active_business"))
        : false);

    if (isExplicitDemo && typeof window !== "undefined") {
      const stored: BusinessInvitation[] = JSON.parse(
        sessionStorage.getItem("binro_demo_invitations") || "[]"
      );
      return stored.filter((i) => i.business_id === businessId && i.status === "pending");
    }

    const [invitationsRes, propertiesRes] = await Promise.all([
      supabase
        .from("business_invitations")
        .select("*")
        .eq("business_id", businessId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.from("properties").select("id, name").eq("business_id", businessId),
    ]);

    if (invitationsRes.error) {
      console.error("Error fetching invitations:", invitationsRes.error);
      return [];
    }

    const propMap = (propertiesRes.data || []).reduce<Record<string, string>>((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {});

    const rows = (invitationsRes.data as unknown as BusinessInvitation[]) || [];
    return rows.map((inv) => ({
      ...inv,
      property_name: propMap[inv.property_id] || "Assigned Property",
    }));
  },
};

