"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building,
  MapPin,
  CheckCircle,
  AlertCircle,
  Archive,
  BedDouble,
  Layers,
  DoorOpen,
  MoreVertical,
  Edit2,
  Eye,
  ArrowRight,
  Shield,
  ToggleLeft,
  ToggleRight,
  Check,
} from "lucide-react";
import type { PropertyWithStats } from "@/types/app.types";
import type { PropertyStatus } from "@/types/database.types";

interface PropertyCardProps {
  property: PropertyWithStats;
  isActiveContext: boolean;
  onSelectContext: (propertyId: string) => void;
  onViewDetails: (property: PropertyWithStats) => void;
  onEdit: (property: PropertyWithStats) => void;
  onToggleStatus: (property: PropertyWithStats, newStatus: PropertyStatus) => void;
  onArchive: (property: PropertyWithStats) => void;
  onDelete: (property: PropertyWithStats) => void;
  canEdit: boolean;
  canChangeStatus: boolean;
  canDelete: boolean;
}

export function PropertyCard({
  property,
  isActiveContext,
  onSelectContext,
  onViewDetails,
  onEdit,
  onToggleStatus,
  onArchive,
  onDelete,
  canEdit,
  canChangeStatus,
  canDelete,
}: PropertyCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const getStatusBadge = (status: PropertyStatus) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="w-3 h-3" />
            Active
          </span>
        );
      case "inactive":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-3 h-3" />
            Inactive
          </span>
        );
      case "archived":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
            <Archive className="w-3 h-3" />
            Archived
          </span>
        );
    }
  };

  const getOccupancyColor = (rate: number) => {
    if (rate >= 80) return "bg-emerald-500 text-emerald-600 dark:text-emerald-400";
    if (rate >= 40) return "bg-blue-600 text-blue-600 dark:text-blue-400";
    return "bg-amber-500 text-amber-600 dark:text-amber-400";
  };

  const occupancyBarClass =
    property.occupancyRate >= 80
      ? "bg-emerald-500"
      : property.occupancyRate >= 40
      ? "bg-blue-600"
      : "bg-amber-500";

  return (
    <div
      className={`relative rounded-2xl bg-white dark:bg-zinc-900 border transition-all duration-200 shadow-xs flex flex-col justify-between ${
        isActiveContext
          ? "border-blue-500/80 ring-2 ring-blue-500/20"
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      {/* Top Header Card */}
      <div className="p-5 pb-4 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
              <Building className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base leading-snug truncate">
                  {property.name}
                </h3>
                {isActiveContext && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-600 text-white shadow-2xs">
                    <Check className="w-3 h-3" />
                    Selected Context
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1 line-clamp-1">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                <span className="truncate">{property.address || "Address not specified"}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {getStatusBadge(property.status)}

            {/* Actions Menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-label="Property actions menu"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-1 w-48 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg py-1 z-30 text-xs">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onViewDetails(property);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-zinc-400" />
                      View Details & Rooms
                    </button>

                    {canEdit && (
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onEdit(property);
                        }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                        Edit Property Info
                      </button>
                    )}

                    {canChangeStatus && (
                      <>
                        {property.status === "active" ? (
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              onToggleStatus(property, "inactive");
                            }}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                          >
                            <ToggleLeft className="w-3.5 h-3.5" />
                            Deactivate Property
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              onToggleStatus(property, "active");
                            }}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                          >
                            <ToggleRight className="w-3.5 h-3.5" />
                            Activate Property
                          </button>
                        )}

                        {property.status !== "archived" && (
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              onArchive(property);
                            }}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            Archive Property
                          </button>
                        )}
                      </>
                    )}

                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onSelectContext(property.id);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-t border-zinc-100 dark:border-zinc-800 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-blue-600" />
                      Set as Active Context
                    </button>

                    {canDelete && (
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete(property);
                        }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border-t border-zinc-100 dark:border-zinc-800 cursor-pointer"
                      >
                        Delete Property
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 3 Metrics Box */}
        <div className="grid grid-cols-3 gap-2 py-3 px-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60 text-center text-xs">
          <div>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-1">
              <Layers className="w-3 h-3 text-zinc-400" />
              Floors
            </span>
            <p className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 text-sm">
              {property.floorsCount}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-1">
              <DoorOpen className="w-3 h-3 text-zinc-400" />
              Rooms
            </span>
            <p className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 text-sm">
              {property.roomsCount}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-1">
              <BedDouble className="w-3 h-3 text-zinc-400" />
              Total Beds
            </span>
            <p className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 text-sm">
              {property.bedsTotal}
            </p>
          </div>
        </div>

        {/* Occupancy Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
              Occupancy:{" "}
              <strong className={getOccupancyColor(property.occupancyRate).split(" ")[1]}>
                {property.occupancyRate}%
              </strong>
            </span>
            <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">
              {property.bedsOccupied} occupied &bull; {property.bedsAvailable} available
            </span>
          </div>

          <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${occupancyBarClass}`}
              style={{ width: `${Math.min(property.occupancyRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Staff Assignment Strip */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <Shield className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>
              {property.assignedStaff.length > 0 ? (
                <span>
                  {property.assignedStaff.length} Warden{property.assignedStaff.length > 1 ? "s" : ""}:{" "}
                  <strong className="text-zinc-700 dark:text-zinc-300">
                    {property.assignedStaff.map((s) => s.full_name).join(", ")}
                  </strong>
                </span>
              ) : (
                <span className="text-zinc-400 italic">No warden assigned</span>
              )}
            </span>
          </div>

          <span className="text-[10px] text-zinc-400">
            Added {new Date(property.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="p-3 bg-zinc-50/70 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800 rounded-b-2xl flex items-center justify-between gap-2">
        <button
          onClick={() => onViewDetails(property)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-zinc-500" />
          View Details
        </button>

        <Link
          href={`/rooms`}
          onClick={() => onSelectContext(property.id)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
        >
          <span>Rooms & Beds</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
