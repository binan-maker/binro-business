"use client";

import React, { useState, useEffect, useCallback } from "react";
import { businessService } from "@/services/business.service";
import {
  paymentService,
  type PaymentWithTenant,
  type PaymentStats,
  type PaymentAllocationDetail,
} from "@/services/payment.service";
import { tenantService, type TenantWithOccupancyInfo } from "@/services/tenant.service";
import { rentService, type RentChargeWithTenant } from "@/services/rent.service";
import {
  Plus,
  Search,
  CheckCircle2,
  Building,
  CreditCard,
  TrendingUp,
  Receipt,
  Loader2,
  X,
  IndianRupee,
  Calendar,
  Layers,
  Trash2,
  AlertCircle,
} from "lucide-react";
import type { PaymentPermissions } from "@/lib/permissions/payment.permissions";

export default function PaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentWithTenant[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [tenants, setTenants] = useState<TenantWithOccupancyInfo[]>([]);
  const [pendingCharges, setPendingCharges] = useState<RentChargeWithTenant[]>([]);
  const [permissions, setPermissions] = useState<PaymentPermissions | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");

  // Allocation Management Modal State
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [selectedPaymentForManage, setSelectedPaymentForManage] = useState<PaymentWithTenant | null>(null);
  const [allocationsList, setAllocationsList] = useState<PaymentAllocationDetail[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [deletingAllocId, setDeletingAllocId] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  // Record Payment Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [amountRupees, setAmountRupees] = useState<number | string>(8500);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "bank_transfer" | "other">(
    "upi"
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [allocateToBillId, setAllocateToBillId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);


  const loadData = useCallback(async () => {
    try {
      const biz = await businessService.getActiveBusiness();
      if (!biz) {
        setLoading(false);
        return;
      }
      setBusinessId(biz.id);

      const [paymentsList, paymentStats, allTenants, allCharges, userPerms] = await Promise.all([
        paymentService.getPayments(biz.id),
        paymentService.getPaymentStats(biz.id),
        tenantService.getTenantsByBusiness(biz.id),
        rentService.getRentCharges(biz.id),
        paymentService.getUserPaymentPermissions(biz.id),
      ]);

      setPayments(paymentsList);
      setStats(paymentStats);
      setTenants(allTenants);
      setPermissions(userPerms.permissions);

      // Filter charges that have pending amount
      const unpaid = allCharges.filter((c) => c.status === "pending" || c.status === "partially_paid");
      setPendingCharges(unpaid);


      if (allTenants.length > 0 && !selectedTenantId) {
        setSelectedTenantId(allTenants[0].id);
      }

      // Default date to today's local datetime
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
      setPaidAt(localISOTime);
    } catch (err) {
      console.error("Error loading payments data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When selected tenant changes, find their default stay amount and matching unpaid bill
  useEffect(() => {
    if (!selectedTenantId) return;
    const t = tenants.find((item) => item.id === selectedTenantId);
    if (t?.occupancy?.monthly_rent) {
      setAmountRupees(Math.round(t.occupancy.monthly_rent / 100));
    }
    // Check if this tenant has an unpaid rent bill
    const tenantUnpaid = pendingCharges.find((c) => c.tenant_id === selectedTenantId);
    if (tenantUnpaid) {
      setAllocateToBillId(tenantUnpaid.id);
      const remainingPaise = tenantUnpaid.amount - tenantUnpaid.amount_paid;
      setAmountRupees(Math.round(remainingPaise / 100));
    } else {
      setAllocateToBillId("");
    }
  }, [selectedTenantId, tenants, pendingCharges]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    const tenantObj = tenants.find((t) => t.id === selectedTenantId);
    if (!tenantObj) {
      setErrorMsg("Please select a valid tenant.");
      return;
    }

    const propId = tenantObj.occupancy?.property_id;
    if (!propId) {
      setErrorMsg("Selected tenant is not currently assigned to an active property/bed.");
      return;
    }

    const numAmount = Number(amountRupees);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg("Please enter a valid amount greater than 0.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const amountPaise = Math.round(numAmount * 100);

      // Setup optional allocation if an unpaid bill is selected
      const allocations = [];
      if (allocateToBillId) {
        const bill = pendingCharges.find((c) => c.id === allocateToBillId);
        if (bill) {
          const remainingDue = bill.amount - bill.amount_paid;
          const allocAmount = Math.min(amountPaise, remainingDue);
          allocations.push({
            rent_charge_id: bill.id,
            allocated_amount: allocAmount,
          });
        }
      }

      await paymentService.recordPayment({
        business_id: businessId,
        property_id: propId,
        tenant_id: tenantObj.id,
        amount: amountPaise,
        payment_method: paymentMethod,
        transaction_reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        paid_at: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
        allocations: allocations.length > 0 ? allocations : undefined,
      });

      setModalOpen(false);
      setReference("");
      setNotes("");
      setAllocateToBillId("");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record payment.";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenManageModal = async (p: PaymentWithTenant) => {
    setManageError(null);
    setSelectedPaymentForManage(p);
    setManageModalOpen(true);
    setLoadingAllocations(true);
    try {
      const list = await paymentService.getPaymentAllocations(p.id);
      setAllocationsList(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load payment allocations.";
      setManageError(msg);
    } finally {
      setLoadingAllocations(false);
    }
  };

  const handleRemoveAllocation = async (allocationId: string) => {
    if (!selectedPaymentForManage) return;
    setDeletingAllocId(allocationId);
    setManageError(null);

    try {
      await paymentService.removePaymentAllocation(allocationId);
      const updated = await paymentService.getPaymentAllocations(selectedPaymentForManage.id);
      setAllocationsList(updated);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove payment allocation.";
      setManageError(msg);
    } finally {
      setDeletingAllocId(null);
    }
  };


  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      (p.tenant_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.transaction_reference || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.property_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMethod = methodFilter === "all" || p.payment_method === methodFilter;
    return matchesSearch && matchesMethod;
  });

  const tenantUnpaidBills = pendingCharges.filter((c) => c.tenant_id === selectedTenantId);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Payment Receipts & Ledger
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manual cash, UPI, and bank transfer recordings with strict database allocation locking.
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
          Record New Payment
        </button>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Total Collections</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            ₹{Math.round((stats?.totalCollected || 0) / 100).toLocaleString("en-IN")}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">All time recorded receipts</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>This Month</span>
            <Receipt className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
            ₹{Math.round((stats?.thisMonthCollected || 0) / 100).toLocaleString("en-IN")}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">Current calendar month</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>UPI Receipts</span>
            <CreditCard className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            ₹{Math.round((stats?.methodAmounts.upi || 0) / 100).toLocaleString("en-IN")}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">{stats?.methodCounts.upi || 0} transactions</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Cash Collected</span>
            <IndianRupee className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            ₹{Math.round((stats?.methodAmounts.cash || 0) / 100).toLocaleString("en-IN")}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">{stats?.methodCounts.cash || 0} cash receipts</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by tenant, property, or txn reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(["all", "upi", "cash", "bank_transfer", "other"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethodFilter(m)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors uppercase cursor-pointer whitespace-nowrap ${
                methodFilter === m
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50"
              }`}
            >
              {m === "all" ? "All Methods" : m.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <p className="text-xs">Loading payment ledger from Supabase...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-16 text-center text-zinc-500">
            <Receipt className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No payments found</p>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
              Record payments whenever tenants pay via UPI, cash, or direct bank transfer.
            </p>
            <button
              onClick={() => {
                setErrorMsg(null);
                setModalOpen(true);
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Record First Payment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tenant & Property</th>
                  <th className="py-3 px-4">Amount Received</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Txn / Receipt Ref</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Rent Allocation</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {p.tenant_name}
                      </div>
                      <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                        <Building className="w-3 h-3" />
                        {p.property_name}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      ₹{Math.round(p.amount / 100).toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-md font-semibold text-[10px] uppercase ${
                          p.payment_method === "upi"
                            ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800"
                            : p.payment_method === "cash"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                        }`}
                      >
                        {p.payment_method.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300 font-mono text-[11px]">
                      {p.transaction_reference || "—"}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-500 whitespace-nowrap">
                      {new Date(p.paid_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-700 dark:text-zinc-300">
                      <button
                        type="button"
                        onClick={() => handleOpenManageModal(p)}
                        className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium hover:opacity-80 transition-opacity cursor-pointer ${
                          p.allocations_summary?.includes("Fully")
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : p.allocations_summary?.includes("Partially")
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                        title="Click to view allocations"
                      >
                        {p.allocations_summary}
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Received
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenManageModal(p)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-600 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="View & manage allocations"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Allocations
                      </button>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Record Payment</h2>
              <p className="text-xs text-zinc-500">
                Log a verified cash, UPI, or bank transfer receipt from a tenant.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Tenant *
                </label>
                <select
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.phone}) — {t.property_name || "Unassigned"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Allocation to Unpaid Rent Bill */}
              {tenantUnpaidBills.length > 0 && (
                <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                  <label className="block text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">
                    Allocate to Outstanding Rent Bill
                  </label>
                  <select
                    value={allocateToBillId}
                    onChange={(e) => setAllocateToBillId(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs rounded-lg border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Do not allocate (keep unallocated)</option>
                    {tenantUnpaidBills.map((b) => {
                      const due = Math.round((b.amount - b.amount_paid) / 100);
                      return (
                        <option key={b.id} value={b.id}>
                          {b.description || `Rent period ${b.period_start} to ${b.period_end}`} — Due: ₹{due.toLocaleString("en-IN")}
                        </option>
                      );
                    })}
                  </select>
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                    Database triggers will automatically decrement the bill&apos;s outstanding balance.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Amount Received (₹) *
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-zinc-400 text-xs">₹</span>
                    <input
                      type="number"
                      min="1"
                      value={amountRupees}
                      onChange={(e) => setAmountRupees(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target.value as "cash" | "upi" | "bank_transfer" | "other"
                      )
                    }
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 uppercase"
                  >
                    <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="cash">Direct Cash</option>
                    <option value="bank_transfer">Bank Transfer (NEFT / IMPS)</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Transaction / Receipt Ref
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UPI/402938491823 or Memo #12"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Date & Time Received *
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="datetime-local"
                      value={paidAt}
                      onChange={(e) => setPaidAt(e.target.value)}
                      className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                    <Calendar className="w-3.5 h-3.5 text-zinc-400 absolute right-3 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Optional Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid via father's account"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving Receipt...
                    </>
                  ) : (
                    "Confirm & Record Receipt"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Allocations Modal */}
      {manageModalOpen && selectedPaymentForManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setManageModalOpen(false);
                setSelectedPaymentForManage(null);
                setManageError(null);
              }}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 mb-2">
                <Layers className="w-3.5 h-3.5" />
                Ledger Allocations
              </div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Manage Payment Allocations
              </h2>
              <p className="text-xs text-zinc-500">
                View or adjust how this receipt is credited against outstanding rent charges.
              </p>
            </div>

            {/* Payment Summary Box */}
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 space-y-2 mb-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedPaymentForManage.tenant_name}
                  </span>
                  <span className="text-zinc-400 ml-2">({selectedPaymentForManage.property_name})</span>
                </div>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{Math.round(selectedPaymentForManage.amount / 100).toLocaleString("en-IN")}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-500 text-[11px]">
                <span className="uppercase font-semibold text-zinc-600 dark:text-zinc-300">
                  Method: {selectedPaymentForManage.payment_method.replace("_", " ")}
                </span>
                <span>
                  Ref: {selectedPaymentForManage.transaction_reference || "None"}
                </span>
                <span>
                  Date: {new Date(selectedPaymentForManage.paid_at).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            {manageError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{manageError}</span>
              </div>
            )}

            {loadingAllocations ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <p className="text-xs">Fetching allocation records...</p>
              </div>
            ) : allocationsList.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  No allocations found for this payment
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  This entire receipt currently remains unallocated credit.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Linked Rent Charges ({allocationsList.length})
                </div>

                <div className="space-y-2">
                  {allocationsList.map((alloc) => {
                    const rc = alloc.rent_charge;
                    const allocatedRupees = Math.round(alloc.allocated_amount / 100);
                    const totalPaise = rc?.amount || 0;
                    const isDeleting = deletingAllocId === alloc.id;

                    return (
                      <div
                        key={alloc.id}
                        className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span>
                              {rc?.description || `Rent period ${rc?.period_start} to ${rc?.period_end}`}
                            </span>
                            {rc?.status && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  rc.status === "paid"
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                    : rc.status === "partially_paid"
                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                                }`}
                              >
                                {rc.status.replace("_", " ")}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            Bill Total: ₹{Math.round(totalPaise / 100).toLocaleString("en-IN")} • Allocated:{" "}
                            <span className="font-bold text-zinc-700 dark:text-zinc-200">
                              ₹{allocatedRupees.toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 sm:self-center">
                          {permissions?.canRemoveAllocation ? (
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleRemoveAllocation(alloc.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900 transition-colors cursor-pointer disabled:opacity-50"
                              title="Remove this allocation to revert rent status"
                            >
                              {isDeleting ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Removing...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Remove Allocation
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] text-zinc-400 italic">
                              Owner/Admin only
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Ledger Recalculation Note:</span> Removing an allocation automatically decrements the rent charge&apos;s amount paid and returns its status to pending or partially paid. The payment receipt itself remains securely recorded in your ledger.
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setManageModalOpen(false);
                  setSelectedPaymentForManage(null);
                  setManageError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
