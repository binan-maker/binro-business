"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Building,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { PropertyWithStats, PropertyFormData } from "@/types/app.types";
import type { PropertyStatus } from "@/types/database.types";
import { validatePropertyInput } from "@/lib/validations/property.validation";

interface PropertyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: PropertyFormData) => Promise<void>;
  initialData?: PropertyWithStats | null;
  mode: "create" | "edit";
}

export function PropertyFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  mode,
}: PropertyFormModalProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<PropertyStatus>("active");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; address?: string; status?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData && mode === "edit") {
      setName(initialData.name || "");
      setAddress(initialData.address || "");
      setStatus(initialData.status || "active");
    } else {
      setName("");
      setAddress("");
      setStatus("active");
    }
    setErrors({});
    setServerError(null);
  }, [initialData, mode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const validation = validatePropertyInput({
      name,
      address,
      status,
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      await onSubmit(validation.sanitized);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save property.";
      setServerError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {mode === "create" ? "Add New Property" : "Edit Property Details"}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {mode === "create"
                  ? "Configure a new PG or hostel branch under your business"
                  : `Update specifications for ${initialData?.name || "this property"}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server / RLS error alert */}
        {serverError && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Unable to save property</p>
              <p>{serverError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Property Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="prop-name"
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Property / Branch Name <span className="text-red-500">*</span>
              </label>
              <span className="text-[10px] text-zinc-400">{name.length}/100</span>
            </div>
            <div className="relative flex items-center">
              <input
                id="prop-name"
                type="text"
                placeholder="e.g. Sai Balaji Luxury PG (Block A)"
                value={name}
                maxLength={100}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors({ ...errors, name: undefined });
                }}
                disabled={loading}
                className={`w-full py-2.5 px-3 text-xs rounded-xl border bg-white dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all ${
                  errors.name
                    ? "border-red-300 dark:border-red-800 focus:ring-red-500"
                    : "border-zinc-300 dark:border-zinc-700 focus:ring-blue-600 focus:border-transparent"
                }`}
                required
              />
            </div>
            {errors.name ? (
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {errors.name}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                A descriptive branch name shown on receipts, reports, and tenant agreements.
              </p>
            )}
          </div>

          {/* Property Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="prop-address"
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200"
              >
                Physical Address <span className="text-zinc-400 font-normal">(Optional)</span>
              </label>
              <span className="text-[10px] text-zinc-400">{address.length}/500</span>
            </div>
            <textarea
              id="prop-address"
              placeholder="e.g. Plot No. 42, Gachibowli Main Road, Near DLF Cyber City, Hyderabad, 500032"
              value={address}
              maxLength={500}
              onChange={(e) => {
                setAddress(e.target.value);
                if (errors.address) setErrors({ ...errors, address: undefined });
              }}
              disabled={loading}
              rows={3}
              className={`w-full py-2.5 px-3 text-xs rounded-xl border bg-white dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all ${
                errors.address
                  ? "border-red-300 dark:border-red-800 focus:ring-red-500"
                  : "border-zinc-300 dark:border-zinc-700 focus:ring-blue-600 focus:border-transparent"
              }`}
            />
            {errors.address && (
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                {errors.address}
              </p>
            )}
          </div>

          {/* Status (Edit mode only) */}
          {mode === "edit" && (
            <div>
              <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                Property Operating Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("active")}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    status === "active"
                      ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Active
                </button>

                <button
                  type="button"
                  onClick={() => setStatus("inactive")}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    status === "inactive"
                      ? "bg-amber-50 dark:bg-amber-950/50 border-amber-500 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Inactive
                </button>

                <button
                  type="button"
                  onClick={() => setStatus("archived")}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    status === "archived"
                      ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-500 text-zinc-800 dark:text-zinc-200 ring-2 ring-zinc-500/20"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-zinc-400" />
                  Archived
                </button>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Inactive properties temporarily stop accepting new check-ins.
              </p>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
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
              disabled={loading || !name.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving to Supabase...
                </>
              ) : mode === "create" ? (
                "Create Property"
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
