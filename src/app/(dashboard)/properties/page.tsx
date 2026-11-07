"use client";

import React, { useState, useEffect, useCallback } from "react";
import { businessService } from "@/services/business.service";
import { propertyService } from "@/services/property.service";
import { createClient } from "@/lib/supabase/client";
import type { Property } from "@/types/app.types";
import {
  Building,
  Plus,
  MapPin,
  CheckCircle,
  BedDouble,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";

interface PropertyWithStats extends Property {
  floorsCount: number;
  roomsCount: number;
  bedsTotal: number;
  bedsOccupied: number;
}

export default function PropertiesPage() {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [properties, setProperties] = useState<PropertyWithStats[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // Form State
  const [propName, setPropName] = useState("");
  const [propAddress, setPropAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    try {
      const supabase = createClient();
      const biz = await businessService.getActiveBusiness();
      if (!biz) {
        setLoading(false);
        return;
      }
      setBusinessId(biz.id);

      const props = await propertyService.getProperties(biz.id);

      // Fetch related counts for each property
      const enriched: PropertyWithStats[] = await Promise.all(
        props.map(async (p) => {
          const { count: floorsCount } = await supabase
            .from("floors")
            .select("id", { count: "exact", head: true })
            .eq("property_id", p.id);

          const { data: rooms } = await supabase
            .from("rooms")
            .select("id")
            .eq("property_id", p.id);

          const roomIds = (rooms || []).map((r) => r.id);
          let bedsTotal = 0;
          let bedsOccupied = 0;

          if (roomIds.length > 0) {
            const { data: beds } = await supabase
              .from("beds")
              .select("status")
              .in("room_id", roomIds);

            if (beds) {
              bedsTotal = beds.length;
              bedsOccupied = beds.filter((b) => b.status === "occupied").length;
            }
          }

          return {
            ...p,
            floorsCount: floorsCount || 0,
            roomsCount: rooms?.length || 0,
            bedsTotal,
            bedsOccupied,
          };
        })
      );

      setProperties(enriched);
    } catch (err) {
      console.error("Error loading properties:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !propName.trim()) {
      setErrorMsg("Please enter a property name.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      await propertyService.createProperty(businessId, propName, propAddress);
      setPropName("");
      setPropAddress("");
      setModalOpen(false);
      await loadProperties();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create property.";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Properties
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage your physical hostel/PG buildings stored live in Supabase.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Property
        </button>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
          <p className="text-xs text-zinc-500">Loading your properties from Supabase...</p>
        </div>
      ) : properties.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
            <Building className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
            No properties created yet
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Create your first PG or hostel location (e.g. &ldquo;Sai Balaji Boys PG&rdquo;) to configure rooms, beds, and tenants.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add First Property
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {properties.map((prop) => (
            <div
              key={prop.id}
              className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                      {prop.name}
                    </h3>
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{prop.address || "No address specified"}</span>
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 capitalize">
                  <CheckCircle className="w-3 h-3" />
                  {prop.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 py-3 border-y border-zinc-100 dark:border-zinc-800 text-center text-xs">
                <div>
                  <p className="text-zinc-400">Floors</p>
                  <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">
                    {prop.floorsCount}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Rooms</p>
                  <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">
                    {prop.roomsCount}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Beds Occupied</p>
                  <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                    {prop.bedsOccupied} / {prop.bedsTotal}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 flex items-center gap-1">
                  <BedDouble className="w-3.5 h-3.5" />
                  {prop.bedsTotal - prop.bedsOccupied} beds available
                </span>
                <span className="text-[11px] text-zinc-400">
                  Added on {new Date(prop.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Property Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Add New Property
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

            <form onSubmit={handleCreateProperty} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Property Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sai Balaji Luxury PG (Block A)"
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  required
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Address (Optional)
                </label>
                <textarea
                  placeholder="e.g. Plot 42, Telecom Nagar, Gachibowli, Hyderabad"
                  value={propAddress}
                  onChange={(e) => setPropAddress(e.target.value)}
                  rows={3}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
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
                  disabled={saving || !propName.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving to Supabase...
                    </>
                  ) : (
                    "Save Property"
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
