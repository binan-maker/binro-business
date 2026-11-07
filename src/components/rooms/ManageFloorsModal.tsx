"use client";

import React, { useState } from "react";
import {
  X,
  Layers,
  Edit2,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  Plus,
} from "lucide-react";
import type { FloorWithStats } from "@/types/app.types";

interface ManageFloorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  floors: FloorWithStats[];
  onUpdateFloor: (floorId: string, name: string, floorNumber?: number | null) => Promise<void>;
  onDeleteFloor: (floorId: string) => Promise<void>;
  onOpenAddFloor: () => void;
}

export function ManageFloorsModal({
  isOpen,
  onClose,
  floors,
  onUpdateFloor,
  onDeleteFloor,
  onOpenAddFloor,
}: ManageFloorsModalProps) {
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState<number | string>("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartEdit = (floor: FloorWithStats) => {
    setEditingFloorId(floor.id);
    setEditName(floor.name);
    setEditNumber(floor.floor_number ?? "");
    setErrorMsg(null);
  };

  const handleSaveEdit = async (floorId: string) => {
    if (!editName.trim()) {
      setErrorMsg("Floor name cannot be empty.");
      return;
    }

    setLoadingId(floorId);
    setErrorMsg(null);

    try {
      await onUpdateFloor(
        floorId,
        editName.trim(),
        editNumber !== "" ? Number(editNumber) : null
      );
      setEditingFloorId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update floor.";
      setErrorMsg(msg);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (floor: FloorWithStats) => {
    if (floor.roomsCount > 0) {
      setErrorMsg(
        `Cannot delete "${floor.name}": ${floor.roomsCount} room(s) are currently on this floor. Move or delete those rooms first.`
      );
      return;
    }

    if (!confirm(`Are you sure you want to delete "${floor.name}"?`)) {
      return;
    }

    setLoadingId(floor.id);
    setErrorMsg(null);

    try {
      await onDeleteFloor(floor.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete floor.";
      setErrorMsg(msg);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                Manage Property Floors
              </h3>
              <p className="text-[11px] text-zinc-500">
                Configure floor labels and ordering.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
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

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {floors.length === 0 ? (
            <div className="py-8 text-center text-zinc-400 text-xs">
              No floors created yet.
            </div>
          ) : (
            floors.map((floor) => {
              const isEditing = editingFloorId === floor.id;
              const isLoading = loadingId === floor.id;

              return (
                <div
                  key={floor.id}
                  className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850 flex items-center justify-between gap-3 text-xs"
                >
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Floor name"
                        className="flex-1 py-1 px-2 rounded-lg border border-blue-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs"
                      />
                      <input
                        type="number"
                        value={editNumber}
                        onChange={(e) => setEditNumber(e.target.value)}
                        placeholder="Num"
                        className="w-16 py-1 px-2 rounded-lg border border-blue-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs"
                      />
                      <button
                        onClick={() => handleSaveEdit(floor.id)}
                        disabled={isLoading}
                        className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                        title="Save"
                      >
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setEditingFloorId(null)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {floor.name}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {floor.floor_number !== null ? `Floor #${floor.floor_number} • ` : ""}
                          <strong className="text-zinc-700 dark:text-zinc-300">
                            {floor.roomsCount} room(s)
                          </strong>
                          {floor.bedsTotal > 0 && ` • ${floor.bedsOccupied}/${floor.bedsTotal} beds`}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleStartEdit(floor)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                          title="Edit floor"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDelete(floor)}
                          disabled={isLoading}
                          className={`p-1.5 rounded-lg transition-colors ${
                            floor.roomsCount > 0
                              ? "text-zinc-300 dark:text-zinc-700 cursor-not-allowed"
                              : "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                          }`}
                          title={
                            floor.roomsCount > 0
                              ? `Cannot delete floor with ${floor.roomsCount} rooms`
                              : "Delete floor"
                          }
                        >
                          {isLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              onOpenAddFloor();
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Another Floor
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
