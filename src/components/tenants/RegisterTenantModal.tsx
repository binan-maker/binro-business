"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  UserPlus,
  Building,
  DoorOpen,
  BedDouble,
  IndianRupee,
  Phone,
  Mail,
  User,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { PropertyWithStats, RoomWithDetails, BedWithOccupant } from "@/types/app.types";
import type { TenantGender } from "@/types/database.types";
import { tenantService } from "@/services/tenant.service";
import { roomService } from "@/services/room.service";
import { validateRegisterTenantInput } from "@/lib/validations/tenant.validation";

interface RegisterTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  properties: PropertyWithStats[];
  initialPropertyId?: string;
  onSuccess: () => void;
}

export function RegisterTenantModal({
  isOpen,
  onClose,
  businessId,
  properties,
  initialPropertyId,
  onSuccess,
}: RegisterTenantModalProps) {
  // Step/Tab state: "tenant" (demographics) vs "stay" (property/room/bed allocation)
  const [activeTab, setActiveTab] = useState<"tenant" | "stay">("tenant");

  // Tenant Fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<TenantGender | "">("");
  const [address, setAddress] = useState("");
  const [identityType, setIdentityType] = useState("Aadhaar");
  const [identityReference, setIdentityReference] = useState("");
  const [tenantNotes, setTenantNotes] = useState("");

  // Stay / Allocation Fields
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [rooms, setRooms] = useState<RoomWithDetails[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [availableBeds, setAvailableBeds] = useState<BedWithOccupant[]>([]);
  const [selectedBedId, setSelectedBedId] = useState("");

  const [checkInDate, setCheckInDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expectedCheckOutDate, setExpectedCheckOutDate] = useState("");
  const [monthlyRentRupees, setMonthlyRentRupees] = useState<number | string>(8500);
  const [securityDepositRupees, setSecurityDepositRupees] = useState<number | string>(17000);
  const [occupancyNotes, setOccupancyNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize selected property
  useEffect(() => {
    if (!isOpen) return;

    if (initialPropertyId && properties.some((p) => p.id === initialPropertyId)) {
      setSelectedPropertyId(initialPropertyId);
    } else if (properties.length > 0) {
      setSelectedPropertyId(properties[0].id);
    }
    setErrorMsg(null);
    setActiveTab("tenant");
  }, [isOpen, initialPropertyId, properties]);

  // Load rooms and their available beds when property changes
  useEffect(() => {
    if (!isOpen || !selectedPropertyId) return;

    let isMounted = true;
    async function fetchInventory() {
      setLoadingRooms(true);
      try {
        const roomsData = await roomService.getRoomsWithDetails(selectedPropertyId);
        if (!isMounted) return;

        // Filter active rooms
        const activeRooms = roomsData.filter((r) => r.status === "active");
        setRooms(activeRooms);

        if (activeRooms.length > 0) {
          // Find first room with at least one available bed
          const roomWithAvailableBed = activeRooms.find((r) =>
            r.beds.some((b) => b.status === "available")
          );
          const defaultRoom = roomWithAvailableBed || activeRooms[0];
          setSelectedRoomId(defaultRoom.id);

          const freeBeds = defaultRoom.beds.filter((b) => b.status === "available");
          setAvailableBeds(freeBeds);

          if (freeBeds.length > 0) {
            setSelectedBedId(freeBeds[0].id);
            const rent = Math.round(freeBeds[0].monthly_rent / 100);
            setMonthlyRentRupees(rent);
            setSecurityDepositRupees(rent * 2);
          } else {
            setSelectedBedId("");
          }
        } else {
          setSelectedRoomId("");
          setAvailableBeds([]);
          setSelectedBedId("");
        }
      } catch (err) {
        console.error("Failed to fetch property rooms:", err);
      } finally {
        if (isMounted) setLoadingRooms(false);
      }
    }

    fetchInventory();
    return () => {
      isMounted = false;
    };
  }, [selectedPropertyId, isOpen]);

  // When selected room changes, update available beds
  const handleRoomChange = (roomId: string) => {
    setSelectedRoomId(roomId);
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      const freeBeds = room.beds.filter((b) => b.status === "available");
      setAvailableBeds(freeBeds);
      if (freeBeds.length > 0) {
        setSelectedBedId(freeBeds[0].id);
        const rent = Math.round(freeBeds[0].monthly_rent / 100);
        setMonthlyRentRupees(rent);
        setSecurityDepositRupees(rent * 2);
      } else {
        setSelectedBedId("");
      }
    } else {
      setAvailableBeds([]);
      setSelectedBedId("");
    }
  };

  // When bed changes, pre-fill its configured monthly rent
  const handleBedChange = (bedId: string) => {
    setSelectedBedId(bedId);
    const bed = availableBeds.find((b) => b.id === bedId);
    if (bed) {
      const rent = Math.round(bed.monthly_rent / 100);
      setMonthlyRentRupees(rent);
      setSecurityDepositRupees(rent * 2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedPropertyId) {
      setErrorMsg("Please select an authorized property.");
      return;
    }
    if (!selectedRoomId) {
      setErrorMsg("Please select an active room.");
      return;
    }
    if (!selectedBedId) {
      setErrorMsg("Please select an available bed.");
      return;
    }

    const payload = {
      p_business_id: businessId,
      p_property_id: selectedPropertyId,
      p_room_id: selectedRoomId,
      p_bed_id: selectedBedId,
      p_full_name: fullName.trim(),
      p_phone: phone.trim(),
      p_email: email.trim() || null,
      p_emergency_contact: emergencyContact.trim() || null,
      p_emergency_contact_name: emergencyContactName.trim() || null,
      p_date_of_birth: dateOfBirth || null,
      p_gender: (gender as TenantGender) || null,
      p_address: address.trim() || null,
      p_identity_type: identityType.trim() || null,
      p_identity_reference: identityReference.trim() || null,
      p_tenant_notes: tenantNotes.trim() || null,
      p_check_in_date: checkInDate,
      p_expected_check_out_date: expectedCheckOutDate || null,
      p_monthly_rent: Math.round(Number(monthlyRentRupees || 0) * 100),
      p_security_deposit: Math.round(Number(securityDepositRupees || 0) * 100),
      p_occupancy_notes: occupancyNotes.trim() || null,
    };

    // Client validation before RPC
    const val = validateRegisterTenantInput(payload);
    if (!val.valid) {
      const firstErr = Object.values(val.errors)[0];
      setErrorMsg(firstErr || "Please fill in all required fields accurately.");
      if (val.errors.p_full_name || val.errors.p_phone || val.errors.p_email) {
        setActiveTab("tenant");
      } else {
        setActiveTab("stay");
      }
      return;
    }

    setSubmitting(true);

    try {
      await tenantService.registerTenantWithOccupancy(payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register tenant.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Register & Check-In Tenant
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Atomic registration with property bed allocation
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Tabs */}
        <div className="px-6 pt-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("tenant")}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === "tenant"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            1. Tenant Information
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stay")}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === "stay"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            2. Room, Bed & Stay Details
          </button>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {activeTab === "tenant" ? (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Full Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Kumar"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <User className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Mobile Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="tel"
                      placeholder="98765 43210 or +91..."
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Normalized to E.164 (+91XXXXXXXXXX) automatically
                  </p>
                </div>
              </div>

              {/* Email & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Email Address <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="email"
                      placeholder="ramesh@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Gender <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as TenantGender)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              {/* Date of Birth & Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Date of Birth <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Permanent Address <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="City, State, Pin Code"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Emergency Contact & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Emergency Contact Name <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Suresh Kumar (Father)"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Emergency Phone <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 98888 77777"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Identity Proof & Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    KYC ID Document Type
                  </label>
                  <select
                    value={identityType}
                    onChange={(e) => setIdentityType(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    <option value="Aadhaar">Aadhaar Card</option>
                    <option value="Passport">Passport</option>
                    <option value="Driving License">Driving License</option>
                    <option value="Voter ID">Voter ID</option>
                    <option value="PAN">PAN Card</option>
                    <option value="College ID">Student / College ID</option>
                    <option value="Other">Other Official ID</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    ID Reference Number <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. XXXX-XXXX-1234"
                    value={identityReference}
                    onChange={(e) => setIdentityReference(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Tenant Notes */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Tenant Profile Notes <span className="text-zinc-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Special instructions, dietary habits, workplace details..."
                  value={tenantNotes}
                  onChange={(e) => setTenantNotes(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveTab("stay")}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
                >
                  Next: Room & Bed Allocation →
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Property Selection */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Assigned Property <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => setSelectedPropertyId(e.target.value)}
                    required
                    className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.roomsCount} rooms, {p.bedsAvailable} available beds)
                      </option>
                    ))}
                  </select>
                  <Building className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                </div>
              </div>

              {/* Room and Bed Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Room <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <select
                      value={selectedRoomId}
                      onChange={(e) => handleRoomChange(e.target.value)}
                      disabled={loadingRooms || rooms.length === 0}
                      required
                      className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer disabled:opacity-50"
                    >
                      {loadingRooms ? (
                        <option>Loading rooms...</option>
                      ) : rooms.length === 0 ? (
                        <option value="">No active rooms available</option>
                      ) : (
                        rooms.map((r) => {
                          const free = r.beds.filter((b) => b.status === "available").length;
                          return (
                            <option key={r.id} value={r.id} disabled={free === 0}>
                              Room {r.room_number} ({r.room_type} — {free} bed{free === 1 ? "" : "s"} free)
                            </option>
                          );
                        })
                      )}
                    </select>
                    <DoorOpen className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Available Bed <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <select
                      value={selectedBedId}
                      onChange={(e) => handleBedChange(e.target.value)}
                      disabled={loadingRooms || availableBeds.length === 0}
                      required
                      className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer disabled:opacity-50"
                    >
                      {availableBeds.length === 0 ? (
                        <option value="">No available beds in this room</option>
                      ) : (
                        availableBeds.map((b) => (
                          <option key={b.id} value={b.id}>
                            Bed {b.bed_number} (₹{Math.round(b.monthly_rent / 100).toLocaleString("en-IN")}/mo)
                          </option>
                        ))
                      )}
                    </select>
                    <BedDouble className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Check-In Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Expected Check-Out <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    min={checkInDate}
                    value={expectedCheckOutDate}
                    onChange={(e) => setExpectedCheckOutDate(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Financials: Rent & Deposit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Agreed Monthly Rent (₹) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      placeholder="8500"
                      value={monthlyRentRupees}
                      onChange={(e) => setMonthlyRentRupees(e.target.value)}
                      required
                      className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <IndianRupee className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1">Pre-filled from bed default rate</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Security Deposit (₹)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      placeholder="17000"
                      value={securityDepositRupees}
                      onChange={(e) => setSecurityDepositRupees(e.target.value)}
                      className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <IndianRupee className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1">Refundable deposit amount</p>
                </div>
              </div>

              {/* Stay Notes */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Stay / Allocation Notes <span className="text-zinc-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Key given, inventory handed over, contract terms..."
                  value={occupancyNotes}
                  onChange={(e) => setOccupancyNotes(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-2 flex justify-start">
                <button
                  type="button"
                  onClick={() => setActiveTab("tenant")}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
                >
                  ← Back to Tenant Details
                </button>
              </div>
            </div>
          )}

          {/* Form Actions Footer */}
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || availableBeds.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Registering Tenant...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Complete Registration & Check-In
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
