"use client";

import React, { useState, useEffect, useCallback } from "react";
import { businessService } from "@/services/business.service";
import { paymentService, type PaymentStats } from "@/services/payment.service";
import { rentService } from "@/services/rent.service";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart3,
  TrendingUp,
  Download,
  Building,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";

interface MonthlyBucket {
  key: string;
  label: string;
  total: number;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState("BinRo Business");
  const [stats, setStats] = useState<PaymentStats | null>(null);
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

  const loadReportData = useCallback(async () => {
    try {
      const biz = await businessService.getActiveBusiness();
      if (!biz) {
        setLoading(false);
        return;
      }
      setBusinessName(biz.name);

      const supabase = createClient();

      // 1. Fetch payments, rent charges, beds, and payment stats in parallel
      const [paymentStats, paymentsRes, rentChargesRes, bedsRes] = await Promise.all([
        paymentService.getPaymentStats(biz.id),
        supabase
          .from("payments")
          .select("amount, payment_method, paid_at, status")
          .eq("business_id", biz.id)
          .eq("status", "received"),
        rentService.getRentCharges(biz.id),
        supabase
          .from("beds")
          .select("id, status, rooms!inner(property_id, properties!inner(business_id))")
          .eq("rooms.properties.business_id", biz.id),
      ]);

      setStats(paymentStats);

      // 2. Compute 6-month monthly collections from real payments
      const monthsMap: Record<string, number> = {};
      const now = new Date();
      const monthBuckets: MonthlyBucket[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const key = `${y}-${m}`;
        const label = d.toLocaleDateString("en-IN", { month: "short" });
        monthsMap[key] = 0;
        monthBuckets.push({ key, label, total: 0 });
      }

      if (paymentsRes.data) {
        for (const p of paymentsRes.data) {
          const pDate = new Date(p.paid_at);
          const key = `${pDate.getFullYear()}-${pDate.getMonth()}`;
          if (monthsMap[key] !== undefined) {
            monthsMap[key] += Math.round(Number(p.amount) / 100);
          }
        }
      }

      for (const bucket of monthBuckets) {
        bucket.total = monthsMap[bucket.key] || 0;
      }
      setMonthlyBuckets(monthBuckets);

      // 3. Compute rent summary
      let totalBilled = 0;
      let totalPaid = 0;
      for (const rc of rentChargesRes) {
        totalBilled += rc.amount;
        totalPaid += rc.amount_paid;
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

      // 4. Compute occupancy summary
      const allBeds = bedsRes.data || [];
      const totalBeds = allBeds.length;
      const occupiedBeds = allBeds.filter((b) => b.status === "occupied").length;
      const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

      setOccupancySummary({
        totalBeds,
        occupiedBeds,
        occupancyRate,
      });
    } catch (err) {
      console.error("Error loading reports data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const biz = await businessService.getActiveBusiness();
      if (!biz) return;
      const payments = await paymentService.getPayments(biz.id);

      const headers = ["Payment ID", "Tenant Name", "Property", "Amount (INR)", "Method", "Txn Reference", "Paid At", "Status"];
      const rows = payments.map((p) => [
        p.id,
        `"${p.tenant_name || ""}"`,
        `"${p.property_name || ""}"`,
        (p.amount / 100).toFixed(2),
        p.payment_method,
        `"${p.transaction_reference || ""}"`,
        p.paid_at,
        p.status,
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `BinRo_${businessName.replace(/\s+/g, "_")}_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error exporting ledger:", err);
    }
  };

  const maxVal = Math.max(...monthlyBuckets.map((b) => b.total), 10000);
  const totalMethodsCount = stats?.totalTransactions || 0;

  const upiPercent =
    totalMethodsCount > 0 ? Math.round(((stats?.methodCounts.upi || 0) / totalMethodsCount) * 100) : 0;
  const cashPercent =
    totalMethodsCount > 0 ? Math.round(((stats?.methodCounts.cash || 0) / totalMethodsCount) * 100) : 0;
  const bankPercent =
    totalMethodsCount > 0
      ? Math.round(((stats?.methodCounts.bank_transfer || 0) / totalMethodsCount) * 100)
      : 0;
  const otherPercent =
    totalMethodsCount > 0 ? Math.max(0, 100 - upiPercent - cashPercent - bankPercent) : 0;

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <p className="text-xs">Computing live financial aggregates from Supabase...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Reports & Business Insights
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Real collections, payment method distributions, and occupancy metrics for {businessName}.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition-colors shadow-xs cursor-pointer"
        >
          <Download className="w-4 h-4 text-zinc-400" />
          Export Payment Statement (.CSV)
        </button>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Total Collections</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            ₹{Math.round((stats?.totalCollected || 0) / 100).toLocaleString("en-IN")}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">
            {stats?.totalTransactions || 0} recorded receipts
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Outstanding Due</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            ₹{rentSummary.totalPending.toLocaleString("en-IN")}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">Pending rent across all bills</p>
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
            ₹{rentSummary.totalPaid.toLocaleString("en-IN")} collected of ₹{rentSummary.totalBilled.toLocaleString("en-IN")}
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

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Collection Summary Bar Chart */}
        <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Monthly Collection Summary (INR)
            </h2>
            <span className="text-[11px] text-zinc-400 font-medium">Last 6 Months</span>
          </div>

          <div className="h-48 flex items-end justify-between gap-3 pt-6 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            {monthlyBuckets.map((m) => {
              const heightPx = maxVal > 0 ? Math.max(8, Math.round((m.total / maxVal) * 140)) : 8;
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
          <p className="text-[11px] text-zinc-400 text-center">
            Calculated dynamically from verified receipts in your Supabase payments table.
          </p>
        </div>

        {/* Real Payment Method Split */}
        <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            Payment Method Split
          </h2>

          <div className="space-y-4 pt-2">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-zinc-700 dark:text-zinc-300">UPI / QR Code</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {upiPercent}% (₹{Math.round((stats?.methodAmounts.upi || 0) / 100).toLocaleString("en-IN")})
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
                  {cashPercent}% (₹{Math.round((stats?.methodAmounts.cash || 0) / 100).toLocaleString("en-IN")})
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
                  {bankPercent}% (₹{Math.round((stats?.methodAmounts.bank_transfer || 0) / 100).toLocaleString("en-IN")})
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
                    {otherPercent}% (₹{Math.round((stats?.methodAmounts.other || 0) / 100).toLocaleString("en-IN")})
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
            <span>All Channels Live</span>
          </div>
        </div>
      </div>
    </div>
  );
}
