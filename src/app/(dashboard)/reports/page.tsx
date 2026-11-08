"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { businessService } from "@/services/business.service";
import { paymentService, type PaymentStats, type PaymentWithTenant } from "@/services/payment.service";
import { rentService, type OverdueRentChargeItem } from "@/services/rent.service";
import { propertyService } from "@/services/property.service";
import type { PropertyWithStats, UserRole } from "@/types/app.types";
import {
  BarChart3,
  TrendingUp,
  Download,
  Building,
  CheckCircle2,
  Clock,
  Loader2,
  Calendar,
  AlertTriangle,
  PhoneCall,
  BedDouble,
  ArrowUpDown,
} from "lucide-react";

interface MonthlyBucket {
  key: string;
  label: string;
  total: number;
}

export type TimeframeOption =
  | "this_month"
  | "prev_month"
  | "last_3_months"
  | "last_6_months"
  | "custom";

type DefaulterSortOption = "oldest" | "balance_desc" | "tenant_asc";

function computeTimeframeBounds(
  timeframe: TimeframeOption,
  customStart?: string,
  customEnd?: string
): { startDate: Date; endDate: Date; label: string } {
  const now = new Date();
  if (timeframe === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: "This Month" };
  } else if (timeframe === "prev_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: "Previous Month" };
  } else if (timeframe === "last_3_months") {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: "Last 3 Months" };
  } else if (timeframe === "custom" && customStart && customEnd) {
    const [sy, sm, sd] = customStart.split("-").map(Number);
    const [ey, em, ed] = customEnd.split("-").map(Number);
    const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      return {
        startDate: start,
        endDate: end,
        label: `${customStart} to ${customEnd}`,
      };
    }
  }
  // Default: last_6_months
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { startDate: start, endDate: end, label: "Last 6 Months" };
}

