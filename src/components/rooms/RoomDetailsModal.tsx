"use client";

import React from "react";
import Link from "next/link";
import {
  X,
  DoorOpen,
  BedDouble,
  User,
  Phone,
  Calendar,
  IndianRupee,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle,
  Wrench,
  ToggleLeft,
  ArrowRight,
} from "lucide-react";
import type { RoomWithDetails, BedWithOccupant } from "@/types/app.types";
import type { BedStatus } from "@/types/database.types";

interface RoomDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomWithDetails | null;
  onEditRoom: (room: RoomWithDetails) => void;
  onAddBed: (room: RoomWithDetails) => void;
  onEditBed: (bed: BedWithOccupant, room: RoomWithDetails) => void;
  onChangeBedStatus: (bed: BedWithOccupant, room: RoomWithDetails) => void;
  onDeleteBed: (bed: BedWithOccupant, room: RoomWithDetails) => void;
  canManage: boolean;
}

export function RoomDetailsModal({
  isOpen,
  onClose,
  room,
  onEditRoom,
  onAddBed,
  onEditBed,
  onChangeBedStatus,
  onDeleteBed,
  canManage,
}: RoomDetailsModalProps) {
  if (!isOpen || !room) return null;

  const getBedStatusBadge = (status: BedStatus) => {
    switch (status) {
      case "available":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="w-2.5 h-2.5" />
            Available
          </span>
        );
      case "occupied":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <User className="w-2.5 h-2.5" />
            Occupied
          </span>
        );
      case "maintenance":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Wrench className="w-2.5 h-2.5" />
            Maintenance
          </span>
        );
      case "inactive":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
            <AlertCircle className="w-2.5 h-2.5" />
            Inactive
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-xs">
                <DoorOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    Room {room.room_number}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    {room.room_type} Room
                  </span>
                  <span className="text-xs text-zinc-400">&bull;</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {room.floor?.name || "Ground / Unassigned Floor"}
                  </span>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Bed inventory and occupant records for this room.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-850 border border-zinc-100 dark:border-zinc-800">
              <span className="text-[11px] text-zinc-400">Total Beds</span>
              <p className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-0.5">
                {room.bedsTotal}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
              <span className="text-[11px] text-blue-600 dark:text-blue-400">Occupied</span>
              <p className="font-bold text-blue-700 dark:text-blue-300 text-base mt-0.5">
                {room.bedsOccupied}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Available</span>
              <p className="font-bold text-emerald-700 dark:text-emerald-300 text-base mt-0.5">
                {room.bedsAvailable}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body - Bed Inventory Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              Beds in Room {room.room_number} ({room.beds.length})
            </h4>

            {canManage && (
              <button
                onClick={() => onAddBed(room)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Bed
              </button>
            )}
          </div>

          {room.beds.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 bg-zinc-50 dark:bg-zinc-850 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <BedDouble className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                No beds created in this room
              </p>
              <p className="text-[11px] text-zinc-400 mt-1 max-w-xs mx-auto">
                Add beds to enable tenant check-ins and monthly rent billing for this room.
              </p>
              {canManage && (
                <button
                  onClick={() => onAddBed(room)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add First Bed
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {room.beds.map((bed) => {
                const isOccupied = bed.status === "occupied";
                const occupant = bed.current_occupant;

                return (
                  <div
                    key={bed.id}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    {/* Bed Info & Occupant Info */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                          Bed {bed.bed_number}
                        </span>
                        {getBedStatusBadge(bed.status)}
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center">
                          <IndianRupee className="w-3 h-3 text-zinc-400" />
                          {Math.round(bed.monthly_rent / 100).toLocaleString("en-IN")}/mo
                        </span>
                      </div>

                      {isOccupied && occupant ? (
                        <div className="flex items-center gap-3 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 py-1.5 px-2.5 rounded-lg border border-blue-100 dark:border-blue-900/50">
                          <div className="flex items-center gap-1 font-semibold">
                            <User className="w-3.5 h-3.5 shrink-0" />
                            <span>{occupant.tenant_name}</span>
                          </div>
                          {occupant.tenant_phone && (
                            <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                              <Phone className="w-3 h-3 shrink-0" />
                              <span>{occupant.tenant_phone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>Since {occupant.check_in_date}</span>
                          </div>
                        </div>
                      ) : bed.status === "available" ? (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Ready for check-in via Tenants section.
                        </p>
                      ) : (
                        <p className="text-[11px] text-zinc-400">
                          Bed currently marked as {bed.status}.
                        </p>
                      )}
                    </div>

                    {/* Bed Action Buttons */}
                    {canManage && (
                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
                        {/* Status Switch (Disabled if occupied) */}
                        <button
                          onClick={() => onChangeBedStatus(bed, room)}
                          disabled={isOccupied}
                          title={
                            isOccupied
                              ? "Occupied bed status is controlled by tenant checkout"
                              : "Change bed status (available, maintenance, inactive)"
                          }
                          className={`p-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            isOccupied
                              ? "opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800 text-zinc-400"
                              : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                          }`}
                        >
                          <ToggleLeft className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onEditBed(bed, room)}
                          title="Edit bed details"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onDeleteBed(bed, room)}
                          disabled={isOccupied}
                          title={
                            isOccupied
                              ? "Cannot delete an occupied bed"
                              : "Delete bed from room"
                          }
                          className={`p-1.5 rounded-lg transition-colors border ${
                            isOccupied
                              ? "opacity-40 cursor-not-allowed border-zinc-200 dark:border-zinc-800 text-zinc-400"
                              : "border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
          {canManage && (
            <button
              onClick={() => {
                onClose();
                onEditRoom(room);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-zinc-500" />
              Edit Room Settings
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Link
              href="/tenants"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
            >
              <span>Check In Tenant</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
