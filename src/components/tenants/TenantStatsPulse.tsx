"use client";

import React from "react";
import { Users, UserCheck, UserMinus, BedDouble } from "lucide-react";
import type { TenantWithFullDetails } from "@/types/app.types";

interface TenantStatsPulseProps {
  tenants: TenantWithFullDetails[];
  totalBeds?: number;
  occupiedBeds?: number;
}

export function TenantStatsPulse({
  tenants,
  totalBeds = 0,
  occupiedBeds = 0,
}: TenantStatsPulseProps) {
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((t) => t.current_occupancy !== null).length;
  const completedTenants = tenants.filter(
    (t) => t.current_occupancy === null && t.total_stays > 0
  ).length;

  const totalHistoricalStays = tenants.reduce(
    (sum, t) => sum + (t.total_stays || (t.past_occupancies?.length || 0) + (t.current_occupancy ? 1 : 0)),
    0
  );

  const occupancyPercent =
    totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* 1. Total Tenants */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Total Tenants
          </span>
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
            {totalTenants}
          </span>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
            Registered in active context
          </p>
        </div>
      </div>

      {/* 2. Active Stays */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Active Occupants
          </span>
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
              {activeTenants}
            </span>
            <span className="text-[11px] font-semibold text-zinc-400">
              currently staying
            </span>
          </div>
          <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${totalTenants > 0 ? (activeTenants / totalTenants) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. Completed Stays */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Checked Out / Past
          </span>
          <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <UserMinus className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
            {completedTenants}
          </span>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
            {totalHistoricalStays} historical stay records
          </p>
        </div>
      </div>

      {/* 4. Bed Occupancy Pulse */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Bed Occupancy
          </span>
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <BedDouble className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
              {occupancyPercent}%
            </span>
            {totalBeds > 0 && (
              <span className="text-[11px] text-zinc-500">
                {occupiedBeds}/{totalBeds} beds
              </span>
            )}
          </div>
          <div className="mt-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, occupancyPercent)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
