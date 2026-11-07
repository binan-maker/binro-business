"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  DoorOpen,
  BedDouble,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { RoomType, RoomStatus } from "@/types/database.types";
import type { Floor, RoomFormData } from "@/types/app.types";
import { validateRoomInput } from "@/lib/validations/room.validation";

interface AddRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  floors: Floor[];
  defaultFloorId?: string | null;
  onSubmit: (
    formData: RoomFormData,
    initialBeds?: { count: number; rentRupees: number }
  ) => Promise<void>;
}

export function AddRoomModal({
  isOpen,
  onClose,
  floors,
  defaultFloorId,
  onSubmit,
}: AddRoomModalProps) {
  const [roomNumber, setRoomNumber] = useState("");
  const [floorId, setFloorId] = useState<string>("");
  const [roomType, setRoomType] = useState<RoomType>("shared");
  const [status, setStatus] = useState<RoomStatus>("active");

  // Initial Bed Setup
  const [includeBeds, setIncludeBeds] = useState(true);
  const [bedCount, setBedCount] = useState(2);
  const [monthlyRentRupees, setMonthlyRentRupees] = useState(8500);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRoomNumber("");
      setFloorId(defaultFloorId && defaultFloorId !== "all" && defaultFloorId !== "unassigned" ? defaultFloorId : (floors[0]?.id || ""));
      setRoomType("shared");
      setStatus("active");
      setIncludeBeds(true);
      setBedCount(2);
      setMonthlyRentRupees(8500);
      setErrorMsg(null);
    }
  }, [isOpen, defaultFloorId, floors]);

  // Adjust bed count recommendation when room type changes
  const handleRoomTypeChange = (type: RoomType) => {
    setRoomType(type);
    if (type === "single") {
      setBedCount(1);
    } else if (type === "shared") {
      setBedCount(2);
    } else if (type === "dormitory") {
      setBedCount(6);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const validation = validateRoomInput({
      room_number: roomNumber,
      room_type: roomType,
      floor_id: floorId || null,
      status,
    });

    if (!validation.valid) {
      setErrorMsg(Object.values(validation.errors)[0] || "Invalid room details.");
      return;
    }

    setLoading(true);

    try {
      await onSubmit(
        validation.sanitized,
        includeBeds
          ? {
              count: Number(bedCount),
              rentRupees: Number(monthlyRentRupees),
            }
          : undefined
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create room.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Add Room & Beds
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Configure room number, floor assignment, and initial bed capacity.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Room Number */}
          <div>
            <label
              htmlFor="room-number"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
            >
              Room Number / Identifier <span className="text-red-500">*</span>
            </label>
            <input
              id="room-number"
              type="text"
              placeholder="e.g. 101, 204B, Ground-01"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              disabled={loading}
              className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              required
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              Must be unique within this property.
            </p>
          </div>

          {/* Floor Selection */}
          <div>
            <label
              htmlFor="floor-select"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
            >
              Assign to Floor
            </label>
            <select
              id="floor-select"
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              disabled={loading}
              className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Ground / General (No Floor)</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} {f.floor_number !== null ? `(Floor ${f.floor_number})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Room Type */}
          <div>
            <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
              Room Sharing Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleRoomTypeChange("single")}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition-colors cursor-pointer ${
                  roomType === "single"
                    ? "bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => handleRoomTypeChange("shared")}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition-colors cursor-pointer ${
                  roomType === "shared"
                    ? "bg-purple-50 dark:bg-purple-950/60 border-purple-600 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                Shared
              </button>
              <button
                type="button"
                onClick={() => handleRoomTypeChange("dormitory")}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition-colors cursor-pointer ${
                  roomType === "dormitory"
                    ? "bg-amber-50 dark:bg-amber-950/60 border-amber-600 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                Dormitory
              </button>
            </div>
          </div>

          {/* Initial Beds Configuration */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <BedDouble className="w-4 h-4 text-blue-600" />
                Initialize Bed Inventory
              </span>
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBeds}
                  onChange={(e) => setIncludeBeds(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                Auto-generate
              </label>
            </div>

            {includeBeds && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Number of Beds
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={bedCount}
                    onChange={(e) => setBedCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full py-1.5 px-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <p className="text-[10px] text-zinc-400 mt-0.5">e.g. 101-A, 101-B...</p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Monthly Rent / Bed (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={monthlyRentRupees}
                    onChange={(e) => setMonthlyRentRupees(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full py-1.5 px-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <p className="text-[10px] text-zinc-400 mt-0.5">In Indian Rupees</p>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !roomNumber.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Creating Room...
                </>
              ) : (
                "Create Room & Beds"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
