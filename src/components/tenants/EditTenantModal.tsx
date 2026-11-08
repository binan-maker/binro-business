"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Edit2,
  User,
  Phone,
  Mail,
  MapPin,
  AlertCircle,
  Loader2,
  Save,
  Lock,
} from "lucide-react";
import type { TenantWithFullDetails } from "@/types/app.types";
import { tenantService } from "@/services/tenant.service";
import { validateUpdateTenantProfileInput } from "@/lib/validations/tenant.validation";

interface EditTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: TenantWithFullDetails | null;
  onSuccess: () => void;
}

export function EditTenantModal({
  isOpen,
  onClose,
  tenant,
  onSuccess,
}: EditTenantModalProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [address, setAddress] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant || !isOpen) return;
    setFullName(tenant.full_name || "");
    setPhone(tenant.phone || "");
    setEmail(tenant.email || "");
    setEmergencyContact(tenant.emergency_contact || "");
    setEmergencyContactName(tenant.emergency_contact_name || "");
    setAddress(tenant.address || "");
    setErrorMsg(null);
  }, [tenant, isOpen]);

  if (!isOpen || !tenant) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const payload = {
      p_tenant_id: tenant.id,
      p_full_name: fullName.trim(),
      p_phone: phone.trim(),
      p_email: email.trim() || null,
      p_emergency_contact: emergencyContact.trim() || null,
      p_emergency_contact_name: emergencyContactName.trim() || null,
      p_address: address.trim() || null,
    };

    // Client-side validation before RPC dispatch
    const val = validateUpdateTenantProfileInput(payload);
    if (!val.valid) {
      const firstErr = Object.values(val.errors)[0];
      setErrorMsg(firstErr || "Please fill in all required fields accurately.");
      return;
    }

    setSaving(true);

    try {
      await tenantService.updateTenantProfile(payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update tenant profile.";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
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
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Edit Tenant Profile
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Update basic contact details and address
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

        {/* Error message */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <User className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            </div>
          </div>

          {/* Phone (Read-Only) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Mobile Phone
              </label>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                <Lock className="w-3 h-3 text-zinc-400" />
                Read-Only
              </span>
            </div>
            <div className="relative flex items-center">
              <input
                type="tel"
                value={phone}
                readOnly
                disabled
                aria-readonly="true"
                className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 cursor-not-allowed select-all focus:outline-none"
              />
              <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              Phone number cannot be changed here. Phone updates require separate re-verification.
            </p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Email Address <span className="text-zinc-400 font-normal">(Optional)</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            </div>
          </div>

          {/* Emergency Contact Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Emergency Contact Name
              </label>
              <input
                type="text"
                placeholder="e.g. Suresh Kumar (Father)"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Emergency Phone
              </label>
              <input
                type="tel"
                placeholder="e.g. +91 98888 77777"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Permanent Address */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Permanent Address <span className="text-zinc-400 font-normal">(Optional)</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="City, State, Pin Code"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full py-2 px-3 pl-9 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <MapPin className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            </div>
          </div>

          <div className="pt-2 text-[11px] text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl">
            KYC documents, status flags, and organization associations are administrative and protected from unauthorized modification.
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Profile
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
