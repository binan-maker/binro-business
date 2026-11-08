"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { businessService } from "@/services/business.service";
import { propertyService } from "@/services/property.service";
import { rentService } from "@/services/rent.service";
import { paymentService } from "@/services/payment.service";
import { createClient } from "@/lib/supabase/client";
import type { PropertyWithStats, UserRole, BusinessInvitation } from "@/types/app.types";
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
  AlertTriangle,
  UserCheck,
  LogOut,
  Receipt,
  Mail,
  ChevronDown,
  Clock,
  ShieldAlert,
} from "lucide-react";

interface DashboardActivity {
  id: string;
  type: "check_in" | "check_out" | "payment" | "rent_charge" | "invitation";
  title: string;
  description: string;
  propertyName?: string;
  timestamp: string;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string>("");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [accessiblePropertyIds, setAccessiblePropertyIds] = useState<string[] | null>(null);

  // Property list and filter
  const [properties, setProperties] = useState<PropertyWithStats[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");

  // Operational metrics
  const [metrics, setMetrics] = useState({
    totalProperties: 0,
    totalRooms: 0,
    totalBeds: 0,
    occupiedBeds: 0,
    availableBeds: 0,
    occupancyRate: 0,
    monthlyCollectionPaise: 0,
    outstandingRentPaise: 0,
    overdueRentPaise: 0,
    overdueCount: 0,
  });

  // Alerts data
  const [pendingInvitations, setPendingInvitations] = useState<BusinessInvitation[]>([]);

  // Daily Activity timeline
  const [activities, setActivities] = useState<DashboardActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Helper currency formatter
  const formatCurrency = (paise: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(paise / 100);
  };

  // Helper relative time formatter
  const formatRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  // 1. Initial User Context & Properties
  useEffect(() => {
    let isMounted = true;

    async function initDashboardContext() {
      try {
        const biz = await businessService.getActiveBusiness();
        if (!biz) {
          if (isMounted) setLoading(false);
          return;
        }

        if (isMounted) {
          setBusinessId(biz.id);
          setBusinessName(biz.name);
        }

        const [userPropCtx, allProps] = await Promise.all([
          propertyService.getUserPropertyContext(biz.id),
          propertyService.getProperties(biz.id),
        ]);

        if (isMounted) {
          setUserRole(userPropCtx.role);
          setAccessiblePropertyIds(userPropCtx.permissions.accessiblePropertyIds);
          setProperties(allProps);

          // Role-specific property selection
          if (userPropCtx.role === "warden") {
            const assigned = userPropCtx.permissions.accessiblePropertyIds;
            if (assigned && assigned.length > 0) {
              // Automatically select the first assigned property for warden
              setSelectedPropertyId(assigned[0]);
            } else {
              // Unassigned warden: fails closed
              setSelectedPropertyId("none");
            }
          } else {
            // Owner/Admin default to "all"
            setSelectedPropertyId("all");
          }
        }
      } catch (err) {
        console.error("Error initializing dashboard context:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initDashboardContext();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Load Scoped Dashboard Data
  const loadScopedData = useCallback(async () => {
    if (!businessId) return;

    // Fail closed check for unassigned warden
    const isWarden = userRole === "warden";
    const isUnassignedWarden =
      isWarden && (!accessiblePropertyIds || accessiblePropertyIds.length === 0);

    if (isUnassignedWarden) {
      setMetrics({
        totalProperties: 0,
        totalRooms: 0,
        totalBeds: 0,
        occupiedBeds: 0,
        availableBeds: 0,
        occupancyRate: 0,
        monthlyCollectionPaise: 0,
        outstandingRentPaise: 0,
        overdueRentPaise: 0,
        overdueCount: 0,
      });
      setPendingInvitations([]);
      setActivities([]);
      return;
    }

    try {
      setLoadingActivities(true);
      const supabase = createClient();
      const activePropId = selectedPropertyId !== "all" ? selectedPropertyId : undefined;

      // Filter properties relevant to current scope
      const scopedProps =
        selectedPropertyId === "all"
          ? properties
          : properties.filter((p) => p.id === selectedPropertyId);

      // Compute bed & room occupancy stats from scoped properties
      let totalRooms = 0;
      let totalBeds = 0;
      let occupiedBeds = 0;
      let availableBeds = 0;

      for (const p of scopedProps) {
        totalRooms += p.roomsCount || 0;
        totalBeds += p.bedsTotal || 0;
        occupiedBeds += p.bedsOccupied || 0;
        availableBeds += p.bedsAvailable || 0;
      }

      const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

      // Parallel batch fetch: Financial Stats, Overdue Charges, Rent Charges, and Pending Invitations
      const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";

      const [paymentStats, overdueList, rentCharges, invitationsList] = await Promise.all([
        paymentService.getPaymentStats(businessId, { propertyId: activePropId }),
        rentService.getOverdueRentCharges(businessId, { propertyId: activePropId }),
        rentService.getRentCharges(businessId, { propertyId: activePropId }),
        isOwnerOrAdmin ? businessService.getPendingInvitations(businessId) : Promise.resolve([]),
      ]);

      // Financial calculations
      const monthlyCollectionPaise = paymentStats.thisMonthCollected;

      // Outstanding rent: positive balance excluding waived charges
      const outstandingRentPaise = rentCharges
        .filter((c) => c.status !== "waived" && Number(c.amount) > Number(c.amount_paid))
        .reduce((sum, c) => sum + (Number(c.amount) - Number(c.amount_paid)), 0);

      // Overdue rent: positive balance & overdue date
      const overdueRentPaise = overdueList.reduce((sum, c) => sum + c.outstanding_balance, 0);

      // Filter invitations for selected property if applicable
      const filteredInvitations = activePropId
        ? invitationsList.filter((inv) => inv.property_id === activePropId)
        : invitationsList;

      setMetrics({
        totalProperties: scopedProps.length,
        totalRooms,
        totalBeds,
        occupiedBeds,
        availableBeds,
        occupancyRate,
        monthlyCollectionPaise,
        outstandingRentPaise,
        overdueRentPaise,
        overdueCount: overdueList.length,
      });

      setPendingInvitations(filteredInvitations);

      // 3. Build Daily Activity Overview (Past 7 Days Timeline)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const propMap = properties.reduce<Record<string, string>>((acc, p) => {
        acc[p.id] = p.name;
        return acc;
      }, {});

      // Build scoped DB queries for activities
      let occQuery = supabase
        .from("occupancies")
        .select("id, tenant_id, property_id, room_id, bed_id, check_in_date, check_out_date, status, created_at, updated_at")
        .eq("business_id", businessId)
        .or(`created_at.gte.${sevenDaysAgo},check_in_date.gte.${sevenDaysAgo},check_out_date.gte.${sevenDaysAgo}`);

      let payQuery = supabase
        .from("payments")
        .select("id, tenant_id, property_id, amount, payment_method, paid_at, status, created_at")
        .eq("business_id", businessId)
        .eq("status", "received")
        .gte("paid_at", sevenDaysAgo);

      let rentQuery = supabase
        .from("rent_charges")
        .select("id, tenant_id, property_id, amount, description, due_date, status, created_at")
        .eq("business_id", businessId)
        .neq("status", "waived")
        .gte("created_at", sevenDaysAgo);

      // Apply property scoping
      if (activePropId) {
        occQuery = occQuery.eq("property_id", activePropId);
        payQuery = payQuery.eq("property_id", activePropId);
        rentQuery = rentQuery.eq("property_id", activePropId);
      } else if (isWarden && accessiblePropertyIds && accessiblePropertyIds.length > 0) {
        occQuery = occQuery.in("property_id", accessiblePropertyIds);
        payQuery = payQuery.in("property_id", accessiblePropertyIds);
        rentQuery = rentQuery.in("property_id", accessiblePropertyIds);
      }

      const [occRes, payRes, rentRes] = await Promise.all([
        occQuery.order("created_at", { ascending: false }).limit(25),
        payQuery.order("paid_at", { ascending: false }).limit(25),
        rentQuery.order("created_at", { ascending: false }).limit(25),
      ]);

      const occData = occRes.data || [];
      const payData = payRes.data || [];
      const rentData = rentRes.data || [];

      // Collect foreign keys to batch fetch names
      const tenantIds = Array.from(
        new Set([
          ...occData.map((o) => o.tenant_id),
          ...payData.map((p) => p.tenant_id),
          ...rentData.map((r) => r.tenant_id),
        ])
      );

      const roomIds = Array.from(new Set(occData.map((o) => o.room_id).filter(Boolean)));
      const bedIds = Array.from(new Set(occData.map((o) => o.bed_id).filter(Boolean)));

      const [tenantsBatch, roomsBatch, bedsBatch] = await Promise.all([
        tenantIds.length > 0
          ? supabase.from("tenants").select("id, full_name, phone").in("id", tenantIds)
          : Promise.resolve({ data: [] }),
        roomIds.length > 0
          ? supabase.from("rooms").select("id, room_number").in("id", roomIds)
          : Promise.resolve({ data: [] }),
        bedIds.length > 0
          ? supabase.from("beds").select("id, bed_number").in("id", bedIds)
          : Promise.resolve({ data: [] }),
      ]);

      const tenantNameMap = (tenantsBatch.data || []).reduce<Record<string, string>>((acc, t) => {
        acc[t.id] = t.full_name || t.phone || "Tenant";
        return acc;
      }, {});

      const roomNumberMap = (roomsBatch.data || []).reduce<Record<string, string>>((acc, r) => {
        acc[r.id] = r.room_number;
        return acc;
      }, {});

      const bedNumberMap = (bedsBatch.data || []).reduce<Record<string, string>>((acc, b) => {
        acc[b.id] = b.bed_number;
        return acc;
      }, {});

      const rawActivities: DashboardActivity[] = [];

      // A. Check-in / Registration events
      occData.forEach((occ) => {
        const tName = tenantNameMap[occ.tenant_id] || "Tenant";
        const rNum = occ.room_id ? roomNumberMap[occ.room_id] : null;
        const bNum = occ.bed_id ? bedNumberMap[occ.bed_id] : null;
        const placeStr = rNum && bNum ? `Room ${rNum} / Bed ${bNum}` : rNum ? `Room ${rNum}` : "";
        const pName = propMap[occ.property_id] || "Property";

        // Check-in event
        const checkInTime = occ.check_in_date || occ.created_at;
        if (new Date(checkInTime).getTime() >= new Date(sevenDaysAgo).getTime() && occ.status !== "cancelled") {
          rawActivities.push({
            id: `checkin-${occ.id}`,
            type: "check_in",
            title: "Tenant Check-in",
            description: `${tName}${placeStr ? ` assigned to ${placeStr}` : ""}`,
            propertyName: pName,
            timestamp: checkInTime,
          });
        }

        // Check-out event if status is completed
        if (occ.status === "completed" && occ.check_out_date) {
          if (new Date(occ.check_out_date).getTime() >= new Date(sevenDaysAgo).getTime()) {
            rawActivities.push({
              id: `checkout-${occ.id}`,
              type: "check_out",
              title: "Tenant Check-out",
              description: `${tName}${placeStr ? ` checked out from ${placeStr}` : " completed stay"}`,
              propertyName: pName,
              timestamp: occ.check_out_date,
            });
          }
        }
      });

      // B. Payment events
      payData.forEach((pay) => {
        const tName = tenantNameMap[pay.tenant_id] || "Tenant";
        const pName = propMap[pay.property_id] || "Property";
        const amtStr = formatCurrency(Number(pay.amount));
        const methodStr = (pay.payment_method || "Payment").toUpperCase();

        rawActivities.push({
          id: `pay-${pay.id}`,
          type: "payment",
          title: "Payment Received",
          description: `${amtStr} collected from ${tName} via ${methodStr}`,
          propertyName: pName,
          timestamp: pay.paid_at || pay.created_at,
        });
      });

      // C. Rent Charge events
      rentData.forEach((rc) => {
        const tName = tenantNameMap[rc.tenant_id] || "Tenant";
        const pName = propMap[rc.property_id] || "Property";
        const amtStr = formatCurrency(Number(rc.amount));
        const descStr = rc.description ? ` (${rc.description})` : "";

        rawActivities.push({
          id: `rent-${rc.id}`,
          type: "rent_charge",
          title: "Rent Billed",
          description: `${amtStr} billed to ${tName}${descStr}`,
          propertyName: pName,
          timestamp: rc.created_at,
        });
      });

      // D. Pending Warden Invitations (Admin/Owner only)
      if (isOwnerOrAdmin) {
        filteredInvitations.forEach((inv) => {
          if (new Date(inv.created_at).getTime() >= new Date(sevenDaysAgo).getTime()) {
            const nameStr = inv.full_name ? `${inv.full_name} (${inv.phone})` : inv.phone;
            rawActivities.push({
              id: `inv-${inv.id}`,
              type: "invitation",
              title: "Staff Invitation Sent",
              description: `Warden invite sent to ${nameStr}`,
              propertyName: inv.property_name || propMap[inv.property_id] || "Assigned Property",
              timestamp: inv.created_at,
            });
          }
        });
      }

      // Sort chronological descending (newest first) and limit to latest 12
      rawActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(rawActivities.slice(0, 12));
    } catch (err) {
      console.error("Error loading scoped dashboard metrics:", err);
    } finally {
      setLoadingActivities(false);
    }
  }, [businessId, userRole, accessiblePropertyIds, properties, selectedPropertyId]);

  // Load whenever business context or property filter changes
  useEffect(() => {
    if (businessId) {
      loadScopedData();
    }
  }, [businessId, selectedPropertyId, loadScopedData]);

  // Determine authorized selector options
  const isWarden = userRole === "warden";
  const isUnassignedWarden =
    isWarden && (!accessiblePropertyIds || accessiblePropertyIds.length === 0);

  // Property name currently selected
  const selectedPropertyName = useMemo(() => {
    if (selectedPropertyId === "all") return "All Properties";
    if (selectedPropertyId === "none") return "No Property";
    const found = properties.find((p) => p.id === selectedPropertyId);
    return found ? found.name : "Select Property";
  }, [selectedPropertyId, properties]);

  if (loading) {
    return (
      <div className="min-h-[55vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-xs text-zinc-500">Loading daily operations dashboard...</p>
      </div>
    );
  }

  // 1. Fail closed state for unassigned warden
  if (isUnassignedWarden) {
    return (
      <div className="space-y-6">
        <div className="p-8 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center mx-auto shadow-xs">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            No Property Assigned
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            You are signed in as a Property Warden, but no properties have been assigned to your
            account yet. For security and role segregation, business-wide performance metrics are
            hidden. Please contact your business owner or administrator to assign your property.
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
              <Clock className="w-3.5 h-3.5" />
              Awaiting Property Assignment
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Property Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {businessName || "Your Business"} Overview
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Live Operations
            </span>
            {userRole && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 capitalize">
                {userRole} view
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Real-time daily operations overview, live occupancy, overdue rent, and recent activity.
          </p>
        </div>

        {/* Controls: Property Selector & Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Property Selector */}
          <div className="relative inline-flex items-center">
            {isWarden && properties.length === 1 ? (
              // Warden with 1 assigned property: locked badge
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-xs">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>{properties[0]?.name || "Assigned Property"}</span>
              </div>
            ) : (
              // Multi-property selector dropdown for Owner, Admin, or Multi-Property Warden
              <div className="relative">
                <select
                  aria-label="Select property scope"
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="appearance-none pl-8 pr-8 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
                >
                  {!isWarden && <option value="all">All Properties</option>}
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Building2 className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Quick Action: Record Payment */}
          <Link
            href="/payments"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Record Payment
          </Link>

          {/* Quick Action: Add Property (Owner/Admin only) */}
          {(userRole === "owner" || userRole === "admin") && (
            <Link
              href="/properties"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Property
            </Link>
          )}
        </div>
      </div>

      {/* Task 4: Quick Operational Alerts */}
      <div className="space-y-3">
        {/* Overdue Rent Defaulters Alert */}
        {metrics.overdueCount > 0 ? (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-rose-900 dark:text-rose-200">
                  Overdue Rent Alert: {metrics.overdueCount} Defaulter
                  {metrics.overdueCount > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                  Total past-due balance of{" "}
                  <span className="font-semibold">{formatCurrency(metrics.overdueRentPaise)}</span>{" "}
                  across overdue rent bills ({selectedPropertyName}).
                </p>
              </div>
            </div>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-rose-100 underline shrink-0"
            >
              <span>View Defaulters Report</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : null}

        {/* Available Beds Alert */}
        {metrics.availableBeds > 0 && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <BedDouble className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Bed Availability: {metrics.availableBeds} Vacant Bed
                  {metrics.availableBeds > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {metrics.availableBeds} beds ready for immediate tenant check-in across{" "}
                  {metrics.totalRooms} rooms ({selectedPropertyName}).
                </p>
              </div>
            </div>
            <Link
              href="/rooms"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 underline shrink-0"
            >
              <span>View Room Matrix</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Pending Warden Invitations Alert (Owner/Admin only) */}
        {(userRole === "owner" || userRole === "admin") && pendingInvitations.length > 0 && (
          <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                  Pending Staff Invitations ({pendingInvitations.length})
                </p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">
                  {pendingInvitations.length} property warden invitation(s) awaiting acceptance via
                  mobile OTP.
                </p>
              </div>
            </div>
            <Link
              href="/staff"
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 underline shrink-0"
            >
              <span>Manage Staff</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* Task 2: Operational KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
            <span className="text-xs text-zinc-400">
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

        {/* Total Beds */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Beds</span>
            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center">
              <BedDouble className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">
              {metrics.totalBeds}
            </span>
            <span className="text-xs text-zinc-400">across {metrics.totalRooms} rooms</span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
            Capacity in {selectedPropertyName}
          </p>
        </div>

        {/* Occupied Beds */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Occupied Beds
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
              {metrics.occupiedBeds}
            </span>
            <span className="text-xs text-zinc-400">active stays</span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
            {metrics.totalBeds > 0
              ? `${Math.round((metrics.occupiedBeds / metrics.totalBeds) * 100)}% of capacity`
              : "No beds configured"}
          </p>
        </div>

        {/* Available Beds */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Available Beds
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {metrics.availableBeds}
            </span>
            <span className="text-xs text-zinc-400">ready to occupy</span>
          </div>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
            Immediate vacancy
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
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
            Actual payments received (excludes reversed)
          </p>
        </div>

        {/* Outstanding Rent */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Outstanding Rent
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
              {formatCurrency(metrics.outstandingRentPaise)}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
            Unpaid balance (excludes waived charges)
          </p>
        </div>

        {/* Overdue Rent */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Overdue Rent
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
              {formatCurrency(metrics.overdueRentPaise)}
            </span>
          </div>
          <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-2 font-medium">
            {metrics.overdueCount} defaulter{metrics.overdueCount !== 1 ? "s" : ""} past due date
          </p>
        </div>
      </div>

      {/* Zero properties state for onboarding */}
      {properties.length === 0 && !isWarden && (
        <div className="p-8 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-xs">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Welcome to {businessName}!
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            You don&apos;t have any properties set up yet. Add your first PG or hostel building to
            start managing rooms, beds, and tenants.
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

      {/* Main Grid: Task 3 Daily Activity Timeline & Quick Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task 3: Daily Activity Overview (2 cols on large screen) */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Daily Activity Overview
              </h2>
            </div>
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Last 7 days ({selectedPropertyName})
            </span>
          </div>

          {loadingActivities ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-xs">Loading recent activity...</span>
            </div>
          ) : activities.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                No recent activity recorded
              </p>
              <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                No tenant check-ins, check-outs, payment receipts or rent charges occurred in the
                last 7 days for this scope.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((act) => {
                let icon = <CheckCircle2 className="w-4 h-4 text-zinc-500" />;
                let iconBg = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

                if (act.type === "check_in") {
                  icon = <UserCheck className="w-4 h-4" />;
                  iconBg = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400";
                } else if (act.type === "check_out") {
                  icon = <LogOut className="w-4 h-4" />;
                  iconBg = "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400";
                } else if (act.type === "payment") {
                  icon = <CreditCard className="w-4 h-4" />;
                  iconBg = "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400";
                } else if (act.type === "rent_charge") {
                  icon = <Receipt className="w-4 h-4" />;
                  iconBg = "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400";
                } else if (act.type === "invitation") {
                  icon = <Mail className="w-4 h-4" />;
                  iconBg = "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400";
                }

                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconBg}`}
                    >
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {act.title}
                        </span>
                        <span className="text-[10px] text-zinc-400 shrink-0 font-medium">
                          {formatRelativeTime(act.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 truncate">
                        {act.description}
                      </p>
                      {act.propertyName && (
                        <span className="inline-block text-[10px] text-zinc-400 mt-1 font-medium bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md">
                          {act.propertyName}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Operations & Navigation (1 col) */}
        <div className="space-y-6">
          {/* Quick Actions List */}
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              Quick Operations
            </h2>
            <div className="space-y-2">
              <Link
                href="/rooms"
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-xs font-medium text-zinc-800 dark:text-zinc-200"
              >
                <div className="flex items-center gap-2.5">
                  <BedDouble className="w-4 h-4 text-emerald-600" />
                  <span>Rooms & Bed Matrix</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-400" />
              </Link>

              <Link
                href="/tenants"
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-xs font-medium text-zinc-800 dark:text-zinc-200"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Tenant Directory & Check-in</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-400" />
              </Link>

              <Link
                href="/payments"
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-xs font-medium text-zinc-800 dark:text-zinc-200"
              >
                <div className="flex items-center gap-2.5">
                  <CreditCard className="w-4 h-4 text-purple-600" />
                  <span>Payments & Receipts</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-400" />
              </Link>

              <Link
                href="/reports"
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-xs font-medium text-zinc-800 dark:text-zinc-200"
              >
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <span>Reports & Defaulters Suite</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-400" />
              </Link>

              {(userRole === "owner" || userRole === "admin") && (
                <Link
                  href="/staff"
                  className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-xs font-medium text-zinc-800 dark:text-zinc-200"
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>Staff & Warden Assignments</span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-zinc-400" />
                </Link>
              )}
            </div>
          </div>

          {/* Scoped Bed Occupancy Breakdown */}
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              Beds Status ({selectedPropertyName})
            </h2>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 text-center">
                <p className="text-[11px] text-zinc-500">Total</p>
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {metrics.totalBeds}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-center">
                <p className="text-[11px] text-indigo-700 dark:text-indigo-400">Occupied</p>
                <p className="text-lg font-bold text-indigo-700 dark:text-indigo-400">
                  {metrics.occupiedBeds}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-center">
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Available</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {metrics.availableBeds}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 text-center">
                <p className="text-[11px] text-amber-700 dark:text-amber-400">Rooms</p>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                  {metrics.totalRooms}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 pt-1">
              Data sourced directly from live occupancy and bed records.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
