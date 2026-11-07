"use client";

import React from "react";
import {
  Building,
  Plus,
  LayoutGrid,
  List,
  ShieldAlert,
  TrendingUp,
  BedDouble,
  CheckCircle2,
} from "lucide-react";
import type { PropertyWithStats } from "@/types/app.types";

interface PropertyHeaderProps {
  properties: PropertyWithStats[];
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  onOpenCreateModal: () => void;
  canCreate: boolean;
  isWarden: boolean;
  businessName?: string;
}

export function PropertyHeader({
  properties,
  viewMode,
  onViewModeChange,
  onOpenCreateModal,
  canCreate,
  isWarden,
  businessName,
}: PropertyHeaderProps) {
  const totalProps = properties.length;
  const activeProps = properties.filter((p) => p.status === "active").length;
  const totalRooms = properties.reduce((acc, p) => acc + p.roomsCount, 0);
  const totalBeds = properties.reduce((acc, p) => acc + p.bedsTotal, 0);
  const occupiedBeds = properties.reduce((acc, p) => acc + p.bedsOccupied, 0);
  const availableBeds = properties.reduce((acc, p) => acc + p.bedsAvailable, 0);
  const overallOccupancy = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Title & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Properties
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {totalProps} {totalProps === 1 ? "Property" : "Properties"}
            </span>
            {isWarden && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <ShieldAlert className="w-3.5 h-3.5" />
                Warden Access
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {businessName && businessName !== "Your Business"
              ? `Manage hostels and PG branches for ${businessName}.`
              : "Manage your physical hostel/PG buildings, room matrices, and property warden assignments."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => onViewModeChange("grid")}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === "grid"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
              title="List view"
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Add property button */}
          {canCreate ? (
            <button
              onClick={onOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Property
            </button>
          ) : (
            <div
              title="Only business owners and admins can create new properties"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Add Property (Owner only)
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      {totalProps > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
              <span>Active Hostels</span>
              <Building className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {activeProps}
              </span>
              <span className="text-[11px] text-zinc-400">/ {totalProps} total</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
              <span>Total Rooms</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {totalRooms}
              </span>
              <span className="text-[11px] text-zinc-400">configured</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
              <span>Occupancy</span>
              <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {overallOccupancy}%
              </span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {occupiedBeds}/{totalBeds} beds
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
              <span>Available Beds</span>
              <BedDouble className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {availableBeds}
              </span>
              <span className="text-[11px] text-zinc-400">ready to occupy</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
