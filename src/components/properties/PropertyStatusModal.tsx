"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Archive,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import type { PropertyWithStats } from "@/types/app.types";

interface PropertyStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: PropertyWithStats | null;
  targetAction: "activate" | "deactivate" | "archive" | "delete" | null;
  onConfirm: () => Promise<void>;
}

export function PropertyStatusModal({
  isOpen,
  onClose,
  property,
  targetAction,
  onConfirm,
}: PropertyStatusModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !property || !targetAction) return null;

  const handleAction = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed. Please try again.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const getModalConfig = () => {
    switch (targetAction) {
      case "activate":
        return {
          title: "Activate Property",
          icon: <ToggleRight className="w-5 h-5 text-emerald-600" />,
          buttonLabel: "Activate Property",
          buttonClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
          description: `Are you sure you want to activate "${property.name}"? The property and its beds will be immediately visible for tenant check-ins and room allocations.`,
          warning: null,
        };
      case "deactivate":
        return {
          title: "Deactivate Property",
          icon: <ToggleLeft className="w-5 h-5 text-amber-600" />,
          buttonLabel: "Deactivate Property",
          buttonClass: "bg-amber-600 hover:bg-amber-700 text-white",
          description: `Are you sure you want to deactivate "${property.name}"? New check-ins and room assignments will be temporarily suspended.`,
          warning:
            property.bedsOccupied > 0
              ? `Note: There are currently ${property.bedsOccupied} occupied bed(s). Current occupants' rent and dues remain unaffected.`
              : null,
        };
      case "archive":
        return {
          title: "Archive Property",
          icon: <Archive className="w-5 h-5 text-zinc-600" />,
          buttonLabel: "Archive Property",
          buttonClass: "bg-zinc-700 hover:bg-zinc-800 text-white",
          description: `Are you sure you want to archive "${property.name}"? Archiving hides the property from your active operational list while safely preserving all historical rent records, tenant profiles, and payment receipts.`,
          warning:
            property.bedsOccupied > 0
              ? `Warning: This property currently has ${property.bedsOccupied} occupied bed(s). It is recommended to check out all tenants before archiving.`
              : null,
        };
      case "delete":
        return {
          title: "Delete Property",
          icon: <Trash2 className="w-5 h-5 text-red-600" />,
          buttonLabel: "Delete Permanently",
          buttonClass: "bg-red-600 hover:bg-red-700 text-white",
          description: `Are you sure you want to permanently delete "${property.name}"?`,
          warning:
            property.bedsOccupied > 0
              ? `CRITICAL: There are ${property.bedsOccupied} active tenant occupancies in this property. Deleting may fail if dependent foreign key records exist in Supabase.`
              : "This action cannot be undone. All rooms, floors, and bed configurations for this property will be deleted.",
        };
    }
  };

  const config = getModalConfig();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              {config.icon}
            </div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              {config.title}
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
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-400">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
          <p>{config.description}</p>

          {config.warning && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>{config.warning}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAction}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-colors ${config.buttonClass} disabled:opacity-50`}
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing...
              </>
            ) : (
              config.buttonLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
