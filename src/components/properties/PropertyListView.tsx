"use client";

import React from "react";
import Link from "next/link";
import {
  Building,
  MapPin,
  CheckCircle,
  AlertCircle,
  Archive,
  Eye,
  Edit2,
  ArrowRight,
  Shield,
  Check,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { PropertyWithStats } from "@/types/app.types";
import type { PropertyStatus } from "@/types/database.types";

interface PropertyListViewProps {
  properties: PropertyWithStats[];
  activeContextId: string | null;
  onSelectContext: (id: string) => void;
  onViewDetails: (property: PropertyWithStats) => void;
  onEdit: (property: PropertyWithStats) => void;
  onToggleStatus: (property: PropertyWithStats, newStatus: PropertyStatus) => void;
  canEdit: boolean;
  canChangeStatus: boolean;
}

export function PropertyListView({
  properties,
  activeContextId,
  onSelectContext,
  onViewDetails,
  onEdit,
  onToggleStatus,
  canEdit,
  canChangeStatus,
}: PropertyListViewProps) {
  const getStatusBadge = (status: PropertyStatus) => {
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
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Property</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Floors / Rooms</th>
              <th className="py-3 px-4">Occupancy</th>
              <th className="py-3 px-4">Wardens</th>
              <th className="py-3 px-4 text-center">Context</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {properties.map((prop) => {
              const isSelected = activeContextId === prop.id;
              const barClass =
                prop.occupancyRate >= 80
                  ? "bg-emerald-500"
                  : prop.occupancyRate >= 40
                  ? "bg-blue-600"
                  : "bg-amber-500";

              return (
                <tr
                  key={prop.id}
                  className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors ${
                    isSelected ? "bg-blue-50/30 dark:bg-blue-950/20" : ""
                  }`}
                >
                  {/* Property Name & Address */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Building className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                          {prop.name}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-xs flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span>{prop.address || "Address not specified"}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {getStatusBadge(prop.status)}
                  </td>

                  {/* Floors & Rooms */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {prop.roomsCount} Rooms
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {prop.floorsCount} Floors
                    </div>
                  </td>

                  {/* Occupancy */}
                  <td className="py-3.5 px-4 min-w-[150px]">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">
                        {prop.occupancyRate}%
                      </span>
                      <span className="text-zinc-500">
                        {prop.bedsOccupied}/{prop.bedsTotal} beds
                      </span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${barClass}`}
                        style={{ width: `${Math.min(prop.occupancyRate, 100)}%` }}
                      />
                    </div>
                  </td>

                  {/* Wardens */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {prop.assignedStaff.length > 0 ? (
                      <div className="flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300">
                        <Shield className="w-3.5 h-3.5 text-purple-600" />
                        <span>{prop.assignedStaff.map((s) => s.full_name).join(", ")}</span>
                      </div>
                    ) : (
                      <span className="text-zinc-400 text-[11px] italic">Unassigned</span>
                    )}
                  </td>

                  {/* Context Active Switch */}
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <button
                      onClick={() => onSelectContext(prop.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3 h-3" />
                          Selected
                        </>
                      ) : (
                        "Select"
                      )}
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => onViewDetails(prop)}
                        title="View details"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {canEdit && (
                        <button
                          onClick={() => onEdit(prop)}
                          title="Edit property"
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canChangeStatus && (
                        <button
                          onClick={() =>
                            onToggleStatus(
                              prop,
                              prop.status === "active" ? "inactive" : "active"
                            )
                          }
                          title={prop.status === "active" ? "Deactivate" : "Activate"}
                          className={`p-1.5 rounded-lg cursor-pointer ${
                            prop.status === "active"
                              ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                              : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          }`}
                        >
                          {prop.status === "active" ? (
                            <ToggleLeft className="w-4 h-4" />
                          ) : (
                            <ToggleRight className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      <Link
                        href={`/rooms`}
                        onClick={() => onSelectContext(prop.id)}
                        title="Manage rooms and beds"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
