"use client";

import React, { useState, useEffect } from "react";
import { X, Layers, Loader2, AlertCircle } from "lucide-react";
import type { FloorFormData } from "@/types/app.types";
import { validateFloorInput } from "@/lib/validations/room.validation";

interface AddFloorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: FloorFormData) => Promise<void>;
  suggestedFloorNumber?: number;
}

export function AddFloorModal({
  isOpen,
  onClose,
  onSubmit,
  suggestedFloorNumber = 1,
}: AddFloorModalProps) {
  const [name, setName] = useState("");
  const [floorNumber, setFloorNumber] = useState<number | string>(suggestedFloorNumber);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(suggestedFloorNumber === 0 ? "Ground Floor" : `Floor ${suggestedFloorNumber}`);
      setFloorNumber(suggestedFloorNumber);
      setErrorMsg(null);
    }
  }, [isOpen, suggestedFloorNumber]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const validation = validateFloorInput({
      name,
      floor_number: floorNumber !== "" ? Number(floorNumber) : null,
    });

    if (!validation.valid) {
      setErrorMsg(Object.values(validation.errors)[0] || "Invalid floor details.");
      return;
    }

    setLoading(true);

    try {
      await onSubmit(validation.sanitized);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create floor.";
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
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              Add New Floor
            </h3>
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

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Floor Display Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Ground Floor, 1st Floor, Mezzanine"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="w-full py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Floor Number (Integer Order)
            </label>
            <input
              type="number"
              step={1}
              placeholder="e.g. 0, 1, 2 (-1 for basement)"
              value={floorNumber}
              onChange={(e) => setFloorNumber(e.target.value)}
              disabled={loading}
              className="w-full py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-[10px] text-zinc-400 mt-1">
              Used to order floors in tabs and room grouping.
            </p>
          </div>

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
              disabled={loading || !name.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Create Floor"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
