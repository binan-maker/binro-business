import { createClient } from "@/lib/supabase/client";
import type {
  Tenant,
  Occupancy,
  CheckInPayload,
  OccupancyWithDetails,
  TenantWithFullDetails,
  TenantFilterOptions,
  RegisterTenantPayload,
  UpdateTenantProfilePayload,
  TransferBedPayload,
} from "@/types/app.types";
import type { UserRole } from "@/types/database.types";
import {
  validateRegisterTenantInput,
  validateUpdateTenantProfileInput,
  validateTransferBedInput,
} from "@/lib/validations/tenant.validation";
import {
  getTenantPermissions,
  canRegisterAtProperty,
  canAccessTenantProperty,
  canManageStay,
  type TenantPermissions,
} from "@/lib/permissions/tenant.permissions";

export interface TenantWithOccupancyInfo extends Tenant {
  property_name?: string;
  occupancy?: (Occupancy & {
    bed_number?: string;
    room_number?: string;
    property_name?: string;
  }) | null;
}

export interface RegisterTenantRpcResponse {
  tenant_id: string;
  occupancy_id: string;
  property_id: string;
  room_id: string;
  bed_id: string;
  check_in_date: string;
  status: string;
}

export interface UpdateTenantProfileRpcResponse {
  success: boolean;
  tenant_id: string;
}