function buildMonthlyBuckets(startDate: Date, endDate: Date): MonthlyBucket[] {
  const buckets: MonthlyBucket[] = [];
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= last) {
    const y = current.getFullYear();
    const m = current.getMonth();
    const key = `${y}-${m}`;
    const label = current.toLocaleDateString("en-IN", {
      month: "short",
      year: current.getFullYear() !== new Date().getFullYear() ? "2-digit" : undefined,
    });
    buckets.push({ key, label, total: 0 });
    current.setMonth(current.getMonth() + 1);
  }
  return buckets;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("BinRo Business");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [accessiblePropertyIds, setAccessiblePropertyIds] = useState<string[] | null>(null);

  // Property Filter State
  const [properties, setProperties] = useState<PropertyWithStats[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");

  // Timeframe Filter State
  const [timeframe, setTimeframe] = useState<TimeframeOption>("last_6_months");
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [customDateError, setCustomDateError] = useState<string | null>(null);

  // Report Data States
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [filteredPayments, setFilteredPayments] = useState<PaymentWithTenant[]>([]);
  const [monthlyBuckets, setMonthlyBuckets] = useState<MonthlyBucket[]>([]);
  const [rentSummary, setRentSummary] = useState({
    totalBilled: 0,
    totalPaid: 0,
    totalPending: 0,
    collectionRate: 0,
  });
  const [occupancySummary, setOccupancySummary] = useState({
    totalBeds: 0,
    occupiedBeds: 0,
    occupancyRate: 0,
  });
  const [overdueList, setOverdueList] = useState<OverdueRentChargeItem[]>([]);
  const [defaulterSort, setDefaulterSort] = useState<DefaulterSortOption>("oldest");

  // Load authorized properties and role context on mount
  useEffect(() => {
    let isMounted = true;

    async function initUserContext() {
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

          // If warden with exactly 1 assigned property, auto-select it
          if (
            userPropCtx.permissions.accessiblePropertyIds &&
            userPropCtx.permissions.accessiblePropertyIds.length === 1
          ) {
            setSelectedPropertyId(userPropCtx.permissions.accessiblePropertyIds[0]);
          }
        }
      } catch (err) {
        console.error("Error initializing reports context:", err);
      }
    }

    initUserContext();
    return () => {
      isMounted = false;
    };
  }, []);

  // Compute active timeframe bounds
  const bounds = useMemo(() => {
    return computeTimeframeBounds(timeframe, customStart, customEnd);
  }, [timeframe, customStart, customEnd]);

  // Load report data whenever business, selected property, or timeframe changes
  const loadReportData = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    setCustomDateError(null);

    // Validate custom date range if selected
    if (timeframe === "custom") {
      if (!customStart || !customEnd) {
        setCustomDateError("Please choose both a start and end date.");
        setLoading(false);
        return;
      }
      if (customStart > customEnd) {
        setCustomDateError("Start date cannot be after end date.");
        setLoading(false);
        return;
      }
    }

    try {
      const activePropertyFilter = selectedPropertyId !== "all" ? selectedPropertyId : null;
      const startDateIso = bounds.startDate.toISOString();
      const endDateIso = bounds.endDate.toISOString();

      // Parallel fetch:
      // 1. paymentService.getPaymentStats for timeframe & property
      // 2. paymentService.getPayments for timeframe & property
      // 3. rentService.getRentCharges for property
      // 4. propertyService.getProperties for bed occupancy breakdown
      // 5. rentService.getOverdueRentCharges for defaulters table
      const [
        paymentStats,
        paymentsList,
        rentChargesRes,
        propsWithStats,
        overdueCharges,
      ] = await Promise.all([
        paymentService.getPaymentStats(businessId, {
          propertyId: activePropertyFilter,
          startDate: startDateIso,
          endDate: endDateIso,
        }),
        paymentService.getPayments(businessId, {
          propertyId: activePropertyFilter,
          startDate: startDateIso,
          endDate: endDateIso,
          status: "received",
        }),
        rentService.getRentCharges(businessId, {
          propertyId: activePropertyFilter,
        }),
        propertyService.getProperties(businessId),
        rentService.getOverdueRentCharges(businessId, {
          propertyId: activePropertyFilter,
        }),
      ]);

      setStats(paymentStats);
      setFilteredPayments(paymentsList);
      setOverdueList(overdueCharges);
      setProperties(propsWithStats);

      // Build and populate dynamic monthly buckets
      const buckets = buildMonthlyBuckets(bounds.startDate, bounds.endDate);
      const monthsMap: Record<string, number> = {};
      buckets.forEach((b) => {
        monthsMap[b.key] = 0;
      });

      for (const p of paymentsList) {
        const pDate = new Date(p.paid_at);
        const key = `${pDate.getFullYear()}-${pDate.getMonth()}`;
        if (monthsMap[key] !== undefined) {
          monthsMap[key] += Math.round(Number(p.amount) / 100);
        }
      }

      for (const bucket of buckets) {
        bucket.total = monthsMap[bucket.key] || 0;
      }
      setMonthlyBuckets(buckets);

      // Compute rent summary for the selected property scope
      let totalBilled = 0;
      let totalPaid = 0;
      for (const rc of rentChargesRes) {
        if (rc.status !== "waived") {
          totalBilled += Number(rc.amount);
          totalPaid += Number(rc.amount_paid);
        }
      }
      const totalPending = Math.max(0, totalBilled - totalPaid);
      const collectionRate =
        totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 100;

      setRentSummary({
        totalBilled: Math.round(totalBilled / 100),
        totalPaid: Math.round(totalPaid / 100),
        totalPending: Math.round(totalPending / 100),
        collectionRate,
      });

      // Compute occupancy summary respecting selected property filter
      const relevantProps =
        activePropertyFilter !== null
          ? propsWithStats.filter((p) => p.id === activePropertyFilter)
          : propsWithStats;

      const totalBeds = relevantProps.reduce((sum, p) => sum + p.bedsTotal, 0);
      const occupiedBeds = relevantProps.reduce((sum, p) => sum + p.bedsOccupied, 0);
      const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

      setOccupancySummary({
        totalBeds,
        occupiedBeds,
        occupancyRate,
      });
    } catch (err) {
      console.error("Error loading report data:", err);
    } finally {
      setLoading(false);
    }
  }, [
    businessId,
    selectedPropertyId,
    timeframe,
    customStart,
    customEnd,
    bounds,
  ]);

  useEffect(() => {
    if (businessId) {
      loadReportData();
    }
  }, [businessId, loadReportData]);

  // Sorted Defaulters
  const sortedDefaulters = useMemo(() => {
    const list = [...overdueList];
    if (defaulterSort === "oldest") {
      list.sort((a, b) => b.days_overdue - a.days_overdue);
    } else if (defaulterSort === "balance_desc") {
      list.sort((a, b) => b.outstanding_balance - a.outstanding_balance);
    } else if (defaulterSort === "tenant_asc") {
      list.sort((a, b) => a.tenant_name.localeCompare(b.tenant_name));
    }
    return list;
  }, [overdueList, defaulterSort]);

  // Export Receipts Statement (.CSV)
  const handleExportReceiptsCSV = () => {
    try {
      const selectedPropName =
        selectedPropertyId === "all"
          ? "All_Properties"
          : properties.find((p) => p.id === selectedPropertyId)?.name.replace(/\s+/g, "_") ||
            "Property";

      const headers = [
        "Payment ID",
        "Tenant Name",
        "Property",
        "Amount (INR)",
        "Method",
        "Txn Reference",
        "Paid At",
        "Status",
      ];

      const rows = filteredPayments.map((p) => [
        p.id,
        `"${p.tenant_name || ""}"`,
        `"${p.property_name || ""}"`,
        (p.amount / 100).toFixed(2),
        p.payment_method,
        `"${p.transaction_reference || ""}"`,
        p.paid_at,
        p.status,
      ]);

      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      const fileDate = new Date().toISOString().slice(0, 10);
      link.setAttribute(
        "download",
        `BinRo_${businessName.replace(/\s+/g, "_")}_Receipts_${selectedPropName}_${timeframe}_${fileDate}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error exporting receipts statement:", err);
    }
  };

  // Export Overdue Defaulters (.CSV)
  const handleExportDefaultersCSV = () => {
    if (overdueList.length === 0) return;
    try {
      const selectedPropName =
        selectedPropertyId === "all"
          ? "All_Properties"
          : properties.find((p) => p.id === selectedPropertyId)?.name.replace(/\s+/g, "_") ||
            "Property";

      const headers = [
        "Tenant Name",
        "Phone Number",
        "Property",
        "Room",
        "Bed",
        "Outstanding Balance (INR)",
        "Original Amount (INR)",
        "Amount Paid (INR)",
        "Due Date",
        "Days Overdue",
        "Status",
      ];

      const rows = sortedDefaulters.map((d) => [
        `"${d.tenant_name}"`,
        `"${d.tenant_phone}"`,
        `"${d.property_name}"`,
        `"${d.room_number}"`,
        `"${d.bed_number}"`,
        (d.outstanding_balance / 100).toFixed(2),
        (d.amount / 100).toFixed(2),
        (d.amount_paid / 100).toFixed(2),
        d.due_date,
        d.days_overdue,
        d.status,
      ]);

      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      const fileDate = new Date().toISOString().slice(0, 10);
      link.setAttribute(
        "download",
        `BinRo_${businessName.replace(/\s+/g, "_")}_Overdue_Rent_${selectedPropName}_${fileDate}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error exporting overdue defaulters:", err);
    }
  };

  const maxVal = Math.max(...monthlyBuckets.map((b) => b.total), 10000);
  const totalMethodsCount = stats?.totalTransactions || 0;

  const upiPercent =
    totalMethodsCount > 0
      ? Math.round(((stats?.methodCounts.upi || 0) / totalMethodsCount) * 100)
      : 0;
  const cashPercent =
    totalMethodsCount > 0
      ? Math.round(((stats?.methodCounts.cash || 0) / totalMethodsCount) * 100)
      : 0;
  const bankPercent =
    totalMethodsCount > 0
      ? Math.round(((stats?.methodCounts.bank_transfer || 0) / totalMethodsCount) * 100)
      : 0;
  const otherPercent =
    totalMethodsCount > 0 ? Math.max(0, 100 - upiPercent - cashPercent - bankPercent) : 0;

  // Filtered properties for the Occupancy breakdown table
  const occupancyBreakdownList = useMemo(() => {
    if (selectedPropertyId !== "all") {
      return properties.filter((p) => p.id === selectedPropertyId);
    }
    return properties;
  }, [properties, selectedPropertyId]);

  const isWarden = userRole === "warden";

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header & Export Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Reports & Financial Insights
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Property-aware collections, payment distribution, bed occupancy, and overdue rent tracking for{" "}
            {businessName}.
          </p>
        </div>

        <button
          onClick={handleExportReceiptsCSV}
          disabled={loading || filteredPayments.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Download className="w-4 h-4 text-zinc-400" />
          Export Statement (.CSV)
        </button>
      </div>

      {/* Primary Filters Bar: Property & Timeframe */}
      <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Property Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 shrink-0">
              <Building className="w-3.5 h-3.5 text-blue-600" />
              Property Scope:
            </span>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="py-1.5 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer min-w-[220px]"
            >
              {!isWarden && <option value="all">All Properties (Organization-Wide)</option>}
              {isWarden && accessiblePropertyIds && accessiblePropertyIds.length > 1 && (
                <option value="all">All Assigned Properties</option>
              )}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.address ? `(${p.address})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Timeframe Selector Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 mr-1 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              Timeframe:
            </span>
            {(
              [
                { id: "this_month", label: "This Month" },
                { id: "prev_month", label: "Previous Month" },
                { id: "last_3_months", label: "Last 3 Months" },
                { id: "last_6_months", label: "Last 6 Months" },
                { id: "custom", label: "Custom Range" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTimeframe(opt.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  timeframe === opt.id
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Pickers (Visible when custom timeframe selected) */}
        {timeframe === "custom" && (
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500 font-medium">From:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="py-1 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500 font-medium">To:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="py-1 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            {customDateError && (
              <span className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {customDateError}
              </span>
            )}
            <span className="text-[11px] text-zinc-400 ml-auto">
              Selected: {bounds.label}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-xs">Loading live report data for selected property and timeframe...</p>
        </div>
      ) : (
        <>
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
                <span>Collections ({bounds.label})</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
                ₹{Math.round((stats?.totalCollected || 0) / 100).toLocaleString("en-IN")}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {stats?.totalTransactions || 0} receipts in selected period
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
                <span>Total Outstanding Due</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
                ₹{rentSummary.totalPending.toLocaleString("en-IN")}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">Pending across active charges</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
                <span>Collection Efficiency</span>
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                {rentSummary.collectionRate}%
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                ₹{rentSummary.totalPaid.toLocaleString("en-IN")} collected of ₹
                {rentSummary.totalBilled.toLocaleString("en-IN")}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
                <span>Bed Occupancy</span>
                <Building className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">
                {occupancySummary.occupancyRate}%
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {occupancySummary.occupiedBeds} occupied / {occupancySummary.totalBeds} total beds
              </p>
            </div>
          </div>

          {/* Main Charts Grid: Monthly Bar Chart & Payment Method Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Monthly Collection Summary Bar Chart */}
            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  Monthly Collection Summary (INR)
                </h2>
                <span className="text-[11px] text-zinc-400 font-medium">
                  {bounds.label}
                </span>
              </div>

              {monthlyBuckets.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-zinc-400 text-xs">
                  No collection data in selected timeframe.
                </div>
              ) : (
                <div className="h-48 flex items-end justify-between gap-3 pt-6 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  {monthlyBuckets.map((m) => {
                    const heightPx =
                      maxVal > 0 ? Math.max(8, Math.round((m.total / maxVal) * 140)) : 8;
                    return (
                      <div key={m.key} className="flex-1 flex flex-col items-center gap-2">
                        <span className="text-[10px] font-semibold text-zinc-500">
                          {m.total > 0 ? `₹${(m.total / 1000).toFixed(1)}k` : "₹0"}
                        </span>
                        <div
                          className="w-full bg-blue-600/80 hover:bg-blue-600 rounded-t-lg transition-all"
                          style={{ height: `${heightPx}px` }}
                          title={`${m.label}: ₹${m.total.toLocaleString("en-IN")}`}
                        />
                        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                          {m.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-zinc-400 text-center">
                Calculated dynamically from verified receipts matching selected property and timeframe.
              </p>
            </div>

            {/* Real Payment Method Split */}
            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  Payment Method Distribution
                </h2>
                <span className="text-[11px] text-zinc-400 font-medium">
                  {totalMethodsCount} Receipts
                </span>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-zinc-700 dark:text-zinc-300">UPI / QR Code</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {upiPercent}% (₹
                      {Math.round((stats?.methodAmounts.upi || 0) / 100).toLocaleString("en-IN")})
                    </span>
                  </div>
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${upiPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-zinc-700 dark:text-zinc-300">Direct Cash</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {cashPercent}% (₹
                      {Math.round((stats?.methodAmounts.cash || 0) / 100).toLocaleString("en-IN")})
                    </span>
                  </div>
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${cashPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-zinc-700 dark:text-zinc-300">Bank Transfer / NEFT / IMPS</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {bankPercent}% (₹
                      {Math.round(
                        (stats?.methodAmounts.bank_transfer || 0) / 100
                      ).toLocaleString("en-IN")}
                      )
                    </span>
                  </div>
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${bankPercent}%` }}
                    />
                  </div>
                </div>

                {otherPercent > 0 && (
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span className="text-zinc-700 dark:text-zinc-300">Other Methods</span>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">
                        {otherPercent}% (₹
                        {Math.round((stats?.methodAmounts.other || 0) / 100).toLocaleString("en-IN")})
                      </span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-zinc-500 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${otherPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
                <span>Total Receipts: {totalMethodsCount}</span>
                <span>Filtered by Selected Property &amp; Timeframe</span>
              </div>
            </div>
          </div>

          {/* Task 3: Property-Wise Occupancy and Vacancy Breakdown */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-purple-600" />
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Property Occupancy &amp; Vacancy Breakdown
                </h2>
              </div>
              <span className="text-xs text-zinc-400">
                {occupancyBreakdownList.length} propert
                {occupancyBreakdownList.length === 1 ? "y" : "ies"}
              </span>
            </div>

            {occupancyBreakdownList.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs">
                No accessible properties found for this account.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Property</th>
                      <th className="py-3 px-4 text-center">Total Beds</th>
                      <th className="py-3 px-4 text-center">Occupied Beds</th>
                      <th className="py-3 px-4 text-center">Available / Vacant</th>
                      <th className="py-3 px-4">Occupancy Rate</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {occupancyBreakdownList.map((p) => {
                      const rate = p.occupancyRate;
                      const progressColor =
                        rate >= 80
                          ? "bg-emerald-600"
                          : rate >= 50
                          ? "bg-blue-600"
                          : "bg-amber-500";

                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                              <Building className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              {p.name}
                            </div>
                            {p.address && (
                              <div className="text-[11px] text-zinc-400 mt-0.5">
                                {p.address}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center font-semibold text-zinc-800 dark:text-zinc-200">
                            {p.bedsTotal}
                          </td>
                          <td className="py-3.5 px-4 text-center font-semibold text-purple-600 dark:text-purple-400">
                            {p.bedsOccupied}
                          </td>
                          <td className="py-3.5 px-4 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                            {p.bedsAvailable}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-24 bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden shrink-0">
                                <div
                                  className={`h-2 rounded-full ${progressColor}`}
                                  style={{ width: `${rate}%` }}
                                />
                              </div>
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {rate}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 capitalize">
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Aggregate Summary Row if multiple properties viewed */}
                    {occupancyBreakdownList.length > 1 && (
                      <tr className="bg-zinc-50/75 dark:bg-zinc-850/60 font-semibold border-t-2 border-zinc-200 dark:border-zinc-700">
                        <td className="py-3 px-4 text-zinc-900 dark:text-zinc-100">
                          Total (All Scoped Properties)
                        </td>
                        <td className="py-3 px-4 text-center text-zinc-900 dark:text-zinc-100">
                          {occupancySummary.totalBeds}
                        </td>
                        <td className="py-3 px-4 text-center text-purple-600 dark:text-purple-400">
                          {occupancySummary.occupiedBeds}
                        </td>
                        <td className="py-3 px-4 text-center text-emerald-600 dark:text-emerald-400">
                          {Math.max(0, occupancySummary.totalBeds - occupancySummary.occupiedBeds)}
                        </td>
                        <td className="py-3 px-4" colSpan={2}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-24 bg-zinc-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden shrink-0">
                              <div
                                className="h-2 rounded-full bg-purple-600"
                                style={{ width: `${occupancySummary.occupancyRate}%` }}
                              />
                            </div>
                            <span className="font-bold text-zinc-900 dark:text-zinc-100">
                              {occupancySummary.occupancyRate}% Overall
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Task 4: Outstanding Rent / Defaulters Report Table */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Outstanding Rent &amp; Defaulters
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800">
                    {overdueList.length} Overdue
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Tenants with overdue rent charges calculated directly from the payment ledger.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Sorting Dropdown */}
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  <select
                    value={defaulterSort}
                    onChange={(e) => setDefaulterSort(e.target.value as DefaulterSortOption)}
                    className="py-1 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    <option value="oldest">Oldest Overdue First</option>
                    <option value="balance_desc">Highest Outstanding Balance</option>
                    <option value="tenant_asc">Tenant Name (A-Z)</option>
                  </select>
                </div>

                {overdueList.length > 0 && (
                  <button
                    onClick={handleExportDefaultersCSV}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium text-xs transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Defaulters (.CSV)
                  </button>
                )}
              </div>
            </div>

            {overdueList.length === 0 ? (
              <div className="py-14 text-center text-zinc-500">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  No Overdue Rent Charges
                </p>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                  All active bills are fully settled or not yet past due for this property selection.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Tenant Contact</th>
                      <th className="py-3 px-4">Property</th>
                      <th className="py-3 px-4">Room &amp; Bed</th>
                      <th className="py-3 px-4">Outstanding Balance</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Overdue Duration</th>
                      <th className="py-3 px-4 text-right">Bill Period</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {sortedDefaulters.map((d) => (
                      <tr
                        key={d.id}
                        className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {d.tenant_name}
                          </div>
                          {d.tenant_phone && d.tenant_phone !== "—" ? (
                            <a
                              href={`tel:${d.tenant_phone}`}
                              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-0.5 font-mono"
                            >
                              <PhoneCall className="w-3 h-3" />
                              {d.tenant_phone}
                            </a>
                          ) : (
                            <div className="text-[11px] text-zinc-400 mt-0.5">Phone not available</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-zinc-700 dark:text-zinc-300">
                          <span className="inline-flex items-center gap-1 font-medium">
                            <Building className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            {d.property_name}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            {d.room_number !== "—" ? `Room ${d.room_number}` : "—"}
                          </span>
                          {d.bed_number !== "—" && (
                            <span className="text-[11px] text-zinc-400 ml-1">
                              • Bed {d.bed_number}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-red-600 dark:text-red-400 text-sm">
                            ₹{Math.round(d.outstanding_balance / 100).toLocaleString("en-IN")}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            Billed: ₹{Math.round(d.amount / 100).toLocaleString("en-IN")} | Paid: ₹
                            {Math.round(d.amount_paid / 100).toLocaleString("en-IN")}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-zinc-700 dark:text-zinc-300">
                          {new Date(d.due_date).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800">
                            <Clock className="w-3 h-3 shrink-0" />
                            {d.days_overdue} {d.days_overdue === 1 ? "day" : "days"} overdue
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                          <span>
                            {new Date(d.period_start).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                            {" — "}
                            {new Date(d.period_end).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
