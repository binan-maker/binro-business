import { createClient } from "@/lib/supabase/client";
import type { Property, Floor } from "@/types/app.types";

export const propertyService = {
  async getProperties(businessId: string): Promise<Property[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading properties:", error.message);
      return [];
    }
    return data || [];
  },

  async createProperty(businessId: string, name: string, address?: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("properties")
      .insert({
        business_id: businessId,
        name: name.trim(),
        address: address?.trim() || null,
        status: "active",
      })
      .select()
      .single();

    if (error) throw error;
    return data as Property;
  },

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

  async createFloor(propertyId: string, name: string, floorNumber?: number) {
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
