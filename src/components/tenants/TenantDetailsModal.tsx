"use client";

import React, { useState } from "react";
import {
  X,
  User,
  Phone,
  Mail,
  DoorOpen,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Edit2,
  LogOut,
  ArrowRightLeft,
  UserCheck,
  UserMinus,
  History,
} from "lucide-react";
import type { TenantWithFullDetails } from "@/types/app.types";
import type { TenantPermissions } from "@/lib/permissions/tenant.permissions";

interface TenantDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: TenantWithFullDetails | null;
  permissions: TenantPermissions;
  onEditProfile: (tenant: TenantWithFullDetails) => void;
  onCheckOut: (tenant: TenantWithFullDetails) => void;
  onTransferBed: (tenant: TenantWithFullDetails) => void;
}

export function TenantDetailsModal({
  isOpen,
  onClose,
  tenant,
  permissions,
  onEditProfile,
  onCheckOut,
  onTransferBed,
}: TenantDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<"profile" | "history">("profile");

  if (!isOpen || !tenant) return null;

  const currentStay = tenant.current_occupancy;
  const isActive = currentStay !== null;
  const pastStays = tenant.past_occupancies || [];

  const formatCurrency = (paise?: number | null) => {
    if (paise === undefined || paise === null) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(paise / 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
                {tenant.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">
                    {tenant.full_name}
                  </h2>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      <UserCheck className="w-3 h-3" />
                      Active Resident
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      <CheckCircle2 className="w-3 h-3" />
                      Checked Out
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-zinc-400" />
                    {tenant.phone}
                  </span>
                  {tenant.email && (
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 text-zinc-400" />
                      {tenant.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Row */}
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
            {/* Tabs */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setActiveTab("profile")}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer ${
                  activeTab === "profile"
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Profile & KYC
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                  activeTab === "history"
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Stay History ({tenant.total_stays})
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5">
              {permissions.canEditTenantProfile && (
                <button
                  onClick={() => {
                    onClose();
                    onEditProfile(tenant);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}

              {isActive && permissions.canTransferBed && (
                <button
                  onClick={() => {
                    onClose();
                    onTransferBed(tenant);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Transfer Bed
                </button>
              )}

              {isActive && permissions.canCheckOutTenant && (
                <button
                  onClick={() => {
                    onClose();
                    onCheckOut(tenant);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Check Out
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
          {activeTab === "profile" ? (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Current Active Stay Banner */}
              {isActive && currentStay ? (
                <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                      <DoorOpen className="w-4 h-4" />
                      Current Allocation
                    </span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(currentStay.monthly_rent)}/mo
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div>
                      <p className="text-[10px] text-zinc-400 font-medium">Property</p>
                      <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {currentStay.property_name || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 font-medium">Room & Floor</p>
                      <p className="font-bold text-zinc-900 dark:text-zinc-100">
                        Room {currentStay.room_number || "—"}{" "}
                        {currentStay.floor_name ? `(${currentStay.floor_name})` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 font-medium">Bed</p>
                      <p className="font-bold text-blue-600 dark:text-blue-400">
                        Bed {currentStay.bed_number || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 font-medium">Check-In</p>
                      <p className="font-bold text-zinc-900 dark:text-zinc-100">
                        {currentStay.check_in_date || "—"}
                      </p>
                    </div>
                  </div>

                  {currentStay.expected_check_out_date && (
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-2 border-t border-blue-200/50 dark:border-blue-900/30 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Expected Checkout: <strong>{currentStay.expected_check_out_date}</strong></span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 text-center text-zinc-500">
                  <UserMinus className="w-6 h-6 mx-auto mb-1 text-zinc-400" />
                  <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                    No active room allocation
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    This tenant has completed all prior stays or has not been assigned a bed.
                  </p>
                </div>
              )}

              {/* Personal & Emergency Info */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  Personal & Emergency Details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Gender</span>
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200 capitalize">
                      {tenant.gender ? tenant.gender.replace(/_/g, " ") : "Not specified"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Date of Birth</span>
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {tenant.date_of_birth || "Not specified"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Emergency Contact</span>
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {tenant.emergency_contact || "Not specified"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Relation / Name</span>
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {tenant.emergency_contact_name || "Not specified"}
                    </p>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Permanent Address</span>
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {tenant.address || "Not specified"}
                    </p>
                  </div>
                </div>
              </div>

              {/* KYC ID Proof & System Notes */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Identity Verification & Notes
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Document Type</span>
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {tenant.identity_type || "None on file"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-medium">Document ID Number</span>
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200 font-mono">
                      {tenant.identity_reference || "—"}
                    </p>
                  </div>

                  {tenant.notes && (
                    <div className="sm:col-span-2">
                      <span className="text-[10px] text-zinc-400 uppercase font-medium">Administrative Notes</span>
                      <p className="font-medium text-zinc-700 dark:text-zinc-300 mt-0.5 whitespace-pre-wrap">
                        {tenant.notes}
                      </p>
                    </div>
                  )}

                  <div className="sm:col-span-2 text-[10px] text-zinc-400 pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-between">
                    <span>Registered in BinRo: {new Date(tenant.created_at).toLocaleDateString("en-IN")}</span>
                    <span>Database ID: {tenant.id.slice(0, 8)}...</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-blue-600" />
                  All Recorded Stays ({pastStays.length + (currentStay ? 1 : 0)})
                </h3>
                <span className="text-[11px] text-zinc-400">
                  Chronological records & bed allocations
                </span>
              </div>

              {/* Active Stay (if present) */}
              {currentStay && (
                <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      <UserCheck className="w-3 h-3" />
                      Active Stay
                    </span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(currentStay.monthly_rent)}/mo
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-400">Property:</span>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 truncate">{currentStay.property_name}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400">Room / Bed:</span>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200">
                        Room {currentStay.room_number} • Bed {currentStay.bed_number}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400">Check-In:</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200">{currentStay.check_in_date}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400">Security Deposit:</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(currentStay.security_deposit)}</p>
                    </div>
                  </div>

                  {currentStay.notes && (
                    <div className="text-[11px] text-zinc-500 pt-1 border-t border-emerald-200/50 dark:border-emerald-900/30 whitespace-pre-wrap">
                      {currentStay.notes}
                    </div>
                  )}
                </div>
              )}

              {/* Past Stays List */}
              {pastStays.length === 0 && !currentStay ? (
                <div className="p-8 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 text-center text-zinc-400">
                  No historical stay records found for this tenant.
                </div>
              ) : pastStays.length === 0 ? (
                <div className="text-center text-xs text-zinc-400 py-4">
                  No prior stays. This is the tenant&apos;s first registered occupancy.
                </div>
              ) : (
                <div className="space-y-3">
                  {pastStays.map((occ, idx) => (
                    <div
                      key={occ.id}
                      className="p-3.5 rounded-2xl bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center text-[10px] font-bold">
                            #{pastStays.length - idx}
                          </span>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            {occ.property_name || "Assigned Property"} — Room {occ.room_number || "—"} (Bed {occ.bed_number || "—"})
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-700">
                          {occ.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div>
                          <span className="text-zinc-400">Check-In:</span>{" "}
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{occ.check_in_date}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Check-Out:</span>{" "}
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{occ.check_out_date || "—"}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Rent:</span>{" "}
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{formatCurrency(occ.monthly_rent)}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Deposit:</span>{" "}
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{formatCurrency(occ.security_deposit)}</span>
                        </div>
                      </div>

                      {occ.notes && (
                        <div className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-700/50 whitespace-pre-wrap">
                          {occ.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
