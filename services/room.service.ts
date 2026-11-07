import { createClient } from "@/lib/supabase/client";
import type { Room, Bed, RoomType } from "@/types/app.types";

export interface RoomWithBedsList extends Room {
  beds: Bed[];
}

export const roomService = {
  async getRoomsByProperty(propertyId: string): Promise<RoomWithBedsList[]> {
    const supabase = createClient();
    const { data: rooms, error: rError } = await supabase
      .from("rooms")
      .select("*")
      .eq("property_id", propertyId)
      .order("room_number", { ascending: true });

    if (rError || !rooms) return [];

    const roomIds = rooms.map((r) => r.id);
    if (roomIds.length === 0) return [];

    const { data: beds } = await supabase
      .from("beds")
      .select("*")
      .in("room_id", roomIds)
      .order("bed_number", { ascending: true });

    const bedsByRoom = (beds || []).reduce<Record<string, Bed[]>>((acc, bed) => {
      acc[bed.room_id] = acc[bed.room_id] || [];
      acc[bed.room_id].push(bed);
      return acc;
    }, {});

    return rooms.map((r) => ({
      ...r,
      beds: bedsByRoom[r.id] || [],
    }));
  },

  async createRoomWithBeds(
    propertyId: string,
    roomNumber: string,
    roomType: RoomType,
    bedCount: number,
    monthlyRentPaise: number,
    floorId?: string
  ) {
    const supabase = createClient();

    // 1. Create Room
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .insert({
        property_id: propertyId,
        room_number: roomNumber.trim(),
        room_type: roomType,
        floor_id: floorId || null,
        status: "active",
      })
      .select()
      .single();

    if (roomError) throw roomError;

    // 2. Create Beds for this room
    const bedInserts = Array.from({ length: bedCount }).map((_, i) => ({
      room_id: room.id,
      bed_number: `${roomNumber.trim()}-${String.fromCharCode(65 + i)}`,
      monthly_rent: monthlyRentPaise,
      status: "available" as const,
    }));

    const { data: beds, error: bedError } = await supabase
      .from("beds")
      .insert(bedInserts)
      .select();

    if (bedError) throw bedError;

    return {
      ...room,
      beds: beds || [],
    };
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
      .in("room_id", rooms.map((r) => r.id))
      .eq("status", "available");

    return beds || [];
  },
};
