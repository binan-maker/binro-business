"use client";

import React, { useState } from "react";
import {
  DoorOpen,
  BedDouble,
  User,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  AlertCircle,
  Wrench,
  Eye,
} from "lucide-react";
import type { RoomWithDetails, BedWithOccupant } from "@/types/app.types";
import type { RoomType, RoomStatus, BedStatus } from "@/types/database.types";

interface RoomCardProps {
  room: RoomWithDetails;
  onViewDetails: (room: RoomWithDetails) => void;
  onEditRoom: (room: RoomWithDetails) => void;
  onDeleteRoom: (room: RoomWithDetails) => void;
  onAddBed: (room: RoomWithDetails) => void;
  onSelectBed: (bed: BedWithOccupant, room: RoomWithDetails) => void;
  canManage: boolean;
}

export function RoomCard({
  room,
  onViewDetails,
  onEditRoom,
  onDeleteRoom,
  onAddBed,
  onSelectBed,
  canManage,
}: RoomCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const getRoomTypeBadge = (type: RoomType) => {
    switch (type) {
      case "single":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase tracking-wider">
            Single Room
          </span>
        );
      case "shared":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 uppercase tracking-wider">
            Shared Room
          </span>
        );
      case "dormitory":
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 uppercase tracking-wider">
            Dormitory
          </span>
        );
    }
  };

  const getRoomStatusBadge = (status: RoomStatus) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        );
      case "maintenance":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <Wrench className="w-3 h-3" />
            Maintenance
          </span>
        );
      case "inactive":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500">
            <AlertCircle className="w-3 h-3" />
            Inactive
          </span>
        );
    }
  };

  const getBedChipStyle = (status: BedStatus) => {
    switch (status) {
      case "occupied":
        return "bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200";
      case "available":
        return "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200";
      case "maintenance":
        return "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200";
      case "inactive":
        return "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400";
    }
  };

  const occupancyRate = room.occupancyRate;
  const isFull = room.bedsTotal > 0 && room.bedsOccupied === room.bedsTotal;

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-xs flex flex-col justify-between">
      {/* Top Header Card */}
      <div className="p-5 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
              <DoorOpen className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                  Room {room.room_number}
                </h3>
                {getRoomTypeBadge(room.room_type)}
              </div>

              <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{room.floor?.name || "Ground / Unassigned Floor"}</span>
                <span>&bull;</span>
                {getRoomStatusBadge(room.status)}
              </div>
            </div>
          </div>

          {/* Quick Menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Room options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-44 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg py-1 z-30 text-xs">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onViewDetails(room);
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-zinc-400" />
                    View Bed Ledger
                  </button>

                  {canManage && (
                    <>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onAddBed(room);
                        }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add New Bed
                      </button>

                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onEditRoom(room);
                        }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                        Edit Room Info
                      </button>

                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onDeleteRoom(room);
                        }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border-t border-zinc-100 dark:border-zinc-800 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Room
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Capacity & Occupancy Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <BedDouble className="w-3.5 h-3.5 text-zinc-500" />
              <span>
                {room.bedsOccupied} of {room.bedsTotal} Beds Occupied
              </span>
            </span>

            <span
              className={`text-[11px] font-bold ${
                isFull
                  ? "text-blue-600 dark:text-blue-400"
                  : room.bedsAvailable > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-zinc-400"
              }`}
            >
              {room.bedsTotal > 0 ? `${occupancyRate}% Full` : "No Beds"}
            </span>
          </div>

          <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                isFull
                  ? "bg-blue-600"
                  : occupancyRate > 0
                  ? "bg-emerald-500"
                  : "bg-zinc-300 dark:bg-zinc-700"
              }`}
              style={{ width: `${Math.min(occupancyRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Bed Matrix Chips inside Card */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            Bed Inventory ({room.beds.length}):
          </div>

          {room.beds.length === 0 ? (
            <div className="py-2.5 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 text-center text-xs text-zinc-400 italic">
              No beds allocated in this room yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {room.beds.map((bed) => {
                const isOccupied = bed.status === "occupied";
                return (
                  <button
                    key={bed.id}
                    onClick={() => onSelectBed(bed, room)}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer shadow-2xs hover:scale-[1.02] flex flex-col justify-between ${getBedChipStyle(
                      bed.status
                    )}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs truncate">
                        {bed.bed_number}
                      </span>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{
                        backgroundColor:
                          bed.status === "occupied"
                            ? "#3b82f6"
                            : bed.status === "available"
                            ? "#10b981"
                            : bed.status === "maintenance"
                            ? "#f59e0b"
                            : "#9ca3af"
                      }} />
                    </div>

                    <div className="mt-1 text-[10px] leading-tight truncate">
                      {isOccupied ? (
                        <span className="font-semibold flex items-center gap-1 text-blue-700 dark:text-blue-300">
                          <User className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">
                            {bed.current_occupant?.tenant_name || "Occupied"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                          ₹{Math.round(bed.monthly_rent / 100).toLocaleString("en-IN")}/mo
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="p-3 bg-zinc-50/70 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800 rounded-b-2xl flex items-center justify-between gap-2">
        <button
          onClick={() => onViewDetails(room)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-zinc-500" />
          Manage Beds
        </button>

        {canManage && (
          <button
            onClick={() => onAddBed(room)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bed</span>
          </button>
        )}
      </div>
    </div>
  );
}