export const tenantService = {
  /**
   * Resolves the current authenticated user's role and tenant permissions
   * within the specified business. Validates active membership and warden assignments.
   */
  async getUserTenantContext(businessId: string): Promise<{
    role: UserRole | null;
    permissions: TenantPermissions;
    userId: string | null;
  }> {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    if (!user) {
      // Mock owner permissions are strictly restricted to explicitly enabled development/demo mode.
      // In production or unauthenticated scenarios, the service fails closed with no operational permissions.
      const isExplicitDemo =
        process.env.NODE_ENV !== "production" &&
        (typeof window !== "undefined"
          ? Boolean(
              sessionStorage.getItem("binro_user_session") ||
              sessionStorage.getItem("binro_active_business")
            )
          : false);

      if (isExplicitDemo) {
        const permissions = getTenantPermissions("owner", null);
        return { role: "owner", permissions, userId: null };
      }

      // Production or unauthorized/unauthenticated access: fail closed
      const permissions = getTenantPermissions(null, null);
      return { role: null, permissions, userId: null };
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

    // If no active membership or direct ownership found, fail closed
    if (!role) {
      const permissions = getTenantPermissions(null, null);
      return { role: null, permissions, userId: user.id };
    }

    // 2. If warden, fetch specifically assigned property IDs from property_staff
    let assignedPropertyIds: string[] | null = null;
    if (role === "warden" && memberId) {
      const { data: staffRows } = await supabase
        .from("property_staff")
        .select("property_id")
        .eq("business_id", businessId)
        .eq("business_member_id", memberId);

      assignedPropertyIds = (staffRows || []).map((r) => r.property_id);
    }

    const permissions = getTenantPermissions(role, assignedPropertyIds);
    return { role, permissions, userId: user.id };
  },

  /**
   * 1 & 2. Retrieve tenants for the active business and authorized property context.
   * Supports search (name, phone, email, room, bed), filtering (property, status), and sorting.
   */
  async getTenants(
    businessId: string,
    options?: TenantFilterOptions
  ): Promise<TenantWithFullDetails[]> {
    const supabase = createClient();

    // 1. Verify user context & permissions
    const { permissions, role } = await this.getUserTenantContext(businessId);

    // Unassigned warden guard: unassigned wardens must not access tenant records
    if (role === "warden" && (!permissions.accessiblePropertyIds || permissions.accessiblePropertyIds.length === 0)) {
      return [];
    }

    // Property context filter validation
    if (options?.propertyId && options.propertyId !== "all") {
      if (!canAccessTenantProperty(permissions, options.propertyId)) {
        return [];
      }
    }

    // 2. Fetch tenants belonging to the business
    const { data: rawTenants, error: tErr } = await supabase
      .from("tenants")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (tErr || !rawTenants || rawTenants.length === 0) {
      return [];
    }

    // 3. Fetch occupancies for the business
    let occQuery = supabase
      .from("occupancies")
      .select("*")
      .eq("business_id", businessId);

    // Restrict to warden's assigned properties if scoped
    if (permissions.accessiblePropertyIds !== null) {
      occQuery = occQuery.in("property_id", permissions.accessiblePropertyIds);
    }

    // Restrict to filter property if provided
    if (options?.propertyId && options.propertyId !== "all") {
      occQuery = occQuery.eq("property_id", options.propertyId);
    }

    const { data: rawOccupancies, error: occErr } = await occQuery;
    if (occErr) {
      console.error("Error fetching occupancies:", occErr.message);
    }

    const occupancies = rawOccupancies || [];

    // 4. Batch-fetch related properties, rooms, floors, and beds for labels
    const propertyIds = Array.from(new Set(occupancies.map((o) => o.property_id)));
    const roomIds = Array.from(new Set(occupancies.map((o) => o.room_id)));
    const bedIds = Array.from(new Set(occupancies.map((o) => o.bed_id)));

    const [propsRes, roomsRes, bedsRes] = await Promise.all([
      propertyIds.length > 0
        ? supabase.from("properties").select("id, name").in("id", propertyIds)
        : Promise.resolve({ data: [] }),
      roomIds.length > 0
        ? supabase.from("rooms").select("id, room_number, floor_id").in("id", roomIds)
        : Promise.resolve({ data: [] }),
      bedIds.length > 0
        ? supabase.from("beds").select("id, bed_number").in("id", bedIds)
        : Promise.resolve({ data: [] }),
    ]);

    const roomsData = roomsRes.data || [];
    const floorIds = Array.from(
      new Set(roomsData.map((r) => r.floor_id).filter(Boolean))
    ) as string[];

    const floorsRes =
      floorIds.length > 0
        ? await supabase.from("floors").select("id, name").in("id", floorIds)
        : { data: [] };

    const propMap = (propsRes.data || []).reduce<Record<string, string>>((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {});

    const roomMap = roomsData.reduce<Record<string, string>>((acc, r) => {
      acc[r.id] = r.room_number;
      return acc;
    }, {});

    const roomFloorMap = roomsData.reduce<Record<string, string | null>>((acc, r) => {
      acc[r.id] = r.floor_id;
      return acc;
    }, {});

    const floorMap = (floorsRes.data || []).reduce<Record<string, string>>((acc, f) => {
      acc[f.id] = f.name;
      return acc;
    }, {});

    const bedMap = (bedsRes.data || []).reduce<Record<string, string>>((acc, b) => {
      acc[b.id] = b.bed_number;
      return acc;
    }, {});

    // 5. Build enriched OccupancyWithDetails grouped by tenant
    const occupanciesByTenant: Record<string, OccupancyWithDetails[]> = {};

    occupancies.forEach((occ) => {
      const enriched: OccupancyWithDetails = {
        ...occ,
        property_name: propMap[occ.property_id] || "Property",
        room_number: roomMap[occ.room_id] || "Room",
        bed_number: bedMap[occ.bed_id] || "Bed",
        floor_name: occ.room_id && roomFloorMap[occ.room_id] ? floorMap[roomFloorMap[occ.room_id]!] : null,
      };

      if (!occupanciesByTenant[occ.tenant_id]) {
        occupanciesByTenant[occ.tenant_id] = [];
      }
      occupanciesByTenant[occ.tenant_id].push(enriched);
    });

    // Sort each tenant's occupancies by check_in_date descending
    Object.keys(occupanciesByTenant).forEach((tId) => {
      occupanciesByTenant[tId].sort((a, b) => {
        return new Date(b.check_in_date).getTime() - new Date(a.check_in_date).getTime();
      });
    });

    // 6. Map tenants to TenantWithFullDetails
    let enrichedTenants: TenantWithFullDetails[] = rawTenants.map((t) => {
      const tOccs = occupanciesByTenant[t.id] || [];
      const currentOcc = tOccs.find((o) => o.status === "active") || null;
      const pastOccs = tOccs.filter((o) => o.status !== "active");

      return {
        ...t,
        current_occupancy: currentOcc,
        past_occupancies: pastOccs,
        total_stays: tOccs.length,
        property_name: currentOcc?.property_name,
        occupancy: currentOcc,
      };
    });

    // 7. For wardens: filter out tenants who have never had an occupancy at their assigned properties
    if (permissions.accessiblePropertyIds !== null) {
      enrichedTenants = enrichedTenants.filter((t) => {
        const tOccs = occupanciesByTenant[t.id] || [];
        return tOccs.some((o) => permissions.accessiblePropertyIds!.includes(o.property_id));
      });
    }

    // 8. Filter by status (active vs completed/past)
    if (options?.status && options.status !== "all") {
      if (options.status === "active") {
        enrichedTenants = enrichedTenants.filter((t) => t.current_occupancy !== null);
      } else if (options.status === "completed") {
        enrichedTenants = enrichedTenants.filter(
          (t) => t.current_occupancy === null && t.total_stays > 0
        );
      }
    }

    // 9. Filter by search query
    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      enrichedTenants = enrichedTenants.filter((t) => {
        const nameMatch = t.full_name.toLowerCase().includes(q);
        const phoneMatch = t.phone.toLowerCase().includes(q);
        const emailMatch = (t.email || "").toLowerCase().includes(q);
        const roomMatch = (t.current_occupancy?.room_number || "").toLowerCase().includes(q);
        const bedMatch = (t.current_occupancy?.bed_number || "").toLowerCase().includes(q);
        return nameMatch || phoneMatch || emailMatch || roomMatch || bedMatch;
      });
    }

    // 10. Sorting
    const sortBy = options?.sortBy || "created_at";
    const sortOrder = options?.sortOrder || (sortBy === "name" ? "asc" : "desc");

    enrichedTenants.sort((a, b) => {
      let diff = 0;
      if (sortBy === "name") {
        diff = a.full_name.localeCompare(b.full_name);
      } else if (sortBy === "check_in_date") {
        const dateA = a.current_occupancy?.check_in_date || a.created_at;
        const dateB = b.current_occupancy?.check_in_date || b.created_at;
        diff = new Date(dateB).getTime() - new Date(dateA).getTime();
      } else {
        // created_at
        diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return sortOrder === "asc" ? -diff : diff;
    });

    return enrichedTenants;
  },

  /**
   * Backwards-compatible retrieval helper for existing components.
   */
  async getTenantsByBusiness(
    businessId: string,
    options?: TenantFilterOptions
  ): Promise<TenantWithOccupancyInfo[]> {
    return this.getTenants(businessId, options);
  },

  /**
   * 3. Retrieve complete tenant details, including current and past occupancies.
   */
  async getTenantById(
    tenantId: string,
    businessId?: string
  ): Promise<TenantWithFullDetails | null> {
    const supabase = createClient();

    // 1. Fetch tenant row
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .maybeSingle();

    if (error || !tenant) return null;

    const bizId = businessId || tenant.business_id;

    // 2. Check user permissions
    const { permissions, role } = await this.getUserTenantContext(bizId);
    if (role === "warden" && (!permissions.accessiblePropertyIds || permissions.accessiblePropertyIds.length === 0)) {
      return null;
    }

    // 3. Fetch all occupancies for this tenant
    const { data: rawOccs } = await supabase
      .from("occupancies")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("check_in_date", { ascending: false });

    const occList = rawOccs || [];

    // If warden: ensure at least one stay is at warden's assigned property
    if (permissions.accessiblePropertyIds !== null) {
      const hasPermittedStay = occList.some((o) =>
        permissions.accessiblePropertyIds!.includes(o.property_id)
      );
      if (!hasPermittedStay) {
        return null;
      }
    }

    // 4. Batch-fetch details for occupancies
    const propertyIds = Array.from(new Set(occList.map((o) => o.property_id)));
    const roomIds = Array.from(new Set(occList.map((o) => o.room_id)));
    const bedIds = Array.from(new Set(occList.map((o) => o.bed_id)));

    const [propsRes, roomsRes, bedsRes] = await Promise.all([
      propertyIds.length > 0
        ? supabase.from("properties").select("id, name").in("id", propertyIds)
        : Promise.resolve({ data: [] }),
      roomIds.length > 0
        ? supabase.from("rooms").select("id, room_number, floor_id").in("id", roomIds)
        : Promise.resolve({ data: [] }),
      bedIds.length > 0
        ? supabase.from("beds").select("id, bed_number").in("id", bedIds)
        : Promise.resolve({ data: [] }),
    ]);

    const roomsData = roomsRes.data || [];
    const floorIds = Array.from(
      new Set(roomsData.map((r) => r.floor_id).filter(Boolean))
    ) as string[];

    const floorsRes =
      floorIds.length > 0
        ? await supabase.from("floors").select("id, name").in("id", floorIds)
        : { data: [] };

    const propMap = (propsRes.data || []).reduce<Record<string, string>>((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {});

    const roomMap = roomsData.reduce<Record<string, string>>((acc, r) => {
      acc[r.id] = r.room_number;
      return acc;
    }, {});

    const roomFloorMap = roomsData.reduce<Record<string, string | null>>((acc, r) => {
      acc[r.id] = r.floor_id;
      return acc;
    }, {});

    const floorMap = (floorsRes.data || []).reduce<Record<string, string>>((acc, f) => {
      acc[f.id] = f.name;
      return acc;
    }, {});

    const bedMap = (bedsRes.data || []).reduce<Record<string, string>>((acc, b) => {
      acc[b.id] = b.bed_number;
      return acc;
    }, {});

    const enrichedOccs: OccupancyWithDetails[] = occList.map((occ) => ({
      ...occ,
      property_name: propMap[occ.property_id] || "Property",
      room_number: roomMap[occ.room_id] || "Room",
      bed_number: bedMap[occ.bed_id] || "Bed",
      floor_name: occ.room_id && roomFloorMap[occ.room_id] ? floorMap[roomFloorMap[occ.room_id]!] : null,
    }));

    const currentOcc = enrichedOccs.find((o) => o.status === "active") || null;
    const pastOccs = enrichedOccs.filter((o) => o.status !== "active");

    return {
      ...tenant,
      current_occupancy: currentOcc,
      past_occupancies: pastOccs,
      total_stays: enrichedOccs.length,
      property_name: currentOcc?.property_name,
      occupancy: currentOcc,
    };
  },

  /**
   * 4. Register a tenant and check them in using the atomic database RPC register_tenant_with_occupancy.
   * Performs Indian phone normalization and validates bed/room availability and warden scoping.
   */
  async registerTenantWithOccupancy(
    payload: RegisterTenantPayload
  ): Promise<RegisterTenantRpcResponse> {
    const supabase = createClient();

    // 1. Verify user context & property permissions
    const { permissions } = await this.getUserTenantContext(payload.p_business_id);
    if (!permissions.canRegisterTenant) {
      throw new Error("Access denied: You do not have permission to register tenants.");
    }

    if (!canRegisterAtProperty(permissions, payload.p_property_id)) {
      throw new Error("Access denied: You do not have permission to register tenants at this property.");
    }

    // 2. Validate and sanitize input (including Indian phone normalization)
    const validation = validateRegisterTenantInput(payload);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError || "Invalid tenant registration details.");
    }

    const { sanitized } = validation;

    // 3. Pre-validate destination room and bed
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("id, property_id, status")
      .eq("id", sanitized.p_room_id)
      .maybeSingle();

    if (roomErr || !room) {
      throw new Error("Selected room was not found.");
    }
    if (room.property_id !== sanitized.p_property_id) {
      throw new Error("Selected room does not belong to the chosen property.");
    }
    if (room.status !== "active") {
      throw new Error(`Selected room is not active (status: ${room.status}).`);
    }

    const { data: bed, error: bedErr } = await supabase
      .from("beds")
      .select("id, room_id, status")
      .eq("id", sanitized.p_bed_id)
      .maybeSingle();

    if (bedErr || !bed) {
      throw new Error("Selected bed was not found.");
    }
    if (bed.room_id !== sanitized.p_room_id) {
      throw new Error("Selected bed does not belong to the chosen room.");
    }
    if (bed.status !== "available") {
      throw new Error(`Selected bed is not available for occupancy (current status: ${bed.status}).`);
    }

    // 4. Call Migration 007 atomic RPC register_tenant_with_occupancy
    // Note: RPC locks bed FOR UPDATE, creates tenant and occupancy atomically,
    // and sync_bed_occupancy_status trigger transitions bed status to 'occupied'.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("register_tenant_with_occupancy", {
      p_business_id: sanitized.p_business_id,
      p_property_id: sanitized.p_property_id,
      p_room_id: sanitized.p_room_id,
      p_bed_id: sanitized.p_bed_id,
      p_full_name: sanitized.p_full_name,
      p_phone: sanitized.p_phone,
      p_email: sanitized.p_email || null,
      p_emergency_contact: sanitized.p_emergency_contact || null,
      p_emergency_contact_name: sanitized.p_emergency_contact_name || null,
      p_date_of_birth: sanitized.p_date_of_birth || null,
      p_gender: sanitized.p_gender || null,
      p_address: sanitized.p_address || null,
      p_identity_type: sanitized.p_identity_type || null,
      p_identity_reference: sanitized.p_identity_reference || null,
      p_tenant_notes: sanitized.p_tenant_notes || null,
      p_check_in_date: sanitized.p_check_in_date || new Date().toISOString().split("T")[0],
      p_expected_check_out_date: sanitized.p_expected_check_out_date || null,
      p_monthly_rent: sanitized.p_monthly_rent ?? 0,
      p_security_deposit: sanitized.p_security_deposit ?? 0,
      p_occupancy_notes: sanitized.p_occupancy_notes || null,
    });

    if (error) {
      console.error("RPC register_tenant_with_occupancy error:", error);
      throw new Error(error.message || "Failed to register tenant.");
    }

    return data as RegisterTenantRpcResponse;
  },

  /**
   * 5. Update basic tenant information using update_tenant_profile RPC.
   * Restricts wardens to allowed basic profile fields and validates Indian phone format.
   */
  async updateTenantProfile(
    payload: UpdateTenantProfilePayload
  ): Promise<UpdateTenantProfileRpcResponse> {
    const supabase = createClient();

    // 1. Validate input (includes Indian phone normalization)
    const validation = validateUpdateTenantProfileInput(payload);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError || "Invalid tenant profile data.");
    }

    const { sanitized } = validation;

    // 2. Fetch tenant to verify business membership and authorization
    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, business_id")
      .eq("id", sanitized.p_tenant_id)
      .maybeSingle();

    if (tErr || !tenant) {
      throw new Error("Tenant record not found.");
    }

    const { permissions } = await this.getUserTenantContext(tenant.business_id);
    if (!permissions.canEditTenantProfile) {
      throw new Error("Access denied: You do not have permission to edit tenant profiles.");
    }

    // 3. Call Migration 007 RPC update_tenant_profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("update_tenant_profile", {
      p_tenant_id: sanitized.p_tenant_id,
      p_full_name: sanitized.p_full_name,
      p_phone: sanitized.p_phone,
      p_email: sanitized.p_email || null,
      p_emergency_contact: sanitized.p_emergency_contact || null,
      p_emergency_contact_name: sanitized.p_emergency_contact_name || null,
      p_address: sanitized.p_address || null,
    });

    if (error) {
      console.error("RPC update_tenant_profile error:", error);
      throw new Error(error.message || "Failed to update tenant profile.");
    }

    return data as UpdateTenantProfileRpcResponse;
  },

  /**
   * 6. Check out a tenant by updating the correct occupancy record.
   * Preserves historical stay record. The sync_bed_occupancy_status trigger
   * automatically releases the bed back to 'available'.
   */
  async checkOut(
    occupancyId: string,
    options?: { check_out_date?: string; notes?: string }
  ): Promise<Occupancy> {
    const supabase = createClient();

    // 1. Fetch occupancy record
    const { data: occ, error: fetchErr } = await supabase
      .from("occupancies")
      .select("*")
      .eq("id", occupancyId)
      .maybeSingle();

    if (fetchErr || !occ) {
      throw new Error("Occupancy record not found.");
    }

    if (occ.status !== "active") {
      throw new Error("This occupancy is not active (already checked out or cancelled).");
    }

    // 2. Verify authorization
    const { permissions } = await this.getUserTenantContext(occ.business_id);
    if (!permissions.canCheckOutTenant) {
      throw new Error("Access denied: You do not have permission to check out tenants.");
    }

    if (!canManageStay(permissions, occ.property_id)) {
      throw new Error("Access denied: You do not have permission to manage stays at this property.");
    }

    // 3. Validate checkout date
    const today = new Date().toISOString().split("T")[0];
    const checkOutDate = options?.check_out_date || today;

    if (checkOutDate < occ.check_in_date) {
      throw new Error(`Check-out date (${checkOutDate}) cannot be before check-in date (${occ.check_in_date}).`);
    }

    const updatedNotes = options?.notes
      ? occ.notes
        ? `${occ.notes}\n[Checked out on ${checkOutDate}]: ${options.notes.trim()}`
        : `[Checked out on ${checkOutDate}]: ${options.notes.trim()}`
      : occ.notes;

    // 4. Update occupancy to 'completed'
    // Database trigger sync_bed_occupancy_status will transition bed status from 'occupied' to 'available'.
    const { data, error } = await supabase
      .from("occupancies")
      .update({
        status: "completed",
        check_out_date: checkOutDate,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", occupancyId)
      .eq("status", "active")
      .select()
      .single();

    if (error) {
      console.error("Error checking out tenant:", error);
      throw new Error(error.message || "Failed to check out tenant.");
    }

    return data as Occupancy;
  },

  /**
   * 7. Transfer a tenant to another bed within the same property.
   * Verifies destination room and bed belong to the same property and that the bed is available.
   * Trigger sync_bed_occupancy_status atomically releases the old bed and claims the new bed.
   */
  async transferBed(payload: TransferBedPayload): Promise<Occupancy> {
    const supabase = createClient();

    // 1. Validate payload structure
    const validation = validateTransferBedInput(payload);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError || "Invalid bed transfer parameters.");
    }

    const { sanitized } = validation;

    // 2. Fetch current active occupancy
    const { data: occ, error: occErr } = await supabase
      .from("occupancies")
      .select("*")
      .eq("id", sanitized.occupancy_id)
      .maybeSingle();

    if (occErr || !occ) {
      throw new Error("Active occupancy record not found.");
    }

    if (occ.status !== "active") {
      throw new Error("Cannot transfer bed: This occupancy is no longer active.");
    }

    // 3. Verify user authorization
    const { permissions } = await this.getUserTenantContext(occ.business_id);
    if (!permissions.canTransferBed) {
      throw new Error("Access denied: You do not have permission to transfer beds.");
    }

    if (!canManageStay(permissions, occ.property_id)) {
      throw new Error("Access denied: You do not have permission to manage stays at this property.");
    }

    // 4. Verify destination room belongs to the SAME property
    const { data: destRoom, error: roomErr } = await supabase
      .from("rooms")
      .select("id, property_id, room_number, status")
      .eq("id", sanitized.new_room_id)
      .maybeSingle();

    if (roomErr || !destRoom) {
      throw new Error("Destination room was not found.");
    }

    if (destRoom.property_id !== occ.property_id) {
      throw new Error("Cross-property transfer is not permitted. The destination room must belong to the same property.");
    }

    if (destRoom.status !== "active") {
      throw new Error(`Destination room is not active (current status: ${destRoom.status}).`);
    }

    // 5. Verify destination bed belongs to destination room and is available
    const { data: destBed, error: bedErr } = await supabase
      .from("beds")
      .select("id, room_id, bed_number, monthly_rent, status")
      .eq("id", sanitized.new_bed_id)
      .maybeSingle();

    if (bedErr || !destBed) {
      throw new Error("Destination bed was not found.");
    }

    if (destBed.room_id !== destRoom.id) {
      throw new Error("Destination bed does not belong to the selected destination room.");
    }

    if (destBed.id === occ.bed_id) {
      throw new Error("Destination bed must be different from the currently assigned bed.");
    }

    if (destBed.status !== "available") {
      throw new Error(`Destination bed is not available for occupancy (current status: ${destBed.status}).`);
    }

    // 6. Fetch old bed info for audit notes
    const { data: oldBed } = await supabase
      .from("beds")
      .select("bed_number")
      .eq("id", occ.bed_id)
      .maybeSingle();

    const today = new Date().toISOString().split("T")[0];
    const oldBedLabel = oldBed?.bed_number || occ.bed_id;
    const transferNote = `[Transferred from bed ${oldBedLabel} to ${destBed.bed_number} on ${today}${
      sanitized.notes ? `: ${sanitized.notes}` : ""
    }]`;

    const updatedNotes = occ.notes ? `${occ.notes}\n${transferNote}` : transferNote;

    // Preserve existing occupancy monthly_rent unless new_monthly_rent is explicitly supplied and validated
    let newRent = occ.monthly_rent;
    if (sanitized.new_monthly_rent !== undefined) {
      if (isNaN(sanitized.new_monthly_rent) || sanitized.new_monthly_rent < 0) {
        throw new Error("New monthly rent must be a non-negative amount.");
      }
      newRent = sanitized.new_monthly_rent;
    }

    // 7. Update occupancy record
    // The Migration 007 trigger sync_bed_occupancy_status handles:
    // - releasing old bed (OLD.bed_id) to 'available'
    // - claiming new bed (NEW.bed_id) to 'occupied'
    const { data, error } = await supabase
      .from("occupancies")
      .update({
        room_id: destRoom.id,
        bed_id: destBed.id,
        monthly_rent: newRent,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sanitized.occupancy_id)
      .eq("status", "active")
      .select()
      .single();

    if (error) {
      console.error("Error executing bed transfer:", error);
      throw new Error(error.message || "Failed to transfer bed.");
    }

    return data as Occupancy;
  },

  /**
   * 8. Retrieve occupancy history and related property, room, floor and bed details.
   */
  async getOccupancyHistory(
    tenantId: string,
    businessId?: string
  ): Promise<OccupancyWithDetails[]> {
    const supabase = createClient();

    // 1. Fetch occupancies for this tenant
    const { data: occupancies, error } = await supabase
      .from("occupancies")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("check_in_date", { ascending: false });

    if (error || !occupancies || occupancies.length === 0) {
      return [];
    }

    // 2. Check warden permissions if businessId provided
    let filteredOccs = occupancies;
    if (businessId) {
      const { permissions } = await this.getUserTenantContext(businessId);
      if (permissions.accessiblePropertyIds !== null) {
        filteredOccs = occupancies.filter((o) =>
          permissions.accessiblePropertyIds!.includes(o.property_id)
        );
      }
    }

    if (filteredOccs.length === 0) return [];

    // 3. Batch-fetch property, room, floor, bed labels
    const propertyIds = Array.from(new Set(filteredOccs.map((o) => o.property_id)));
    const roomIds = Array.from(new Set(filteredOccs.map((o) => o.room_id)));
    const bedIds = Array.from(new Set(filteredOccs.map((o) => o.bed_id)));

    const [propsRes, roomsRes, bedsRes] = await Promise.all([
      propertyIds.length > 0
        ? supabase.from("properties").select("id, name").in("id", propertyIds)
        : Promise.resolve({ data: [] }),
      roomIds.length > 0
        ? supabase.from("rooms").select("id, room_number, floor_id").in("id", roomIds)
        : Promise.resolve({ data: [] }),
      bedIds.length > 0
        ? supabase.from("beds").select("id, bed_number").in("id", bedIds)
        : Promise.resolve({ data: [] }),
    ]);

    const roomsData = roomsRes.data || [];
    const floorIds = Array.from(
      new Set(roomsData.map((r) => r.floor_id).filter(Boolean))
    ) as string[];

    const floorsRes =
      floorIds.length > 0
        ? await supabase.from("floors").select("id, name").in("id", floorIds)
        : { data: [] };

    const propMap = (propsRes.data || []).reduce<Record<string, string>>((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {});

    const roomMap = roomsData.reduce<Record<string, string>>((acc, r) => {
      acc[r.id] = r.room_number;
      return acc;
    }, {});

    const roomFloorMap = roomsData.reduce<Record<string, string | null>>((acc, r) => {
      acc[r.id] = r.floor_id;
      return acc;
    }, {});

    const floorMap = (floorsRes.data || []).reduce<Record<string, string>>((acc, f) => {
      acc[f.id] = f.name;
      return acc;
    }, {});

    const bedMap = (bedsRes.data || []).reduce<Record<string, string>>((acc, b) => {
      acc[b.id] = b.bed_number;
      return acc;
    }, {});

    return filteredOccs.map((occ) => ({
      ...occ,
      property_name: propMap[occ.property_id] || "Property",
      room_number: roomMap[occ.room_id] || "Room",
      bed_number: bedMap[occ.bed_id] || "Bed",
      floor_name: occ.room_id && roomFloorMap[occ.room_id] ? floorMap[roomFloorMap[occ.room_id]!] : null,
    }));
  },

  // =========================================================================
  // BACKWARDS COMPATIBILITY HELPERS
  // =========================================================================

  /**
   * Backwards-compatible check-in helper for pre-existing UI calls.
   */
  async registerAndCheckIn(payload: CheckInPayload): Promise<Occupancy> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

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

  /**
   * Backwards-compatible direct tenant insert helper for admin flows.
   */
  async createTenant(
    businessId: string,
    fullName: string,
    phone: string,
    email?: string,
    emergencyContact?: string
  ): Promise<Tenant> {
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
};
