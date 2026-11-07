import { createClient } from "@/lib/supabase/client";
import type {
  Database,
  RoomType,
  BedStatus,
} from "@/types/database.types";
import type {
  Floor,
  Room,
  Bed,
  FloorWithStats,
  RoomWithDetails,
  BedWithOccupant,
  FloorFormData,
  RoomFormData,
  BedFormData,
} from "@/types/app.types";
import {
  validateFloorInput,
  validateRoomInput,
  validateBedInput,
} from "@/lib/validations/room.validation";

export const roomService = {
  // =========================================================================
  // FLOORS MANAGEMENT
  // =========================================================================

  /**
   * Fetches all floors for a property enriched with real-time statistics
   * (roomsCount, bedsTotal, bedsOccupied, bedsAvailable, occupancyRate).
   */
  async getFloorsByProperty(propertyId: string): Promise<FloorWithStats[]> {
    const supabase = createClient();

    // 1. Fetch floors
    const { data: floors, error: fError } = await supabase
      .from("floors")
      .select("*")
      .eq("property_id", propertyId)
      .order("floor_number", { ascending: true, nullsFirst: false });

    if (fError || !floors) {
      console.error("Error fetching floors:", fError?.message);
      return [];
    }

    if (floors.length === 0) return [];

    // 2. Batch-fetch rooms for this property
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, floor_id")
      .eq("property_id", propertyId);

    const roomList = rooms || [];
    const roomIds = roomList.map((r) => r.id);

    // 3. Batch-fetch beds for these rooms
    let beds: Array<{ room_id: string; status: string }> = [];
    if (roomIds.length > 0) {
      const { data: bedsData } = await supabase
        .from("beds")
        .select("room_id, status")
        .in("room_id", roomIds);
      beds = bedsData || [];
    }

    // Map room to floor
    const roomFloorMap = roomList.reduce<Record<string, string | null>>((acc, r) => {
      acc[r.id] = r.floor_id;
      return acc;
    }, {});

    // Compute stats per floor
    const roomsCountMap: Record<string, number> = {};
    const totalBedsMap: Record<string, number> = {};
    const occupiedBedsMap: Record<string, number> = {};

    roomList.forEach((r) => {
      if (r.floor_id) {
        roomsCountMap[r.floor_id] = (roomsCountMap[r.floor_id] || 0) + 1;
      }
    });

    beds.forEach((b) => {
      const floorId = roomFloorMap[b.room_id];
      if (floorId) {
        totalBedsMap[floorId] = (totalBedsMap[floorId] || 0) + 1;
        if (b.status === "occupied") {
          occupiedBedsMap[floorId] = (occupiedBedsMap[floorId] || 0) + 1;
        }
      }
    });

    return floors.map((f) => {
      const roomsCount = roomsCountMap[f.id] || 0;
      const bedsTotal = totalBedsMap[f.id] || 0;
      const bedsOccupied = occupiedBedsMap[f.id] || 0;
      const bedsAvailable = Math.max(0, bedsTotal - bedsOccupied);
      const occupancyRate = bedsTotal > 0 ? Math.round((bedsOccupied / bedsTotal) * 100) : 0;

      return {
        ...f,
        roomsCount,
        bedsTotal,
        bedsOccupied,
        bedsAvailable,
        occupancyRate,
      };
    });
  },

  /**
   * Creates a new floor for the property.
   */
  async createFloor(propertyId: string, formData: FloorFormData): Promise<Floor> {
    const supabase = createClient();

    const validation = validateFloorInput(formData);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError || "Invalid floor details.");
    }

    const { data, error } = await supabase
      .from("floors")
      .insert({
        property_id: propertyId,
        name: validation.sanitized.name,
        floor_number: validation.sanitized.floor_number,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating floor:", error);
      throw new Error(error.message || "Failed to create floor.");
    }

    return data as Floor;
  },

  /**
   * Updates an existing floor's name or number.
   */
  async updateFloor(floorId: string, formData: Partial<FloorFormData>): Promise<Floor> {
    const supabase = createClient();

    const updatePayload: Database["public"]["Tables"]["floors"]["Update"] = {};
    if (formData.name !== undefined) {
      const trimmed = formData.name.trim();
      if (!trimmed) throw new Error("Floor name cannot be empty.");
      updatePayload.name = trimmed;
    }
    if (formData.floor_number !== undefined) {
      updatePayload.floor_number = formData.floor_number;
    }

    const { data, error } = await supabase
      .from("floors")
      .update(updatePayload)
      .eq("id", floorId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || "Failed to update floor.");
    }

    return data as Floor;
  },

  /**
   * Deletes a floor only if no rooms are assigned to it.
   */
  async deleteFloor(floorId: string): Promise<void> {
    const supabase = createClient();

    // Check if rooms exist on this floor
    const { data: rooms, error: checkError } = await supabase
      .from("rooms")
      .select("id")
      .eq("floor_id", floorId);

    if (checkError) {
      throw new Error("Failed to verify floor dependencies.");
    }

    if (rooms && rooms.length > 0) {
      throw new Error(
        `Cannot delete this floor: ${rooms.length} room(s) are assigned to it. Re-assign or delete those rooms first.`
      );
    }

    const { error } = await supabase.from("floors").delete().eq("id", floorId);
    if (error) {
      throw new Error(error.message || "Failed to delete floor.");
    }
  },

  // =========================================================================
  // ROOMS MANAGEMENT
  // =========================================================================

  /**
   * Fetches all rooms for a property with beds and authentic active occupant details.
   * Can be filtered by floor and searched by room number.
   */
  async getRoomsWithDetails(
    propertyId: string,
    filterFloorId?: string | null,
    searchQuery?: string
  ): Promise<RoomWithDetails[]> {
    const supabase = createClient();

    // 1. Fetch floors for label resolution
    const { data: floorsData } = await supabase
      .from("floors")
      .select("*")
      .eq("property_id", propertyId);

    const floorMap = (floorsData || []).reduce<Record<string, Floor>>((acc, f) => {
      acc[f.id] = f;
      return acc;
    }, {});

    // 2. Fetch rooms
    let query = supabase
      .from("rooms")
      .select("*")
      .eq("property_id", propertyId)
      .order("room_number", { ascending: true });

    if (filterFloorId && filterFloorId !== "all") {
      query = query.eq("floor_id", filterFloorId);
    }

    const { data: roomsData, error: rError } = await query;
    if (rError || !roomsData) {
      console.error("Error fetching rooms:", rError?.message);
      return [];
    }

    let filteredRooms = roomsData;
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filteredRooms = roomsData.filter((r) => r.room_number.toLowerCase().includes(q));
    }

    const roomIds = filteredRooms.map((r) => r.id);
    if (roomIds.length === 0) return [];

    // 3. Batch-fetch beds for these rooms
    const { data: bedsData } = await supabase
      .from("beds")
      .select("*")
      .in("room_id", roomIds)
      .order("bed_number", { ascending: true });

    const beds = bedsData || [];

    // 4. Batch-fetch active occupancies with tenant details
    const bedIds = beds.map((b) => b.id);
    const occupantsByBed: Record<
      string,
      {
        occupancy_id: string;
        tenant_id: string;
        tenant_name: string;
        tenant_phone: string | null;
        check_in_date: string;
      }
    > = {};

    if (bedIds.length > 0) {
      const { data: occupancies } = await supabase
        .from("occupancies")
        .select(`
          id,
          bed_id,
          tenant_id,
          check_in_date,
          status,
          tenants!inner(
            id,
            full_name,
            phone
          )
        `)
        .in("bed_id", bedIds)
        .eq("status", "active");

      (occupancies || []).forEach((occ) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = occ.tenants as any;
        occupantsByBed[occ.bed_id] = {
          occupancy_id: occ.id,
          tenant_id: occ.tenant_id,
          tenant_name: t?.full_name || "Active Tenant",
          tenant_phone: t?.phone || null,
          check_in_date: occ.check_in_date,
        };
      });
    }

    // 5. Group beds by room and enrich with occupant info
    const bedsByRoom = beds.reduce<Record<string, BedWithOccupant[]>>((acc, b) => {
      acc[b.room_id] = acc[b.room_id] || [];
      acc[b.room_id].push({
        ...b,
        current_occupant: occupantsByBed[b.id] || null,
      });
      return acc;
    }, {});

    // 6. Build RoomWithDetails list
    return filteredRooms.map((r) => {
      const roomBeds = bedsByRoom[r.id] || [];
      const bedsTotal = roomBeds.length;
      const bedsOccupied = roomBeds.filter((b) => b.status === "occupied").length;
      const bedsAvailable = Math.max(0, bedsTotal - bedsOccupied);
      const occupancyRate = bedsTotal > 0 ? Math.round((bedsOccupied / bedsTotal) * 100) : 0;

      return {
        ...r,
        floor: r.floor_id ? floorMap[r.floor_id] || null : null,
        beds: roomBeds,
        bedsTotal,
        bedsOccupied,
        bedsAvailable,
        occupancyRate,
      };
    });
  },

  /**
   * Fetches single room with complete bed and occupant details.
   */
  async getRoomById(roomId: string): Promise<RoomWithDetails | null> {
    const supabase = createClient();
    const { data: room, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();

    if (error || !room) return null;

    const rooms = await this.getRoomsWithDetails(room.property_id);
    return rooms.find((r) => r.id === roomId) || null;
  },

  /**
   * Creates a room under a property and optionally sets up initial beds.
   */
  async createRoom(
    propertyId: string,
    formData: RoomFormData,
    initialBeds?: { count: number; rentRupees: number }
  ): Promise<RoomWithDetails> {
    const supabase = createClient();

    // 1. Validate room input
    const validation = validateRoomInput(formData);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError || "Invalid room details.");
    }

    // 2. Check room number uniqueness within the property
    const { data: existing } = await supabase
      .from("rooms")
      .select("id")
      .eq("property_id", propertyId)
      .eq("room_number", validation.sanitized.room_number)
      .maybeSingle();

    if (existing) {
      throw new Error(
        `Room "${validation.sanitized.room_number}" already exists in this property. Room numbers must be unique.`
      );
    }

    // 3. Insert Room
    const { data: newRoom, error: roomError } = await supabase
      .from("rooms")
      .insert({
        property_id: propertyId,
        room_number: validation.sanitized.room_number,
        room_type: validation.sanitized.room_type,
        floor_id: validation.sanitized.floor_id || null,
        status: validation.sanitized.status || "active",
      })
      .select()
      .single();

    if (roomError) {
      throw new Error(roomError.message || "Failed to create room.");
    }

    // 4. Optionally create initial beds
    if (initialBeds && initialBeds.count > 0) {
      const rentPaise = Math.round(Math.max(0, initialBeds.rentRupees) * 100);
      const bedInserts = Array.from({ length: initialBeds.count }).map((_, i) => ({
        room_id: newRoom.id,
        bed_number: `${newRoom.room_number}-${String.fromCharCode(65 + i)}`,
        monthly_rent: rentPaise,
        status: "available" as const,
      }));

      const { error: bedError } = await supabase.from("beds").insert(bedInserts);
      if (bedError) {
        console.error("Notice: Initial beds insertion failed:", bedError.message);
      }
    }

    const fullRoom = await this.getRoomById(newRoom.id);
    if (!fullRoom) throw new Error("Created room could not be re-loaded.");
    return fullRoom;
  },

  /**
   * Updates an existing room's room_number, room_type, status, or floor_id.
   */
  async updateRoom(roomId: string, formData: Partial<RoomFormData>): Promise<Room> {
    const supabase = createClient();

    const { data: currentRoom, error: fetchErr } = await supabase
      .from("rooms")
      .select("property_id, room_number")
      .eq("id", roomId)
      .single();

    if (fetchErr || !currentRoom) throw new Error("Room not found.");

    const updatePayload: Database["public"]["Tables"]["rooms"]["Update"] = {};

    if (formData.room_number !== undefined) {
      const trimmed = formData.room_number.trim();
      if (!trimmed) throw new Error("Room number cannot be empty.");

      // Check unique if changing number
      if (trimmed !== currentRoom.room_number) {
        const { data: duplicate } = await supabase
          .from("rooms")
          .select("id")
          .eq("property_id", currentRoom.property_id)
          .eq("room_number", trimmed)
          .neq("id", roomId)
          .maybeSingle();

        if (duplicate) {
          throw new Error(`Room number "${trimmed}" is already in use in this property.`);
        }
      }
      updatePayload.room_number = trimmed;
    }

    if (formData.room_type !== undefined) {
      updatePayload.room_type = formData.room_type;
    }
    if (formData.floor_id !== undefined) {
      updatePayload.floor_id = formData.floor_id || null;
    }
    if (formData.status !== undefined) {
      updatePayload.status = formData.status;
    }

    const { data, error } = await supabase
      .from("rooms")
      .update(updatePayload)
      .eq("id", roomId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || "Failed to update room.");
    }

    return data as Room;
  },

  /**
   * Deletes a room only if all its beds are vacant (no active occupancies).
   */
  async deleteRoom(roomId: string): Promise<void> {
    const supabase = createClient();

    // 1. Fetch beds in this room
    const { data: beds, error: bError } = await supabase
      .from("beds")
      .select("id, bed_number, status")
      .eq("room_id", roomId);

    if (bError) throw new Error("Failed to verify room beds.");

    const occupiedBeds = (beds || []).filter((b) => b.status === "occupied");
    if (occupiedBeds.length > 0) {
      throw new Error(
        `Cannot delete room: ${occupiedBeds.length} bed(s) are currently occupied (${occupiedBeds
          .map((b) => b.bed_number)
          .join(", ")}). Check out occupants before deleting this room.`
      );
    }

    // 2. Safe to delete (beds cascade delete via FK)
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) {
      throw new Error(error.message || "Failed to delete room.");
    }
  },

  // =========================================================================
  // BEDS MANAGEMENT
  // =========================================================================

  /**
   * Adds a new bed to an existing room.
   */
  async addBedToRoom(roomId: string, formData: BedFormData): Promise<Bed> {
    const supabase = createClient();

    const validation = validateBedInput({
      bed_number: formData.bed_number,
      monthly_rent_rupees: formData.monthly_rent / 100,
      status: formData.status || "available",
    });

    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      throw new Error(firstError || "Invalid bed details.");
    }

    // Check unique bed_number within the room
    const { data: existing } = await supabase
      .from("beds")
      .select("id")
      .eq("room_id", roomId)
      .eq("bed_number", validation.sanitized.bed_number)
      .maybeSingle();

    if (existing) {
      throw new Error(
        `Bed "${validation.sanitized.bed_number}" already exists in this room. Bed numbers must be unique within the room.`
      );
    }

    const { data, error } = await supabase
      .from("beds")
      .insert({
        room_id: roomId,
        bed_number: validation.sanitized.bed_number,
        monthly_rent: validation.sanitized.monthly_rent,
        status: validation.sanitized.status || "available",
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message || "Failed to add bed.");
    }

    return data as Bed;
  },

  /**
   * Updates an existing bed (rent, number, or non-occupied status).
   * Strict Rule: Never allows changing an occupied bed to available directly.
   */
  async updateBed(bedId: string, formData: Partial<BedFormData>): Promise<Bed> {
    const supabase = createClient();

    const { data: currentBed, error: fetchErr } = await supabase
      .from("beds")
      .select("id, room_id, bed_number, status")
      .eq("id", bedId)
      .single();

    if (fetchErr || !currentBed) throw new Error("Bed not found.");

    const updatePayload: Database["public"]["Tables"]["beds"]["Update"] = {};

    if (formData.bed_number !== undefined) {
      const trimmed = formData.bed_number.trim();
      if (!trimmed) throw new Error("Bed number cannot be empty.");

      if (trimmed !== currentBed.bed_number) {
        const { data: duplicate } = await supabase
          .from("beds")
          .select("id")
          .eq("room_id", currentBed.room_id)
          .eq("bed_number", trimmed)
          .neq("id", bedId)
          .maybeSingle();

        if (duplicate) {
          throw new Error(`Bed number "${trimmed}" is already in use in this room.`);
        }
      }
      updatePayload.bed_number = trimmed;
    }

    if (formData.monthly_rent !== undefined) {
      if (formData.monthly_rent < 0) throw new Error("Monthly rent cannot be negative.");
      updatePayload.monthly_rent = formData.monthly_rent;
    }

    if (formData.status !== undefined) {
      // Rule 5: Cannot override occupancy trigger
      if (currentBed.status === "occupied" && formData.status !== "occupied") {
        throw new Error(
          "Cannot manually change status of an occupied bed. Check out the tenant in the Tenants module to release this bed."
        );
      }
      updatePayload.status = formData.status;
    }

    const { data, error } = await supabase
      .from("beds")
      .update(updatePayload)
      .eq("id", bedId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || "Failed to update bed.");
    }

    return data as Bed;
  },

  /**
   * Updates bed status with strict occupancy guard.
   */
  async updateBedStatus(bedId: string, newStatus: BedStatus): Promise<Bed> {
    return this.updateBed(bedId, { status: newStatus });
  },

  /**
   * Deletes a bed only if it is not currently occupied.
   */
  async deleteBed(bedId: string): Promise<void> {
    const supabase = createClient();

    const { data: bed, error: fetchErr } = await supabase
      .from("beds")
      .select("id, bed_number, status")
      .eq("id", bedId)
      .single();

    if (fetchErr || !bed) throw new Error("Bed not found.");

    if (bed.status === "occupied") {
      throw new Error(
        `Cannot delete bed "${bed.bed_number}" because it is currently occupied. Check out the tenant first.`
      );
    }

    // Check if there is an active occupancy in the database
    const { data: activeOcc } = await supabase
      .from("occupancies")
      .select("id")
      .eq("bed_id", bedId)
      .eq("status", "active")
      .maybeSingle();

    if (activeOcc) {
      throw new Error(
        `Cannot delete bed "${bed.bed_number}" with an active occupancy record.`
      );
    }

    const { error } = await supabase.from("beds").delete().eq("id", bedId);
    if (error) {
      throw new Error(error.message || "Failed to delete bed.");
    }
  },

  // =========================================================================
  // BACKWARDS COMPATIBILITY HELPERS
  // =========================================================================

  async getRoomsByProperty(propertyId: string) {
    return this.getRoomsWithDetails(propertyId);
  },

  async createRoomWithBeds(
    propertyId: string,
    roomNumber: string,
    roomType: RoomType,
    bedCount: number,
    monthlyRentPaise: number,
    floorId?: string
  ) {
    return this.createRoom(
      propertyId,
      {
        room_number: roomNumber,
        room_type: roomType,
        floor_id: floorId,
        status: "active",
      },
      {
        count: bedCount,
        rentRupees: monthlyRentPaise / 100,
      }
    );
  },

  async getAvailableBeds(propertyId: string): Promise<Bed[]> {
    const supabase = createClient();
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id")
      .eq("property_id", propertyId);

    if (!rooms || rooms.length === 0) return [];

    const { data: beds } = await supabase
      .from("beds")
      .select("*")
      .in(
        "room_id",
        rooms.map((r) => r.id)
      )
      .eq("status", "available");

    return beds || [];
  },
};
