"use client";

import React from "react";
import { Layers, Plus, Settings2 } from "lucide-react";
import type { FloorWithStats } from "@/types/app.types";

interface FloorTabsProps {
  floors: FloorWithStats[];
  selectedFloorId: string; // 'all' | floorId | 'unassigned'
  onSelectFloor: (floorId: string) => void;
  onOpenAddFloor: () => void;
  onOpenManageFloors: () => void;
  canManageFloors: boolean;
  unassignedRoomsCount: number;
}

export function FloorTabs({
  floors,
  selectedFloorId,
  onSelectFloor,
  onOpenAddFloor,
  onOpenManageFloors,
  canManageFloors,
  unassignedRoomsCount,
}: FloorTabsProps) {
  const totalRooms = floors.reduce((acc, f) => acc + f.roomsCount, 0) + unassignedRoomsCount;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
      {/* Floor Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {/* All Floors Tab */}
        <button
          onClick={() => onSelectFloor("all")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
            selectedFloorId === "all"
              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-xs"
              : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>All Floors</span>
          <span
            className={`px-1.5 py-0.2 rounded-md text-[10px] ${
              selectedFloorId === "all"
                ? "bg-white/20 text-white dark:text-zinc-900 dark:bg-zinc-900/20"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            }`}
          >
            {totalRooms}
          </span>
        </button>

        {/* Individual Floors */}
        {floors.map((floor) => (
          <button
            key={floor.id}
            onClick={() => onSelectFloor(floor.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
              selectedFloorId === floor.id
                ? "bg-blue-600 text-white font-semibold shadow-xs"
                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            <span>{floor.name}</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                selectedFloorId === floor.id
                  ? "bg-white/20 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
              }`}
            >
              {floor.roomsCount}
            </span>
          </button>
        ))}

        {/* Unassigned Rooms Tab if any */}
        {unassignedRoomsCount > 0 && (
          <button
            onClick={() => onSelectFloor("unassigned")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
              selectedFloorId === "unassigned"
                ? "bg-zinc-800 text-white font-semibold shadow-xs"
                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            <span>General / Unassigned</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                selectedFloorId === "unassigned"
                  ? "bg-white/20 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
              }`}
            >
              {unassignedRoomsCount}
            </span>
          </button>
        )}
      </div>

      {/* Floor Actions */}
      {canManageFloors && (
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <button
            onClick={onOpenManageFloors}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer shadow-2xs"
            title="Edit or delete floors"
          >
            <Settings2 className="w-3.5 h-3.5 text-zinc-500" />
            <span>Manage Floors</span>
          </button>

          <button
            onClick={onOpenAddFloor}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Floor</span>
          </button>
        </div>
      )}
    </div>
  );
}
