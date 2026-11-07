"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  BedDouble,
  IndianRupee,
  Loader2,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import type { BedStatus } from "@/types/database.types";
import type { RoomWithDetails, BedWithOccupant, BedFormData } from "@/types/app.types";
import { validateBedInput } from "@/lib/validations/room.validation";

interface BedModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomWithDetails | null;
  bedToEdit?: BedWithOccupant | null;
  mode: "add" | "edit";
  onSubmit: (formData: BedFormData) => Promise<void>;
}

export function BedModal({
  isOpen,
  onClose,
  room,
  bedToEdit,
  mode,
  onSubmit,
}: BedModalProps) {
  const [bedNumber, setBedNumber] = useState("");
  const [monthlyRentRupees, setMonthlyRentRupees] = useState<number | string>(8500);
  const [status, setStatus] = useState<BedStatus>("available");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isOccupied = bedToEdit?.status === "occupied";

  useEffect(() => {
    if (isOpen) {
      if (mode === "edit" && bedToEdit) {
        setBedNumber(bedToEdit.bed_number);
        setMonthlyRentRupees(Math.round(bedToEdit.monthly_rent / 100));
        setStatus(bedToEdit.status);
      } else if (room) {
        // Suggest next letter e.g. 101-A, 101-B, etc.
        const existingCount = room.beds.length;
        const nextChar = String.fromCharCode(65 + existingCount);
        setBedNumber(`${room.room_number}-${nextChar}`);

        // Default rent from existing beds or 8500
        const defaultRent =
          room.beds.length > 0
            ? Math.round(room.beds[0].monthly_rent / 100)
            : 8500;
        setMonthlyRentRupees(defaultRent);
        setStatus("available");
      }
      setErrorMsg(null);
    }
  }, [isOpen, mode, bedToEdit, room]);

  if (!isOpen || !room) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const validation = validateBedInput({
      bed_number: bedNumber,
      monthly_rent_rupees: Number(monthlyRentRupees),
      status: isOccupied ? "occupied" : status,
    });

    if (!validation.valid) {
      setErrorMsg(Object.values(validation.errors)[0] || "Invalid bed details.");
      return;
    }

    setLoading(true);

    try {
      await onSubmit(validation.sanitized);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save bed.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <BedDouble className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {mode === "add" ? `Add Bed to Room ${room.room_number}` : `Edit Bed ${bedToEdit?.bed_number}`}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {room.floor?.name || "Ground Floor"} &bull; Room {room.room_number}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isOccupied && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 flex items-start gap-2 text-xs text-blue-800 dark:text-blue-300">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
            <div>
              <p className="font-semibold">Occupied Bed</p>
              <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                This bed is actively occupied by {bedToEdit?.current_occupant?.tenant_name || "a tenant"}.
                Status cannot be manually altered. Rent adjustments will apply to future charges.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Bed Label / Number *
            </label>
            <input
              type="text"
              placeholder="e.g. 101-A, Bed 1, Upper-1"
              value={bedNumber}
              onChange={(e) => setBedNumber(e.target.value)}
              disabled={loading}
              className="w-full py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Monthly Rent (₹) *
            </label>
            <div className="relative flex items-center">
              <input
                type="number"
                min={0}
                step={100}
                placeholder="e.g. 8500"
                value={monthlyRentRupees}
                onChange={(e) => setMonthlyRentRupees(e.target.value)}
                disabled={loading}
                className="w-full py-2 pl-7 pr-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
              <IndianRupee className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 pointer-events-none" />
            </div>
          </div>

          {!isOccupied && (
            <div>
              <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Initial Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("available")}
                  className={`py-1.5 px-2 rounded-lg text-center font-medium border cursor-pointer ${
                    status === "available"
                      ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  Available
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("maintenance")}
                  className={`py-1.5 px-2 rounded-lg text-center font-medium border cursor-pointer ${
                    status === "maintenance"
                      ? "bg-amber-50 dark:bg-amber-950/50 border-amber-500 text-amber-700 dark:text-amber-300"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  Maintenance
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("inactive")}
                  className={`py-1.5 px-2 rounded-lg text-center font-medium border cursor-pointer ${
                    status === "inactive"
                      ? "bg-zinc-200 dark:bg-zinc-700 border-zinc-500 text-zinc-800 dark:text-zinc-200"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  Inactive
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !bedNumber.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : mode === "add" ? (
                "Add Bed"
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
