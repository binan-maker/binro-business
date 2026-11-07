"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  Building,
  MapPin,
  Calendar,
  Layers,
  DoorOpen,
  BedDouble,
  Users,
  Shield,
  Edit2,
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  Archive,
  Check,
  Plus,
} from "lucide-react";
import type { PropertyWithStats } from "@/types/app.types";
import type { PropertyStatus } from "@/types/database.types";
import {
  propertyService,
  type PropertyDetailedBreakdown,
} from "@/services/property.service";

interface PropertyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: PropertyWithStats | null;
  onEdit: (property: PropertyWithStats) => void;
  onSelectContext: (id: string) => void;
  isActiveContext: boolean;
  canEdit: boolean;
}

export function PropertyDetailsModal({
  isOpen,
  onClose,
  property,
  onEdit,
  onSelectContext,
  isActiveContext,
  canEdit,
}: PropertyDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState<PropertyDetailedBreakdown | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "rooms" | "staff">("overview");

  useEffect(() => {
    if (!isOpen || !property) {
      setBreakdown(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    propertyService
      .getPropertyDetailedBreakdown(property.id)
      .then((data) => {
        if (isMounted) {
          setBreakdown(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load breakdown:", err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, property]);

  if (!isOpen || !property) return null;

  const getStatusBadge = (status: PropertyStatus) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="w-3.5 h-3.5" />
            Active
          </span>
        );
      case "inactive":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-3.5 h-3.5" />
            Inactive
          </span>
        );
      case "archived":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
            <Archive className="w-3.5 h-3.5" />
            Archived
          </span>
        );
    }
  };

  const getOccupancyBar = (rate: number) => {
    if (rate >= 80) return "bg-emerald-500";
    if (rate >= 40) return "bg-blue-600";
    return "bg-amber-500";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div className="p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-xs">
                <Building className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {property.name}
                  </h2>
                  {getStatusBadge(property.status)}
                  {isActiveContext && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-600 text-white">
                      <Check className="w-3 h-3" />
                      Active Context
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                  <span>{property.address || "No address specified"}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
              aria-label="Close details"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-5 text-xs font-semibold border-b border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab("overview")}
              className={`pb-2 px-1 border-b-2 transition-colors cursor-pointer ${
                activeTab === "overview"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
              }`}
            >
              Overview & Key Metrics
            </button>
            <button
              onClick={() => setActiveTab("rooms")}
              className={`pb-2 px-1 border-b-2 transition-colors cursor-pointer ${
                activeTab === "rooms"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
              }`}
            >
              Floors & Room Matrix ({property.roomsCount})
            </button>
            <button
              onClick={() => setActiveTab("staff")}
              className={`pb-2 px-1 border-b-2 transition-colors cursor-pointer ${
                activeTab === "staff"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
              }`}
            >
              Assigned Wardens ({property.assignedStaff.length})
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-xs">Loading property details from Supabase...</p>
            </div>
          ) : activeTab === "overview" ? (
            <div className="space-y-6">
              {/* 4 KPIs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    Floors
                  </span>
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                    {property.floorsCount}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <DoorOpen className="w-3.5 h-3.5 text-purple-600" />
                    Rooms
                  </span>
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                    {property.roomsCount}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <BedDouble className="w-3.5 h-3.5 text-emerald-600" />
                    Beds Capacity
                  </span>
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                    {property.bedsTotal}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-amber-600" />
                    Occupancy
                  </span>
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                    {property.occupancyRate}%
                  </p>
                </div>
              </div>

              {/* Occupancy Detail Card */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  <span>Occupancy Status & Available Inventory</span>
                  <span className="text-zinc-500 font-normal">
                    {property.bedsOccupied} of {property.bedsTotal} Beds Occupied
                  </span>
                </div>

                <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${getOccupancyBar(
                      property.occupancyRate
                    )}`}
                    style={{ width: `${Math.min(property.occupancyRate, 100)}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                    <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                      Available Beds
                    </p>
                    <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
                      {property.bedsAvailable}
                    </p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      Ready for immediate check-in
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50">
                    <p className="text-blue-700 dark:text-blue-400 font-medium">
                      Occupied Beds
                    </p>
                    <p className="text-lg font-bold text-blue-800 dark:text-blue-300">
                      {property.bedsOccupied}
                    </p>
                    <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                      Generating monthly rent
                    </p>
                  </div>
                </div>
              </div>

              {/* Property Metadata List */}
              <div className="space-y-2 text-xs">
                <h4 className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Property Information
                </h4>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850">
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-zinc-500">Property ID</span>
                    <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 select-all">
                      {property.id}
                    </span>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-zinc-500">Registered On</span>
                    <span className="text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      {new Date(property.created_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-zinc-500">Operating Status</span>
                    <span>{getStatusBadge(property.status)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "rooms" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Configured Rooms & Bed Inventories
                  </h4>
                  <p className="text-[11px] text-zinc-500">
                    Live room layout in {property.name}
                  </p>
                </div>
                <Link
                  href="/rooms"
                  onClick={() => {
                    onSelectContext(property.id);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Room
                </Link>
              </div>

              {!breakdown?.rooms || breakdown.rooms.length === 0 ? (
                <div className="py-10 text-center text-zinc-400 bg-zinc-50 dark:bg-zinc-850 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <DoorOpen className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    No rooms configured yet for this property.
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Add rooms and beds from the Rooms & Beds section.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {breakdown.rooms.map((r) => {
                    const occupied = r.beds.filter((b) => b.status === "occupied").length;
                    const total = r.beds.length;
                    return (
                      <div
                        key={r.id}
                        className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 space-y-2 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            Room {r.room_number}
                          </span>
                          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            {r.room_type}
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-500 flex items-center justify-between">
                          <span>
                            {r.floorName ? `${r.floorName}` : "Ground Floor"}
                          </span>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {occupied}/{total} Beds Occupied
                          </span>
                        </div>

                        {/* Beds Chips */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {r.beds.map((b) => (
                            <span
                              key={b.id}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                                b.status === "occupied"
                                  ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                              }`}
                            >
                              Bed {b.bed_number} ({b.status})
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    Assigned Property Wardens & Staff
                  </h4>
                  <p className="text-[11px] text-zinc-500">
                    Staff members authorized to manage check-ins and oversee this hostel
                  </p>
                </div>
                <Link
                  href="/staff"
                  onClick={onClose}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                >
                  Manage Team & Roles
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {!breakdown?.assignedStaff || breakdown.assignedStaff.length === 0 ? (
                <div className="py-10 text-center text-zinc-400 bg-zinc-50 dark:bg-zinc-850 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <Shield className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    No warden explicitly assigned to this property.
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Owners and Admins can access all properties automatically.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-850">
                  {breakdown.assignedStaff.map((staff) => (
                    <div
                      key={staff.id}
                      className="p-3.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center font-bold text-xs">
                          {staff.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {staff.full_name}
                          </p>
                          <p className="text-[11px] text-zinc-400">
                            {staff.phone || "No phone registered"}
                          </p>
                        </div>
                      </div>

                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 uppercase">
                        {staff.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
          <button
            onClick={() => onSelectContext(property.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              isActiveContext
                ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
                : "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800"
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            {isActiveContext ? "Selected as Active Context" : "Set as Active Context"}
          </button>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(property);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-zinc-500" />
                Edit Info
              </button>
            )}

            <Link
              href="/rooms"
              onClick={() => {
                onSelectContext(property.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
            >
              <span>Manage Rooms & Beds</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
