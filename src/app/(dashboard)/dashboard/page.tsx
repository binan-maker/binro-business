"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { businessService } from "@/services/business.service";
import { propertyService } from "@/services/property.service";
import { rentService } from "@/services/rent.service";
import { paymentService } from "@/services/payment.service";
import { createClient } from "@/lib/supabase/client";
import {
  Building2,
  BedDouble,
  Users,
  CreditCard,
  Plus,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState<string>("");
  const [metrics, setMetrics] = useState({
    totalProperties: 0,
    totalRooms: 0,
    totalBeds: 0,
    occupiedBeds: 0,
    availableBeds: 0,
    occupancyRate: 0,
    pendingRentPaise: 0,
    monthlyCollectionPaise: 0,
  });

  useEffect(() => {
    async function loadRealData() {
      try {
        const supabase = createClient();
        const biz = await businessService.getActiveBusiness();
        if (!biz) {
          setLoading(false);
          return;
        }

        setBusinessName(biz.name);

        // 1. Properties
        const properties = await propertyService.getProperties(biz.id);
        const propIds = properties.map((p) => p.id);

        let roomsCount = 0;
        let totalBeds = 0;
        let occupiedBeds = 0;
        let availableBeds = 0;

        if (propIds.length > 0) {
          // 2. Rooms
          const { data: rooms } = await supabase
            .from("rooms")
            .select("id")
            .in("property_id", propIds);

          roomsCount = rooms?.length || 0;
          const roomIds = (rooms || []).map((r) => r.id);

          if (roomIds.length > 0) {
            // 3. Beds
            const { data: beds } = await supabase
              .from("beds")
              .select("id, status")
              .in("room_id", roomIds);

            if (beds) {
              totalBeds = beds.length;
              occupiedBeds = beds.filter((b) => b.status === "occupied").length;
              availableBeds = beds.filter((b) => b.status === "available").length;
            }
          }
        }

        // 4. Financial real metrics
        const pendingRent = await rentService.getPendingRentTotal(biz.id);
        const monthlyCollections = await paymentService.getMonthlyCollections(biz.id);

        const rate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

        setMetrics({
          totalProperties: properties.length,
          totalRooms: roomsCount,
          totalBeds,
          occupiedBeds,
          availableBeds,
          occupancyRate: rate,
          pendingRentPaise: pendingRent,
          monthlyCollectionPaise: monthlyCollections,
        });
      } catch (err) {
        console.error("Error loading real dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadRealData();
  }, []);

  const formatCurrency = (paise: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(paise / 100);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-xs text-zinc-500">Connecting to Supabase and loading live metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {businessName || "Your Business"} Overview
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Live Supabase Data
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Real-time occupancy metrics, beds breakdown, and live payment receipts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/properties"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Property
          </Link>
          <Link
            href="/payments"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition-colors shadow-xs cursor-pointer"
          >
            <CreditCard className="w-4 h-4 text-zinc-500" />
            Record Payment
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Occupancy Rate */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Occupancy Rate
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
              {metrics.occupancyRate}%
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              {metrics.occupiedBeds}/{metrics.totalBeds} beds
            </span>
          </div>
          <div className="mt-3 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${metrics.occupancyRate}%` }}
            />
          </div>
        </div>

        {/* Beds Available */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Available Beds
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <BedDouble className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {metrics.availableBeds}
            </span>
            <span className="text-xs text-zinc-400">ready to occupy</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Across {metrics.totalRooms} rooms in {metrics.totalProperties} properties
          </p>
        </div>

        {/* Collections This Month */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Collections This Month
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(metrics.monthlyCollectionPaise)}
            </span>
          </div>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Cash & UPI allocated
          </p>
        </div>

        {/* Outstanding Dues */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Outstanding Dues
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
              {formatCurrency(metrics.pendingRentPaise)}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Across active tenant occupancies
          </p>
        </div>
      </div>

      {/* Empty State / Quick Setup Guide if zero properties */}
      {metrics.totalProperties === 0 && (
        <div className="p-8 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-sm">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Welcome to {businessName}!
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            You don&apos;t have any properties set up yet. Add your first PG or hostel building to start
            managing rooms, beds, and tenants.
          </p>
          <div className="pt-2">
            <Link
              href="/properties"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Create Your First Property
            </Link>
          </div>
        </div>
      )}

      {/* Quick Navigation Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
          <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            Quick Actions
          </h2>
          <div className="space-y-2.5">
            <Link
              href="/properties"
              className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-xs font-medium text-zinc-800 dark:text-zinc-200"
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Add / Manage Properties</span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-400" />
            </Link>

            <Link
              href="/rooms"
              className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-xs font-medium text-zinc-800 dark:text-zinc-200"
            >
              <div className="flex items-center gap-2.5">
                <BedDouble className="w-4 h-4 text-emerald-600" />
                <span>Configure Floors, Rooms & Beds</span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-400" />
            </Link>

            <Link
              href="/staff"
              className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-xs font-medium text-zinc-800 dark:text-zinc-200"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-purple-600" />
                <span>Assign Property Wardens</span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-400" />
            </Link>
          </div>
        </div>

        {/* Live Operational Status */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              Live Bed Occupancy Breakdown
            </h2>
            <Link
              href="/rooms"
              className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              View Room Matrix →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 text-center">
              <p className="text-xs text-zinc-500">Total Beds</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                {metrics.totalBeds}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-center">
              <p className="text-xs text-emerald-700 dark:text-emerald-400">Occupied</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                {metrics.occupiedBeds}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-center">
              <p className="text-xs text-blue-700 dark:text-blue-400">Available</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-400 mt-1">
                {metrics.availableBeds}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 text-center">
              <p className="text-xs text-amber-700 dark:text-amber-400">Total Rooms</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">
                {metrics.totalRooms}
              </p>
            </div>
          </div>

          <p className="text-xs text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            All occupancy metrics are queried in real-time from your Supabase PostgreSQL database.
          </p>
        </div>
      </div>
    </div>
  );
}
