"use client";

import React, { useState } from "react";
import {
  X,
  BedDouble,
  CheckCircle,
  Wrench,
  AlertCircle,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import type { BedStatus } from "@/types/database.types";
import type { BedWithOccupant, RoomWithDetails } from "@/types/app.types";

interface BedStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  bed: BedWithOccupant | null;
  room: RoomWithDetails | null;
  onConfirm: (bedId: string, status: BedStatus) => Promise<void>;
}

export function BedStatusModal({
  isOpen,
  onClose,
  bed,
  room,
  onConfirm,
}: BedStatusModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !bed || !room) return null;

  const isOccupied = bed.status === "occupied";

  const handleStatusChange = async (newStatus: BedStatus) => {
    if (isOccupied && newStatus !== "occupied") {
      setErrorMsg(
        "Cannot manually change status of an occupied bed. To make this bed available, check out the tenant in the Tenants module."
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await onConfirm(bed.id, newStatus);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update bed status.";
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
                Bed Status: {bed.bed_number}
              </h3>
              <p className="text-[11px] text-zinc-500">
                Room {room.room_number} &bull; Current:{" "}
                <span className="font-semibold capitalize text-zinc-700 dark:text-zinc-300">
                  {bed.status}
                </span>
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

        {isOccupied ? (
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 flex items-start gap-2.5 text-blue-800 dark:text-blue-300">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
              <div>
                <p className="font-semibold">Bed is Occupied</p>
                <p className="text-blue-700 dark:text-blue-400 mt-1">
                  Tenant <strong>{bed.current_occupant?.tenant_name || "Active Tenant"}</strong> is
                  currently checked in to this bed. The database occupancy trigger manages this
                  status authoritatively.
                </p>
                <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1.5">
                  To release this bed back to Available, perform a Check-Out in the Tenants module.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <p className="text-zinc-500">
              Select the new operating status for Bed <strong>{bed.bed_number}</strong>:
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleStatusChange("available")}
                disabled={loading || bed.status === "available"}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                  bed.status === "available"
                    ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                    : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <div>
                    <p className="font-bold">Available</p>
                    <p className="text-[10px] text-zinc-400">Ready for new tenant check-in</p>
                  </div>
                </div>
                {bed.status === "available" && <span className="text-[10px] font-bold">Current</span>}
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange("maintenance")}
                disabled={loading || bed.status === "maintenance"}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                  bed.status === "maintenance"
                    ? "bg-amber-50 dark:bg-amber-950/50 border-amber-500 text-amber-800 dark:text-amber-300 ring-2 ring-amber-500/20"
                    : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-600" />
                  <div>
                    <p className="font-bold">Under Maintenance</p>
                    <p className="text-[10px] text-zinc-400">Temporary repairs or cleaning</p>
                  </div>
                </div>
                {bed.status === "maintenance" && <span className="text-[10px] font-bold">Current</span>}
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange("inactive")}
                disabled={loading || bed.status === "inactive"}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                  bed.status === "inactive"
                    ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-500 text-zinc-800 dark:text-zinc-200 ring-2 ring-zinc-500/20"
                    : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-zinc-500" />
                  <div>
                    <p className="font-bold">Inactive</p>
                    <p className="text-[10px] text-zinc-400">Not in service</p>
                  </div>
                </div>
                {bed.status === "inactive" && <span className="text-[10px] font-bold">Current</span>}
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 py-2 text-zinc-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                Updating bed status in Supabase...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
