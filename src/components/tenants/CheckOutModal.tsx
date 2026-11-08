"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  LogOut,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { TenantWithFullDetails } from "@/types/app.types";
import { tenantService } from "@/services/tenant.service";

interface CheckOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: TenantWithFullDetails | null;
  onSuccess: () => void;
}

export function CheckOutModal({
  isOpen,
  onClose,
  tenant,
  onSuccess,
}: CheckOutModalProps) {
  const currentStay = tenant?.current_occupancy;

  const [checkOutDate, setCheckOutDate] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCheckOutDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setErrorMsg(null);
  }, [isOpen]);

  if (!isOpen || !tenant || !currentStay) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentStay.id) {
      setErrorMsg("No active stay found for this tenant.");
      return;
    }

    if (currentStay.check_in_date && checkOutDate < currentStay.check_in_date) {
      setErrorMsg(
        `Check-out date (${checkOutDate}) cannot be before the check-in date (${currentStay.check_in_date}).`
      );
      return;
    }

    setSubmitting(true);

    try {
      await tenantService.checkOut(currentStay.id, {
        check_out_date: checkOutDate,
        notes: notes.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to check out tenant.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

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
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-xs">
              <LogOut className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Check Out Tenant
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Complete stay and release bed to available status
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
          {/* Active Stay Card */}
          <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {tenant.full_name}
              </span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                Active Stay
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-zinc-400 font-medium">Property</span>
                <p className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                  {currentStay.property_name || "—"}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 font-medium">Allocated Bed</span>
                <p className="font-bold text-purple-700 dark:text-purple-400">
                  Room {currentStay.room_number || "—"} • Bed {currentStay.bed_number || "—"}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 font-medium">Check-In Date</span>
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {currentStay.check_in_date}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 font-medium">Monthly Rent</span>
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                  ₹{Math.round(currentStay.monthly_rent / 100).toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>

          {/* Checkout Date */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Check-Out Date <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="date"
                min={currentStay.check_in_date}
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                required
                className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Cannot precede check-in date ({currentStay.check_in_date})
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Checkout & Settlement Notes <span className="text-zinc-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Keys returned, room condition inspected, deposit refunded..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
          </div>

          {/* Bed Release Notice */}
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 flex items-start gap-2.5 text-[11px] text-zinc-600 dark:text-zinc-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Bed <strong>{currentStay.bed_number}</strong> will be automatically marked as{" "}
              <strong className="text-emerald-600 dark:text-emerald-400">Available</strong> in the database upon checkout. Historical stay records are preserved.
            </span>
          </div>

          {/* Actions */}
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
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Checkout...
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  Confirm Check Out
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
