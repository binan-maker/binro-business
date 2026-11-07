"use client";

import React, { useState, useEffect, useCallback } from "react";
import { businessService } from "@/services/business.service";
import { propertyService } from "@/services/property.service";
import { roomService, type RoomWithBedsList } from "@/services/room.service";
import type { Property, RoomType } from "@/types/app.types";
import {
  BedDouble,
  Plus,
  Building,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

export default function RoomsPage() {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [rooms, setRooms] = useState<RoomWithBedsList[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // Form State
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("shared");
  const [bedCount, setBedCount] = useState(2);
  const [monthlyRent, setMonthlyRent] = useState(8500);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    try {
      const biz = await businessService.getActiveBusiness();
      if (!biz) {
        setLoading(false);
        return;
      }
      const props = await propertyService.getProperties(biz.id);
      setProperties(props);
      if (props.length > 0) {
        setSelectedPropertyId((prev) => prev || props[0].id);
      }
    } catch (err) {
      console.error("Error loading properties:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRooms = useCallback(async (propId: string) => {
    if (!propId) return;
    try {
      const data = await roomService.getRoomsByProperty(propId);
      setRooms(data);
    } catch (err) {
      console.error("Error loading rooms:", err);
    }
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    if (selectedPropertyId) {
      loadRooms(selectedPropertyId);
    }
  }, [selectedPropertyId, loadRooms]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId || !roomNumber.trim()) {
      setErrorMsg("Please enter a room number and select a property.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      // Convert INR rupees to paise (e.g. 8500 Rs = 850000 paise)
      const rentPaise = Math.round(Number(monthlyRent) * 100);
      await roomService.createRoomWithBeds(
        selectedPropertyId,
        roomNumber,
        roomType,
        Number(bedCount),
        rentPaise
      );

      setRoomNumber("");
      setBedCount(2);
      setMonthlyRent(8500);
      setModalOpen(false);
      await loadRooms(selectedPropertyId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create room.";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const selectedProp = properties.find((p) => p.id === selectedPropertyId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Rooms & Bed Matrix
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Visual room layout and live bed status queried directly from Supabase.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {properties.length > 0 && (
            <div className="relative">
              <select
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="py-2 px-3 pr-8 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none cursor-pointer"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => {
              setErrorMsg(null);
              setModalOpen(true);
            }}
            disabled={properties.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Room & Beds
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
          <p className="text-xs text-zinc-500">Loading rooms from Supabase...</p>
        </div>
      ) : properties.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
            <Building className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
            No properties found
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Please create a property first in the Properties section before adding rooms and beds.
          </p>
        </div>
      ) : rooms.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center mx-auto">
            <BedDouble className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
            No rooms in {selectedProp?.name}
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Configure rooms and beds for this property. Beds will automatically be created and ready for tenant allocation.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Room to {selectedProp?.name}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    {selectedProp?.name}
                  </span>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Room {room.room_number}
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 capitalize">
                  {room.room_type}
                </span>
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                {room.beds.map((bed) => {
                  const isAvailable = bed.status === "available";
                  return (
                    <div
                      key={bed.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        isAvailable
                          ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40"
                          : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <BedDouble
                          className={`w-4 h-4 ${
                            isAvailable
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-400"
                          }`}
                        />
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                            Bed {bed.bed_number}
                          </p>
                          <p className="text-[10px] text-zinc-400 capitalize">{bed.status}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">
                          ₹{Math.round(bed.monthly_rent / 100).toLocaleString("en-IN")}/mo
                        </p>
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase ${
                            isAvailable
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-500"
                          }`}
                        >
                          {isAvailable ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> Available
                            </>
                          ) : (
                            "Occupied"
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Room Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Add Room & Beds
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Property *
                </label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  required
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Room Number *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 101"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Room Type *
                  </label>
                  <select
                    value={roomType}
                    onChange={(e) => {
                      const val = e.target.value as RoomType;
                      setRoomType(val);
                      if (val === "single") setBedCount(1);
                      if (val === "shared") setBedCount(2);
                      if (val === "dormitory") setBedCount(4);
                    }}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="single">Single</option>
                    <option value="shared">Shared (2 Sharing)</option>
                    <option value="dormitory">Dormitory</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Number of Beds *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={bedCount}
                    onChange={(e) => setBedCount(Number(e.target.value))}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Rent / Bed (₹/month) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={monthlyRent}
                    onChange={(e) => setMonthlyRent(Number(e.target.value))}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !roomNumber.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Room & Beds"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
