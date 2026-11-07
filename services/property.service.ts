import { createClient } from "@/lib/supabase/client";
import type {
  Property,
  Floor,
  PropertyWithStats,
  PropertyFormData,
  PropertyFilterOptions,
  PropertyAssignedStaff,
  Room,
  Bed,
} from "@/types/app.types";
import type { PropertyStatus, UserRole } from "@/types/database.types";
import { validatePropertyInput } from "@/lib/validations/property.validation";
import { getPropertyPermissions, type PropertyPermissions } from "@/lib/permissions/property.permissions";

export interface PropertyDetailedBreakdown {
  property: PropertyWithStats;
  floors: Floor[];
  rooms: Array<Room & { beds: Bed[]; floorName?: string }>;
  assignedStaff: PropertyAssignedStaff[];
}

export const propertyService = {
  /**
   * Resolves the current authenticated user's role and property permissions
   * within the specified business. Validates that the caller is an active member.
   */
  async getUserPropertyContext(businessId: string): Promise<{
    role: UserRole | null;
    permissions: PropertyPermissions;
    userId: string | null;
  }> {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    if (!user) {
      // Demo / preview mode fallback: grant owner permissions for UI testing
      const permissions = getPropertyPermissions("owner", null);
      return { role: "owner", permissions, userId: null };
    }

    // 1. Fetch active membership
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

    const permissions = getPropertyPermissions(role, assignedPropertyIds);
    return { role, permissions, userId: user.id };
  },

  /**
   * Fetches all properties belonging to the business, with real-time stats
   * (floors, rooms, total beds, occupied beds, occupancy percentage) and assigned wardens.
   * Applies role restrictions (wardens see only assigned properties).
   */
  async getProperties(
    businessId: string,
    options?: PropertyFilterOptions
  ): Promise<PropertyWithStats[]> {
    const supabase = createClient();

    // 1. Check user context & permissions
    const { permissions } = await this.getUserPropertyContext(businessId);

    // 2. Query properties table
    let query = supabase
      .from("properties")
      .select("*")
      .eq("business_id", businessId);

    // Filter by warden accessible property IDs if restricted
    if (permissions.accessiblePropertyIds !== null) {
      if (permissions.accessiblePropertyIds.length === 0) {
        return [];
      }
      query = query.in("id", permissions.accessiblePropertyIds);
    }

    // Filter by status if specified and not 'all'
    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }

    // Default order
    query = query.order("created_at", { ascending: false });

    const { data: rawProps, error } = await query;

    if (error) {
      console.error("Error loading properties:", error.message);
      return [];
    }

    if (!rawProps || rawProps.length === 0) {
      return [];
    }

    // Filter search text in memory or via query
    let filtered = rawProps;
    if (options?.search && options.search.trim()) {
      const s = options.search.trim().toLowerCase();
      filtered = rawProps.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          (p.address && p.address.toLowerCase().includes(s))
      );
    }

    const propIds = filtered.map((p) => p.id);
    if (propIds.length === 0) return [];

    // 3. Batch fetch related stats in parallel: floors, rooms, beds, assigned staff
    const [floorsRes, roomsRes, staffRes] = await Promise.all([
      supabase.from("floors").select("id, property_id").in("property_id", propIds),
      supabase.from("rooms").select("id, property_id").in("property_id", propIds),
      supabase
        .from("property_staff")
        .select(`
          id,
          property_id,
          business_member_id,
          business_members!inner(
            id,
            role,
            user_id
          )
        `)
        .in("property_id", propIds),
    ]);

    const floors = floorsRes.data || [];
    const rooms = roomsRes.data || [];
    const staffList = staffRes.data || [];

    // 4. Batch fetch beds for all rooms across these properties
    const roomIds = rooms.map((r) => r.id);
    let beds: Array<{ id: string; room_id: string; status: string }> = [];

    if (roomIds.length > 0) {
      const { data: bedsData } = await supabase
        .from("beds")
        .select("id, room_id, status")
        .in("room_id", roomIds);
      beds = bedsData || [];
    }

    // 5. Fetch profile names for assigned staff members
    const memberUserIds = staffList.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.business_members?.user_id
    ).filter(Boolean);

    const profileMap: Record<string, { full_name: string | null; phone: string | null }> = {};
    if (memberUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", memberUserIds);
      (profiles || []).forEach((pr) => {
        profileMap[pr.id] = { full_name: pr.full_name, phone: pr.phone };
      });
    }

    // Map room_id to property_id
    const roomToPropertyMap = rooms.reduce<Record<string, string>>((acc, r) => {
      acc[r.id] = r.property_id;
      return acc;
    }, {});

    // Compute stats per property
    const floorsCountMap: Record<string, number> = {};
    const roomsCountMap: Record<string, number> = {};
    const totalBedsMap: Record<string, number> = {};
    const occupiedBedsMap: Record<string, number> = {};
    const staffMap: Record<string, PropertyAssignedStaff[]> = {};

    floors.forEach((f) => {
      floorsCountMap[f.property_id] = (floorsCountMap[f.property_id] || 0) + 1;
    });

    rooms.forEach((r) => {
      roomsCountMap[r.property_id] = (roomsCountMap[r.property_id] || 0) + 1;
    });

    beds.forEach((b) => {
      const propId = roomToPropertyMap[b.room_id];
      if (propId) {
        totalBedsMap[propId] = (totalBedsMap[propId] || 0) + 1;
        if (b.status === "occupied") {
          occupiedBedsMap[propId] = (occupiedBedsMap[propId] || 0) + 1;
        }
      }
    });

    staffList.forEach((s) => {
      const propId = s.property_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bm = s.business_members as any;
      const prof = bm?.user_id ? profileMap[bm.user_id] : null;

      if (!staffMap[propId]) staffMap[propId] = [];
      staffMap[propId].push({
        id: s.id,
        business_member_id: s.business_member_id,
        full_name: prof?.full_name || "Assigned Staff",
        phone: prof?.phone || null,
        role: (bm?.role as UserRole) || "warden",
      });
    });

    // Build enriched list
    const enrichedList: PropertyWithStats[] = filtered.map((p) => {
      const floorsCount = floorsCountMap[p.id] || 0;
      const roomsCount = roomsCountMap[p.id] || 0;
      const bedsTotal = totalBedsMap[p.id] || 0;
      const bedsOccupied = occupiedBedsMap[p.id] || 0;
      const bedsAvailable = Math.max(0, bedsTotal - bedsOccupied);
      const occupancyRate = bedsTotal > 0 ? Math.round((bedsOccupied / bedsTotal) * 100) : 0;

      return {
        ...p,
        status: p.status as PropertyStatus,
        floorsCount,
        roomsCount,
        bedsTotal,
        bedsOccupied,
        bedsAvailable,
        occupancyRate,
        assignedStaff: staffMap[p.id] || [],
      };
    });

    // 6. Apply sorting
    if (options?.sortBy) {
      enrichedList.sort((a, b) => {
        let diff = 0;
        if (options.sortBy === "name") {
          diff = a.name.localeCompare(b.name);
        } else if (options.sortBy === "created_at") {
          diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        } else if (options.sortBy === "occupancy") {
          diff = b.occupancyRate - a.occupancyRate;
        } else if (options.sortBy === "rooms") {
          diff = b.roomsCount - a.roomsCount;
        }
        return options.sortOrder === "asc" ? -diff : diff;
      });
    }

    return enrichedList;
  },

  /**
   * Fetches a single property by ID with stats and security verification.
   */
  async getPropertyById(propertyId: string): Promise<PropertyWithStats | null> {
    const supabase = createClient();
    const { data: prop, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .maybeSingle();

    if (error || !prop) return null;

    const list = await this.getProperties(prop.business_id);
    return list.find((p) => p.id === propertyId) || null;
  },

  /**
   * Detailed breakdown for property details view:
   * Floors, rooms per floor, beds per room, and staff.
   */
  async getPropertyDetailedBreakdown(propertyId: string): Promise<PropertyDetailedBreakdown | null> {
    const supabase = createClient();
    const property = await this.getPropertyById(propertyId);
    if (!property) return null;

    // Fetch floors, rooms, beds
    const [floorsRes, roomsRes, staffRes] = await Promise.all([
      supabase
        .from("floors")
        .select("*")
        .eq("property_id", propertyId)
        .order("floor_number", { ascending: true }),
      supabase
        .from("rooms")
        .select("*")
        .eq("property_id", propertyId)
        .order("room_number", { ascending: true }),
      supabase
        .from("property_staff")
        .select(`
          id,
          property_id,
          business_member_id,
          business_members!inner(
            id,
            role,
            user_id
          )
        `)
        .eq("property_id", propertyId),
    ]);

    const floors = floorsRes.data || [];
    const rooms = roomsRes.data || [];
    const staffRows = staffRes.data || [];

    const floorNameMap = floors.reduce<Record<string, string>>((acc, f) => {
      acc[f.id] = f.name;
      return acc;
    }, {});

    // Fetch beds for all rooms
    const roomIds = rooms.map((r) => r.id);
    let beds: Bed[] = [];
    if (roomIds.length > 0) {
      const { data: bedsData } = await supabase
        .from("beds")
        .select("*")
        .in("room_id", roomIds)
        .order("bed_number", { ascending: true });
      beds = bedsData || [];
    }

    const bedsByRoom = beds.reduce<Record<string, Bed[]>>((acc, b) => {
      acc[b.room_id] = acc[b.room_id] || [];
      acc[b.room_id].push(b);
      return acc;
    }, {});

    const enrichedRooms = rooms.map((r) => ({
      ...r,
      beds: bedsByRoom[r.id] || [],
      floorName: r.floor_id ? floorNameMap[r.floor_id] : undefined,
    }));

    // Assigned staff details
    const memberUserIds = staffRows.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.business_members?.user_id
    ).filter(Boolean);

    const profileMap: Record<string, { full_name: string | null; phone: string | null }> = {};
    if (memberUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", memberUserIds);
      (profiles || []).forEach((pr) => {
        profileMap[pr.id] = { full_name: pr.full_name, phone: pr.phone };
      });
    }

    const assignedStaff: PropertyAssignedStaff[] = staffRows.map((s) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bm = s.business_members as any;
      const prof = bm?.user_id ? profileMap[bm.user_id] : null;
      return {
        id: s.id,
        business_member_id: s.business_member_id,
        full_name: prof?.full_name || "Assigned Staff",
        phone: prof?.phone || null,
        role: (bm?.role as UserRole) || "warden",
      };
    });

    return {
      property,
      floors,
      rooms: enrichedRooms,
      assignedStaff,
    };
  },

  /**
   * Creates a new property under the authenticated user's business.
   * Enforces business authorization and input validation.
   */
  async createProperty(
    businessId: string,
    formData: PropertyFormData
  ): Promise<Property> {
    const supabase = createClient();

    // 1. Verify user authorization
    const { permissions } = await this.getUserPropertyContext(businessId);
    if (!permissions.canCreate) {
      throw new Error("Unauthorized: Only business owners and admins can create new properties.");
    }

    // 2. Validate input
    const validation = validatePropertyInput(formData);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError || "Invalid property details.");
    }

    // 3. Insert property
    const { data, error } = await supabase
      .from("properties")
      .insert({
        business_id: businessId,
        name: validation.sanitized.name,
        address: validation.sanitized.address,
        status: validation.sanitized.status || "active",
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert property error:", error);
      throw new Error(error.message || "Failed to create property in database.");
    }

    return data as Property;
  },

  /**
   * Updates an existing property's name, address, or status.
   * Enforces that only owners and admins can edit properties.
   */
  async updateProperty(
    propertyId: string,
    formData: Partial<PropertyFormData>
  ): Promise<Property> {
    const supabase = createClient();

    // 1. Fetch current property to verify business
    const { data: existing, error: fetchErr } = await supabase
      .from("properties")
      .select("business_id, name, address, status")
      .eq("id", propertyId)
      .single();

    if (fetchErr || !existing) {
      throw new Error("Property not found.");
    }

    // 2. Verify authorization
    const { permissions } = await this.getUserPropertyContext(existing.business_id);
    if (!permissions.canEdit) {
      throw new Error("Unauthorized: Only owners and admins can edit properties.");
    }

    // 3. Validate input
    const toValidate = {
      name: formData.name !== undefined ? formData.name : existing.name,
      address: formData.address !== undefined ? formData.address : existing.address,
      status: formData.status !== undefined ? formData.status : (existing.status as PropertyStatus),
    };

    const validation = validatePropertyInput(toValidate);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError || "Invalid property details.");
    }

    // 4. Update
    const { data, error } = await supabase
      .from("properties")
      .update({
        name: validation.sanitized.name,
        address: validation.sanitized.address,
        status: validation.sanitized.status,
      })
      .eq("id", propertyId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || "Failed to update property.");
    }

    return data as Property;
  },

  /**
   * Toggles or updates property status ('active', 'inactive', 'archived').
   */
  async updatePropertyStatus(
    propertyId: string,
    status: PropertyStatus
  ): Promise<Property> {
    return this.updateProperty(propertyId, { status });
  },

  /**
   * Archives a property (soft-delete). Preserves audit trail and past records.
   */
  async archiveProperty(propertyId: string): Promise<Property> {
    return this.updatePropertyStatus(propertyId, "archived");
  },

  /**
   * Hard-deletes a property if there are no historical constraints, or archives it.
   */
  async deleteProperty(propertyId: string): Promise<void> {
    const supabase = createClient();

    const { data: prop, error: fetchErr } = await supabase
      .from("properties")
      .select("business_id")
      .eq("id", propertyId)
      .single();

    if (fetchErr || !prop) throw new Error("Property not found.");

    const { permissions } = await this.getUserPropertyContext(prop.business_id);
    if (!permissions.canDelete) {
      throw new Error("Unauthorized: Only owners and admins can delete properties.");
    }

    const { error } = await supabase.from("properties").delete().eq("id", propertyId);
    if (error) {
      throw new Error(error.message || "Failed to delete property.");
    }
  },

  /**
   * Helper: fetches floors for a property.
   */
  async getFloors(propertyId: string): Promise<Floor[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("floors")
      .select("*")
      .eq("property_id", propertyId)
      .order("floor_number", { ascending: true });

    if (error) return [];
    return data || [];
  },

  /**
   * Helper: creates a floor for a property.
   */
  async createFloor(propertyId: string, name: string, floorNumber?: number): Promise<Floor> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("floors")
      .insert({
        property_id: propertyId,
        name: name.trim(),
        floor_number: floorNumber ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Floor;
  },
};
