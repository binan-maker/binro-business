"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ArrowRightLeft,
  DoorOpen,
  BedDouble,
  Building,
  AlertCircle,
  Loader2,
  CheckCircle2,
  IndianRupee,
} from "lucide-react";
import type { TenantWithFullDetails, RoomWithDetails, BedWithOccupant } from "@/types/app.types";
import { tenantService } from "@/services/tenant.service";
import { roomService } from "@/services/room.service";

interface TransferBedModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: TenantWithFullDetails | null;
  onSuccess: () => void;
}

export function TransferBedModal({
  isOpen,
  onClose,
  tenant,
  onSuccess,
}: TransferBedModalProps) {
  const currentStay = tenant?.current_occupancy;
  const stayId = currentStay?.id;
  const propertyId = currentStay?.property_id;
  const currentRoomId = currentStay?.room_id;
  const currentBedId = currentStay?.bed_id;

  const [rooms, setRooms] = useState<RoomWithDetails[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [availableBeds, setAvailableBeds] = useState<BedWithOccupant[]>([]);
  const [selectedBedId, setSelectedBedId] = useState("");
  const [customRentRupees, setCustomRentRupees] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load rooms for the current stay's property once when modal opens or stay identity changes
  useEffect(() => {
    if (!isOpen || !propertyId || !currentRoomId || !currentBedId) {
      setRooms([]);
      setAvailableBeds([]);
      setSelectedRoomId("");
      setSelectedBedId("");
      return;
    }

    const pId = propertyId;
    const rId = currentRoomId;
    const bId = currentBedId;

    let isMounted = true;
    async function loadPropertyInventory(propId: string, roomId: string, bedId: string) {
      setLoadingRooms(true);
      setErrorMsg(null);
      setCustomRentRupees("");
      setNotes("");

      try {
        const roomsData = await roomService.getRoomsWithDetails(propId);
        if (!isMounted) return;

        // Active rooms only
        const activeRooms = roomsData.filter((r) => r.status === "active");
        setRooms(activeRooms);

        if (activeRooms.length > 0) {
          // Pre-select current room if it has available other beds, otherwise first room with free bed
          const currRoom = activeRooms.find((r) => r.id === roomId);
          const hasOtherFreeBed = currRoom?.beds.some(
            (b) => b.status === "available" && b.id !== bedId
          );

          let initialRoom = currRoom;
          if (!hasOtherFreeBed) {
            initialRoom = activeRooms.find((r) =>
              r.beds.some((b) => b.status === "available" && b.id !== bedId)
            ) || activeRooms[0];
          }

          if (initialRoom) {
            setSelectedRoomId(initialRoom.id);
            const freeBeds = initialRoom.beds.filter(
              (b) => b.status === "available" && b.id !== bedId
            );
            setAvailableBeds(freeBeds);
            if (freeBeds.length > 0) {
              setSelectedBedId(freeBeds[0].id);
            } else {
              setSelectedBedId("");
            }
          }
        }
      } catch (err) {
        console.error("Failed to load rooms for transfer:", err);
        setErrorMsg("Failed to load available rooms in this property.");
      } finally {
        if (isMounted) setLoadingRooms(false);
      }
    }

    loadPropertyInventory(pId, rId, bId);
    return () => {
      isMounted = false;
    };
  }, [isOpen, stayId, propertyId, currentRoomId, currentBedId]);

  const handleRoomChange = (roomId: string) => {
    setSelectedRoomId(roomId);
    const room = rooms.find((r) => r.id === roomId);
    if (room && currentBedId) {
      const freeBeds = room.beds.filter(
        (b) => b.status === "available" && b.id !== currentBedId
      );
      setAvailableBeds(freeBeds);
      if (freeBeds.length > 0) {
        setSelectedBedId(freeBeds[0].id);
      } else {
        setSelectedBedId("");
      }
    } else {
      setAvailableBeds([]);
      setSelectedBedId("");
    }
  };

  const selectedBedObj = availableBeds.find((b) => b.id === selectedBedId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStay || !selectedRoomId || !selectedBedId) {
      setErrorMsg("Please select a valid destination room and available bed.");
      return;
    }

    if (selectedBedId === currentStay.bed_id) {
      setErrorMsg("Destination bed must be different from the currently assigned bed.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload: {
        occupancy_id: string;
        current_bed_id: string;
        new_room_id: string;
        new_bed_id: string;
        new_monthly_rent?: number;
        notes?: string | null;
      } = {
        occupancy_id: currentStay.id,
        current_bed_id: currentStay.bed_id,
        new_room_id: selectedRoomId,
        new_bed_id: selectedBedId,
        notes: notes.trim() || null,
      };

      // Only pass new_monthly_rent if user explicitly provided a non-empty value
      if (customRentRupees.trim() !== "") {
        const parsed = Number(customRentRupees);
        if (isNaN(parsed) || parsed < 0) {
          setErrorMsg("Please enter a valid non-negative monthly rent.");
          setSubmitting(false);
          return;
        }
        payload.new_monthly_rent = Math.round(parsed * 100);
      }

      await tenantService.transferBed(payload);

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to transfer bed.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !tenant || !currentStay) return null;

  const currentRentRupees = Math.round(currentStay.monthly_rent / 100);
  const destBedDefaultRentRupees = selectedBedObj
    ? Math.round(selectedBedObj.monthly_rent / 100)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Transfer Bed
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Move tenant to another bed within {currentStay.property_name || "same property"}
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

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Current Allocation Snapshot */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-bold text-zinc-900 dark:text-zinc-100">
              <span>{tenant.full_name}</span>
              <span className="text-zinc-500 font-normal">Current Bed:</span>
            </div>
            <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-300">
              <span className="flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-zinc-400" />
                {currentStay.property_name || "Property"}
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400">
                Room {currentStay.room_number || "—"} • Bed {currentStay.bed_number || "—"}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-between">
              <span>Current Rent: ₹{currentRentRupees.toLocaleString("en-IN")}/mo</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Same-property transfer only
              </span>
            </div>
          </div>

          {/* Destination Room */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Destination Room <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <select
                value={selectedRoomId}
                onChange={(e) => handleRoomChange(e.target.value)}
                disabled={loadingRooms || rooms.length === 0}
                required
                className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
              >
                {loadingRooms ? (
                  <option>Loading property rooms...</option>
                ) : rooms.length === 0 ? (
                  <option value="">No active rooms found</option>
                ) : (
                  rooms.map((r) => {
                    const freeCount = r.beds.filter(
                      (b) => b.status === "available" && b.id !== currentStay.bed_id
                    ).length;
                    return (
                      <option key={r.id} value={r.id} disabled={freeCount === 0}>
                        Room {r.room_number} ({r.room_type} — {freeCount} free bed{freeCount === 1 ? "" : "s"})
                      </option>
                    );
                  })
                )}
              </select>
              <DoorOpen className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            </div>
          </div>

          {/* Destination Bed */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Destination Bed <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <select
                value={selectedBedId}
                onChange={(e) => setSelectedBedId(e.target.value)}
                disabled={loadingRooms || availableBeds.length === 0}
                required
                className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
              >
                {availableBeds.length === 0 ? (
                  <option value="">No available beds in this room</option>
                ) : (
                  availableBeds.map((b) => (
                    <option key={b.id} value={b.id}>
                      Bed {b.bed_number} (Configured Rate: ₹{Math.round(b.monthly_rent / 100).toLocaleString("en-IN")}/mo)
                    </option>
                  ))
                )}
              </select>
              <BedDouble className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            </div>
          </div>

          {/* Optional New Monthly Rent */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                New Monthly Rent (₹) <span className="text-zinc-400 font-normal">(Optional)</span>
              </label>
              {destBedDefaultRentRupees && (
                <button
                  type="button"
                  onClick={() => setCustomRentRupees(String(destBedDefaultRentRupees))}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Use bed standard: ₹{destBedDefaultRentRupees}
                </button>
              )}
            </div>

            <div className="relative flex items-center">
              <input
                type="number"
                min={0}
                step={100}
                placeholder={`Leave blank to preserve current: ₹${currentRentRupees}`}
                value={customRentRupees}
                onChange={(e) => setCustomRentRupees(e.target.value)}
                className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <IndianRupee className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              If left blank, current rent (₹{currentRentRupees}) is preserved automatically.
            </p>
          </div>

          {/* Transfer Notes */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Transfer Reason & Notes <span className="text-zinc-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Upgraded to single room upon tenant request..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Trigger & Bed Release Notice */}
          <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Atomic Trigger Execution</span>
            </div>
            <p>
              Old bed (<strong>{currentStay.bed_number}</strong>) will be set to Available, and destination bed (<strong>{selectedBedObj?.bed_number || "new"}</strong>) will be set to Occupied.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
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
              disabled={submitting || availableBeds.length === 0 || !selectedBedId}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Transferring Bed...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4" />
                  Confirm Bed Transfer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
