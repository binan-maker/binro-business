"use client";

import React, { useState, useEffect } from "react";
import { X, DoorOpen, Loader2, AlertCircle } from "lucide-react";
import type { RoomType, RoomStatus } from "@/types/database.types";
import type { Floor, RoomWithDetails, RoomFormData } from "@/types/app.types";
import { validateRoomInput } from "@/lib/validations/room.validation";

interface EditRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomWithDetails | null;
  floors: Floor[];
  onSubmit: (roomId: string, formData: Partial<RoomFormData>) => Promise<void>;
}

export function EditRoomModal({
  isOpen,
  onClose,
  room,
  floors,
  onSubmit,
}: EditRoomModalProps) {
  const [roomNumber, setRoomNumber] = useState("");
  const [floorId, setFloorId] = useState<string>("");
  const [roomType, setRoomType] = useState<RoomType>("shared");
  const [status, setStatus] = useState<RoomStatus>("active");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (room && isOpen) {
      setRoomNumber(room.room_number);
      setFloorId(room.floor_id || "");
      setRoomType(room.room_type);
      setStatus(room.status);
      setErrorMsg(null);
    }
  }, [room, isOpen]);

  if (!isOpen || !room) return null;

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
      await onSubmit(room.id, validation.sanitized);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update room.";
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
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Edit Room {room.room_number}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Update floor assignment, room type, or maintenance status.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
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
          <div>
            <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
              Room Number
            </label>
            <input
              type="text"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              disabled={loading}
              className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
              Floor
            </label>
            <select
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

          <div>
            <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
              Room Sharing Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRoomType("single")}
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
                onClick={() => setRoomType("shared")}
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
                onClick={() => setRoomType("dormitory")}
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

          <div>
            <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
              Room Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatus("active")}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition-colors cursor-pointer ${
                  status === "active"
                    ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatus("maintenance")}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition-colors cursor-pointer ${
                  status === "maintenance"
                    ? "bg-amber-50 dark:bg-amber-950/60 border-amber-600 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                Maintenance
              </button>
              <button
                type="button"
                onClick={() => setStatus("inactive")}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition-colors cursor-pointer ${
                  status === "inactive"
                    ? "bg-zinc-200 dark:bg-zinc-700 border-zinc-500 text-zinc-800 dark:text-zinc-200 ring-2 ring-zinc-500/20"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                Inactive
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
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
                  Saving...
                </>
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
