import type { Database, UserRole, MemberStatus, PropertyStatus, RoomType, RoomStatus, BedStatus, PaymentMethod, TenantGender } from "./database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type BusinessMember = Database["public"]["Tables"]["business_members"]["Row"];
export type Property = Database["public"]["Tables"]["properties"]["Row"];
export type PropertyStaff = Database["public"]["Tables"]["property_staff"]["Row"];
export type Floor = Database["public"]["Tables"]["floors"]["Row"];
export type Room = Database["public"]["Tables"]["rooms"]["Row"];
export type Bed = Database["public"]["Tables"]["beds"]["Row"];
export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type Occupancy = Database["public"]["Tables"]["occupancies"]["Row"];
export type RentCharge = Database["public"]["Tables"]["rent_charges"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentAllocation = Database["public"]["Tables"]["payment_allocations"]["Row"];

export interface CurrentUserSession {
  profile: Profile;
  activeBusiness: Business | null;
  activeRole: UserRole | null;
  businesses: Array<{
    business: Business;
    role: UserRole;
    status: MemberStatus;
  }>;
  accessiblePropertyIds: string[];
}

export interface BedWithRoomInfo extends Bed {
  room?: Room;
}

export interface RoomWithBeds extends Room {
  beds: Bed[];
  floor?: Floor | null;
}

export interface BedWithOccupant extends Bed {
  current_occupant?: {
    occupancy_id: string;
    tenant_id: string;
    tenant_name: string;
    tenant_phone: string | null;
    check_in_date: string;
  } | null;
}

export interface RoomWithDetails extends Room {
  floor?: Floor | null;
  beds: BedWithOccupant[];
  bedsTotal: number;
  bedsOccupied: number;
  bedsAvailable: number;
  occupancyRate: number;
}

export interface FloorWithStats extends Floor {
  roomsCount: number;
  bedsTotal: number;
  bedsOccupied: number;
  bedsAvailable: number;
  occupancyRate: number;
}

export interface FloorFormData {
  name: string;
  floor_number?: number | null;
}

export interface RoomFormData {
  room_number: string;
  room_type: RoomType;
  floor_id?: string | null;
  status?: RoomStatus;
}

export interface BedFormData {
  bed_number: string;
  monthly_rent: number; // in paise
  status?: BedStatus;
}


export interface PropertyOverview extends Property {
  floors_count?: number;
  rooms_count?: number;
  total_beds?: number;
  occupied_beds?: number;
  available_beds?: number;
}

export interface PropertyAssignedStaff {
  id: string;
  business_member_id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
}

export interface PropertyWithStats extends Property {
  floorsCount: number;
  roomsCount: number;
  bedsTotal: number;
  bedsOccupied: number;
  bedsAvailable: number;
  occupancyRate: number;
  assignedStaff: PropertyAssignedStaff[];
}

export interface PropertyFormData {
  name: string;
  address?: string | null;
  status?: PropertyStatus;
}

export interface PropertyFilterOptions {
  search?: string;
  status?: PropertyStatus | "all";
  sortBy?: "name" | "created_at" | "occupancy" | "rooms";
  sortOrder?: "asc" | "desc";
}


export interface TenantWithStay extends Tenant {
  current_occupancy?: (Occupancy & {
    room?: Room;
    bed?: Bed;
    property?: Property;
  }) | null;
  pending_dues?: number;
}

export interface RentChargeWithDetails extends RentCharge {
  tenant?: Tenant;
  property?: Property;
  occupancy?: Occupancy;
  balance?: number;
}

export interface PaymentWithDetails extends Payment {
  tenant?: Tenant;
  property?: Property;
  allocations?: Array<PaymentAllocation & {
    rent_charge?: RentCharge;
  }>;
}

export interface DashboardMetrics {
  totalProperties: number;
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
  pendingRentPaise: number;
  monthlyCollectionPaise: number;
  activeTenantsCount: number;
}

export interface CheckInPayload {
  business_id: string;
  property_id: string;
  tenant_id: string;
  room_id: string;
  bed_id: string;
  check_in_date: string;
  expected_check_out_date?: string | null;
  monthly_rent: number;
  security_deposit: number;
  notes?: string | null;
}

export interface RecordPaymentPayload {
  business_id: string;
  property_id: string;
  tenant_id: string;
  amount: number;
  payment_method: PaymentMethod;
  transaction_reference?: string | null;
  notes?: string | null;
  paid_at?: string;
  auto_allocate?: boolean;
  allocations?: Array<{
    rent_charge_id: string;
    allocated_amount: number;
  }>;
}

export type { UserRole, MemberStatus, PropertyStatus, RoomType, RoomStatus, BedStatus, PaymentMethod, TenantGender };
