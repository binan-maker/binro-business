export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "owner" | "admin" | "warden";
export type MemberStatus = "active" | "invited" | "suspended";
export type PropertyStatus = "active" | "inactive" | "archived";
export type RoomType = "single" | "shared" | "dormitory";
export type RoomStatus = "active" | "inactive" | "maintenance";
export type BedStatus = "available" | "occupied" | "maintenance" | "inactive";
export type TenantStatus = "active" | "inactive" | "archived";
export type TenantGender = "male" | "female" | "other" | "prefer_not_to_say";
export type OccupancyStatus = "active" | "completed" | "cancelled";
export type RentChargeStatus = "pending" | "partially_paid" | "paid" | "waived";
export type PaymentMethod = "cash" | "upi" | "bank_transfer" | "other";
export type PaymentStatus = "received" | "reversed";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      businesses: {
        Row: {
          id: string;
          owner_user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_user_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_user_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      business_members: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          role: UserRole;
          status: MemberStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          role: UserRole;
          status?: MemberStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          user_id?: string;
          role?: UserRole;
          status?: MemberStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      properties: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          address: string | null;
          status: PropertyStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          address?: string | null;
          status?: PropertyStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          address?: string | null;
          status?: PropertyStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      property_staff: {
        Row: {
          id: string;
          property_id: string;
          business_id: string;
          business_member_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          business_id: string;
          business_member_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          business_id?: string;
          business_member_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      floors: {
        Row: {
          id: string;
          property_id: string;
          name: string;
          floor_number: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          name: string;
          floor_number?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          name?: string;
          floor_number?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          property_id: string;
          floor_id: string | null;
          room_number: string;
          room_type: RoomType;
          status: RoomStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          floor_id?: string | null;
          room_number: string;
          room_type?: RoomType;
          status?: RoomStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          floor_id?: string | null;
          room_number?: string;
          room_type?: RoomType;
          status?: RoomStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      beds: {
        Row: {
          id: string;
          room_id: string;
          bed_number: string;
          monthly_rent: number;
          status: BedStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          bed_number: string;
          monthly_rent?: number;
          status?: BedStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          bed_number?: string;
          monthly_rent?: number;
          status?: BedStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          business_id: string;
          full_name: string;
          phone: string;
          email: string | null;
          emergency_contact: string | null;
          emergency_contact_name: string | null;
          date_of_birth: string | null;
          gender: TenantGender | null;
          address: string | null;
          identity_type: string | null;
          identity_reference: string | null;
          notes: string | null;
          status: TenantStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          full_name: string;
          phone: string;
          email?: string | null;
          emergency_contact?: string | null;
          emergency_contact_name?: string | null;
          date_of_birth?: string | null;
          gender?: TenantGender | null;
          address?: string | null;
          identity_type?: string | null;
          identity_reference?: string | null;
          notes?: string | null;
          status?: TenantStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          full_name?: string;
          phone?: string;
          email?: string | null;
          emergency_contact?: string | null;
          emergency_contact_name?: string | null;
          date_of_birth?: string | null;
          gender?: TenantGender | null;
          address?: string | null;
          identity_type?: string | null;
          identity_reference?: string | null;
          notes?: string | null;
          status?: TenantStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      occupancies: {
        Row: {
          id: string;
          business_id: string;
          property_id: string;
          tenant_id: string;
          room_id: string;
          bed_id: string;
          check_in_date: string;
          expected_check_out_date: string | null;
          check_out_date: string | null;
          monthly_rent: number;
          security_deposit: number;
          status: OccupancyStatus;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          property_id: string;
          tenant_id: string;
          room_id: string;
          bed_id: string;
          check_in_date?: string;
          expected_check_out_date?: string | null;
          check_out_date?: string | null;
          monthly_rent?: number;
          security_deposit?: number;
          status?: OccupancyStatus;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          property_id?: string;
          tenant_id?: string;
          room_id?: string;
          bed_id?: string;
          check_in_date?: string;
          expected_check_out_date?: string | null;
          check_out_date?: string | null;
          monthly_rent?: number;
          security_deposit?: number;
          status?: OccupancyStatus;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rent_charges: {
        Row: {
          id: string;
          business_id: string;
          property_id: string;
          tenant_id: string;
          occupancy_id: string;
          period_start: string;
          period_end: string;
          due_date: string;
          amount: number;
          amount_paid: number;
          status: RentChargeStatus;
          description: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          property_id: string;
          tenant_id: string;
          occupancy_id: string;
          period_start: string;
          period_end: string;
          due_date: string;
          amount: number;
          amount_paid?: number;
          status?: RentChargeStatus;
          description?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          property_id?: string;
          tenant_id?: string;
          occupancy_id?: string;
          period_start?: string;
          period_end?: string;
          due_date?: string;
          amount?: number;
          amount_paid?: number;
          status?: RentChargeStatus;
          description?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          business_id: string;
          property_id: string;
          tenant_id: string;
          amount: number;
          payment_method: PaymentMethod;
          transaction_reference: string | null;
          notes: string | null;
          paid_at: string;
          status: PaymentStatus;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          property_id: string;
          tenant_id: string;
          amount: number;
          payment_method: PaymentMethod;
          transaction_reference?: string | null;
          notes?: string | null;
          paid_at?: string;
          status?: PaymentStatus;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          property_id?: string;
          tenant_id?: string;
          amount?: number;
          payment_method?: PaymentMethod;
          transaction_reference?: string | null;
          notes?: string | null;
          paid_at?: string;
          status?: PaymentStatus;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_allocations: {
        Row: {
          id: string;
          payment_id: string;
          rent_charge_id: string;
          business_id: string;
          property_id: string;
          tenant_id: string;
          allocated_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          rent_charge_id: string;
          business_id: string;
          property_id: string;
          tenant_id: string;
          allocated_amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          payment_id?: string;
          rent_charge_id?: string;
          business_id?: string;
          property_id?: string;
          tenant_id?: string;
          allocated_amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
