"use client";

import React from "react";
import {
  Users,
  Phone,
  Mail,
  Building,
  DoorOpen,
  Calendar,
  Eye,
  Edit2,
  LogOut,
  ArrowRightLeft,
  UserCheck,
  UserMinus,
  CheckCircle2,
  Plus,
} from "lucide-react";
import type { TenantWithFullDetails } from "@/types/app.types";
import type { TenantPermissions } from "@/lib/permissions/tenant.permissions";

interface TenantTableProps {
  tenants: TenantWithFullDetails[];
  permissions: TenantPermissions;
  onViewDetails: (tenant: TenantWithFullDetails) => void;
  onEditProfile: (tenant: TenantWithFullDetails) => void;
  onCheckOut: (tenant: TenantWithFullDetails) => void;
  onTransferBed: (tenant: TenantWithFullDetails) => void;
  onRegisterClick: () => void;
  hasFilters: boolean;
  onResetFilters: () => void;
}

export function TenantTable({
  tenants,
  permissions,
  onViewDetails,
  onEditProfile,
  onCheckOut,
  onTransferBed,
  onRegisterClick,
  hasFilters,
  onResetFilters,
}: TenantTableProps) {
  if (tenants.length === 0) {
    return (
      <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-4 shadow-xs">
          <Users className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          {hasFilters ? "No matching tenants found" : "No tenants registered yet"}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 max-w-sm mx-auto">
          {hasFilters
            ? "Try adjusting your search query, status filters, or property context."
            : "Register your first tenant and assign them to an available room and bed."}
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          {hasFilters ? (
            <button
              onClick={onResetFilters}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          ) : (
            permissions.canRegisterTenant && (
              <button
                onClick={onRegisterClick}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Register First Tenant
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Tenant</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4">Current Stay</th>
                <th className="py-3.5 px-4">Check-In Date</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {tenants.map((t) => {
                const stay = t.current_occupancy;
                const isActive = stay !== null;

                return (
                  <tr
                    key={t.id}
                    className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    {/* Tenant Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-blue-600 dark:text-blue-400 shrink-0">
                          {t.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <button
                            onClick={() => onViewDetails(t)}
                            className="font-bold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left truncate block cursor-pointer"
                          >
                            {t.full_name}
                          </button>
                          <div className="text-[11px] text-zinc-400">
                            {t.total_stays > 1 ? `${t.total_stays} total stays` : "1 stay"}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-medium">
                          <Phone className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span>{t.phone}</span>
                        </div>
                        {t.email && (
                          <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] truncate max-w-[160px]">
                            <Mail className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span className="truncate">{t.email}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Current Stay */}
                    <td className="py-3.5 px-4">
                      {isActive && stay ? (
                        <div className="space-y-0.5">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                            <DoorOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>Room {stay.room_number || "—"}</span>
                            <span className="text-zinc-300 dark:text-zinc-600 mx-0.5">•</span>
                            <span className="text-blue-600 dark:text-blue-400 font-bold">
                              Bed {stay.bed_number || "—"}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                            <Building className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span className="truncate">{stay.property_name || "Assigned Property"}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-zinc-400 italic flex items-center gap-1">
                          <UserMinus className="w-3.5 h-3.5 text-zinc-400" />
                          <span>No active stay</span>
                        </div>
                      )}
                    </td>

                    {/* Check-In Date */}
                    <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                      {isActive && stay?.check_in_date ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span>{stay.check_in_date}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <UserCheck className="w-2.5 h-2.5" />
                          Active Stay
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Checked Out
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* View Details */}
                        <button
                          onClick={() => onViewDetails(t)}
                          title="View complete profile & history"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Edit Profile */}
                        {permissions.canEditTenantProfile && (
                          <button
                            onClick={() => onEditProfile(t)}
                            title="Edit basic tenant details"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Transfer Bed (active stays only) */}
                        {isActive && permissions.canTransferBed && (
                          <button
                            onClick={() => onTransferBed(t)}
                            title="Transfer to another bed in same property"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors cursor-pointer"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                        )}

                        {/* Check Out (active stays only) */}
                        {isActive && permissions.canCheckOutTenant && (
                          <button
                            onClick={() => onCheckOut(t)}
                            title="Check out tenant"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors cursor-pointer"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card Presentation */}
      <div className="md:hidden space-y-3">
        {tenants.map((t) => {
          const stay = t.current_occupancy;
          const isActive = stay !== null;

          return (
            <div
              key={t.id}
              className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-blue-600 dark:text-blue-400 shrink-0">
                    {t.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                      {t.full_name}
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.phone}</p>
                  </div>
                </div>

                {isActive ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    Checked Out
                  </span>
                )}
              </div>

              {isActive && stay ? (
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-medium">Room & Bed:</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      Room {stay.room_number} • Bed {stay.bed_number}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-medium">Property:</span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium truncate max-w-[180px]">
                      {stay.property_name || "—"}
                    </span>
                  </div>
                  {stay.check_in_date && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 font-medium">Check-In:</span>
                      <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                        {stay.check_in_date}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/30 text-xs text-zinc-500 dark:text-zinc-400 italic text-center">
                  Past resident ({t.total_stays} total stays)
                </div>
              )}

              {/* Action Buttons for Mobile */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 gap-1.5 flex-wrap">
                <button
                  onClick={() => onViewDetails(t)}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Details
                </button>

                {permissions.canEditTenantProfile && (
                  <button
                    onClick={() => onEditProfile(t)}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}

                {isActive && permissions.canTransferBed && (
                  <button
                    onClick={() => onTransferBed(t)}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Transfer
                  </button>
                )}

                {isActive && permissions.canCheckOutTenant && (
                  <button
                    onClick={() => onCheckOut(t)}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 text-xs font-semibold hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Check Out
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
