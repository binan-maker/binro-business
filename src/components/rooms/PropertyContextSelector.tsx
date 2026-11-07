"use client";

import React from "react";
import Link from "next/link";
import {
  Building,
  MapPin,
  ChevronDown,
  Plus,
  ArrowRight,
  ShieldAlert,
  CheckCircle,
  AlertCircle,
  Archive,
} from "lucide-react";
import type { PropertyWithStats } from "@/types/app.types";

interface PropertyContextSelectorProps {
  properties: PropertyWithStats[];
  selectedPropertyId: string;
  onSelectProperty: (propertyId: string) => void;
  isWarden: boolean;
}

export function PropertyContextSelector({
  properties,
  selectedPropertyId,
  onSelectProperty,
  isWarden,
}: PropertyContextSelectorProps) {
  const selectedProp = properties.find((p) => p.id === selectedPropertyId);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="w-2.5 h-2.5" />
            Active
          </span>
        );
      case "inactive":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-2.5 h-2.5" />
            Inactive
          </span>
        );
      case "archived":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
            <Archive className="w-2.5 h-2.5" />
            Archived
          </span>
        );
      default:
        return null;
    }
  };

  if (properties.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              No Properties Available
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isWarden
                ? "You do not have any property assigned to your warden account."
                : "Create your first PG / hostel property in Properties before managing rooms."}
            </p>
          </div>
        </div>

        {!isWarden && (
          <Link
            href="/properties"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add Property
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
      {/* Property Details & Selector */}
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs mt-0.5 sm:mt-0">
          <Building className="w-5 h-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Active Property Context
            </span>
            {getStatusBadge(selectedProp?.status)}
            {isWarden && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <ShieldAlert className="w-2.5 h-2.5" />
                Warden Access
              </span>
            )}
          </div>

          <div className="relative mt-1 inline-block max-w-full">
            <select
              value={selectedPropertyId}
              onChange={(e) => onSelectProperty(e.target.value)}
              className="font-bold text-base text-zinc-900 dark:text-zinc-100 bg-transparent pr-7 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded-lg cursor-pointer truncate max-w-full appearance-none"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id} className="text-zinc-900 bg-white dark:bg-zinc-900">
                  {p.name} ({p.roomsCount} rooms, {p.bedsTotal} beds)
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-1 top-1.5 pointer-events-none" />
          </div>

          {selectedProp?.address && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
              <span className="truncate">{selectedProp.address}</span>
            </p>
          )}
        </div>
      </div>

      {/* Property Fast Stats & Management Link */}
      <div className="flex items-center gap-4 self-end sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-100 dark:border-zinc-800">
        {selectedProp && (
          <div className="hidden md:flex items-center gap-4 text-right text-xs">
            <div>
              <p className="text-zinc-400 text-[11px]">Occupancy</p>
              <p className="font-bold text-zinc-900 dark:text-zinc-100">
                {selectedProp.occupancyRate}% ({selectedProp.bedsOccupied}/{selectedProp.bedsTotal})
              </p>
            </div>
            <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800" />
            <div>
              <p className="text-zinc-400 text-[11px]">Available Beds</p>
              <p className="font-bold text-emerald-600 dark:text-emerald-400">
                {selectedProp.bedsAvailable}
              </p>
            </div>
          </div>
        )}

        <Link
          href="/properties"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          <span>All Properties</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
