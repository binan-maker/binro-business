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
  RotateCcw,
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
  const [allocatingRentChargeId, setAllocatingRentChargeId] = useState("");
  const [allocatingAmountRupees, setAllocatingAmountRupees] = useState<number | string>("");
  const [isSubmittingAllocation, setIsSubmittingAllocation] = useState(false);
  const [allocationSuccessMsg, setAllocationSuccessMsg] = useState<string | null>(null);

  // Payment Reversal Modal State
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [selectedPaymentForReverse, setSelectedPaymentForReverse] = useState<PaymentWithTenant | null>(null);
  const [isReversing, setIsReversing] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

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
    setAllocationSuccessMsg(null);
    setAllocatingRentChargeId("");
    setAllocatingAmountRupees("");
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
    setAllocationSuccessMsg(null);

    try {
      await paymentService.removePaymentAllocation(allocationId);
      const updated = await paymentService.getPaymentAllocations(selectedPaymentForManage.id);
      setAllocationsList(updated);
      await loadData();

      if (businessId) {
        const freshPayments = await paymentService.getPayments(businessId);
        setPayments(freshPayments);
        const ref = freshPayments.find((p) => p.id === selectedPaymentForManage.id);
        if (ref) setSelectedPaymentForManage(ref);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove payment allocation.";
      setManageError(msg);
    } finally {
      setDeletingAllocId(null);
    }
  };

  const handleCreateAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentForManage) return;

    setManageError(null);
    setAllocationSuccessMsg(null);

    if (!allocatingRentChargeId) {
      setManageError("Please select an eligible rent bill to allocate to.");
      return;
    }

    const numRupees = Number(allocatingAmountRupees);
    if (isNaN(numRupees) || numRupees <= 0) {
      setManageError("Please enter a valid allocation amount in Rupees (greater than 0).");
      return;
    }

    const allocPaise = Math.round(numRupees * 100);
    setIsSubmittingAllocation(true);

    try {
      await paymentService.allocatePayment({
        paymentId: selectedPaymentForManage.id,
        rentChargeId: allocatingRentChargeId,
        allocatedAmount: allocPaise,
      });

      const updatedAllocs = await paymentService.getPaymentAllocations(selectedPaymentForManage.id);
      setAllocationsList(updatedAllocs);

      await loadData();

      if (businessId) {
        const freshPayments = await paymentService.getPayments(businessId);
        setPayments(freshPayments);
        const ref = freshPayments.find((p) => p.id === selectedPaymentForManage.id);
        if (ref) setSelectedPaymentForManage(ref);
      }

      setAllocatingRentChargeId("");
      setAllocatingAmountRupees("");
      setAllocationSuccessMsg(
        `Successfully allocated ₹${numRupees.toLocaleString("en-IN")} to rent bill.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to allocate payment.";
      setManageError(msg);
    } finally {
      setIsSubmittingAllocation(false);
    }
  };

  const handleOpenReverseModal = (p: PaymentWithTenant) => {
    setReverseError(null);
    setSelectedPaymentForReverse(p);
    setReverseModalOpen(true);
  };

  const handleConfirmReverse = async () => {
    if (!selectedPaymentForReverse) return;
    setIsReversing(true);
    setReverseError(null);
    try {
      await paymentService.reversePayment(selectedPaymentForReverse.id);
      setReverseModalOpen(false);
      setSelectedPaymentForReverse(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reverse payment.";
      setReverseError(msg);
    } finally {
      setIsReversing(false);
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
                    <td className="py-3.5 px-4 font-bold text-sm">
                      {p.status === "reversed" ? (
                        <span className="text-zinc-400 dark:text-zinc-500 line-through">
                          ₹{Math.round(p.amount / 100).toLocaleString("en-IN")}
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          ₹{Math.round(p.amount / 100).toLocaleString("en-IN")}
                        </span>
                      )}
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
                      {p.status === "reversed" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900">
                          <RotateCcw className="w-3 h-3" />
                          Reversed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Received
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenManageModal(p)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-600 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                          title="View & manage allocations"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          Allocations
                        </button>

                        {permissions?.canReversePayment && (
                          p.status === "reversed" ? (
                            <span className="text-[11px] text-zinc-400 italic px-2">
                              Reversed
                            </span>
                          ) : (() => {
                            const hasActiveAllocations = Boolean(
                              (p.allocated_paise || 0) > 0 ||
                              (p.allocations_summary && p.allocations_summary !== "Unallocated")
                            );
                            return (
                              <button
                                type="button"
                                disabled={hasActiveAllocations}
                                onClick={() => handleOpenReverseModal(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                title={
                                  hasActiveAllocations
                                    ? "Cannot reverse payment while allocations exist. Open Allocations and remove them first."
                                    : "Reverse this payment receipt"
                                }
                              >
                                <RotateCcw className="w-3 h-3" />
                                Reverse
                              </button>
                            );
                          })()
                        )}
                      </div>
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

            {/* Payment Summary Box & Allocation Workflow */}
            {(() => {
              const totalAllocatedPaise = allocationsList.reduce(
                (sum, a) => sum + a.allocated_amount,
                0
              );
              const unallocatedPaise = Math.max(
                0,
                selectedPaymentForManage.amount - totalAllocatedPaise
              );
              const totalAmountRupees = Math.round(selectedPaymentForManage.amount / 100);
              const allocatedRupees = Math.round(totalAllocatedPaise / 100);
              const unallocatedRupees = Math.round(unallocatedPaise / 100);

              const canAllocateForThisProperty =
                Boolean(permissions?.canAllocatePayment) &&
                (permissions?.isAdminOrOwner ||
                  (permissions?.accessiblePropertyIds !== null &&
                    permissions?.accessiblePropertyIds.includes(
                      selectedPaymentForManage.property_id
                    )));

              const eligibleCharges = pendingCharges.filter((c) => {
                const matchesTenant = c.tenant_id === selectedPaymentForManage.tenant_id;
                const matchesProperty = c.property_id === selectedPaymentForManage.property_id;
                const isNotWaived = c.status !== "waived";
                const isNotPaid = c.status !== "paid";
                const hasOutstanding = c.amount - c.amount_paid > 0;
                const isNotAlreadyAllocated = !allocationsList.some(
                  (a) => a.rent_charge_id === c.id
                );
                return (
                  matchesTenant &&
                  matchesProperty &&
                  isNotWaived &&
                  isNotPaid &&
                  hasOutstanding &&
                  isNotAlreadyAllocated
                );
              });

              const selectedChargeToAllocate = eligibleCharges.find(
                (c) => c.id === allocatingRentChargeId
              );
              const selectedBillDuePaise = selectedChargeToAllocate
                ? selectedChargeToAllocate.amount - selectedChargeToAllocate.amount_paid
                : 0;
              const enteredAllocRupees = Number(allocatingAmountRupees || 0);
              const enteredAllocPaise = Math.round(enteredAllocRupees * 100);
              const billRemainingPaise = Math.max(0, selectedBillDuePaise - enteredAllocPaise);
              const paymentRemainingPaise = Math.max(0, unallocatedPaise - enteredAllocPaise);

              return (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 text-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                          {selectedPaymentForManage.tenant_name}
                        </span>
                        <span className="text-zinc-400 ml-2">
                          ({selectedPaymentForManage.property_name})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className="uppercase font-semibold text-zinc-600 dark:text-zinc-300">
                          {selectedPaymentForManage.payment_method.replace("_", " ")}
                        </span>
                        <span>• Ref: {selectedPaymentForManage.transaction_reference || "None"}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60">
                      <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                        <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
                          Original Payment
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                          ₹{totalAmountRupees.toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                        <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
                          Total Allocated
                        </div>
                        <div className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                          ₹{allocatedRupees.toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                        <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
                          Unallocated Credit
                        </div>
                        <div
                          className={`text-sm font-bold mt-0.5 ${
                            unallocatedRupees > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-400"
                          }`}
                        >
                          ₹{unallocatedRupees.toLocaleString("en-IN")}
                        </div>
                      </div>
                    </div>
                  </div>

                  {manageError && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{manageError}</span>
                      </div>
                      <button
                        onClick={() => setManageError(null)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {allocationSuccessMsg && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{allocationSuccessMsg}</span>
                      </div>
                      <button
                        onClick={() => setAllocationSuccessMsg(null)}
                        className="text-emerald-500 hover:text-emerald-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Section A: Existing Allocations List */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Existing Allocations ({allocationsList.length})
                    </div>

                    {loadingAllocations ? (
                      <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-400">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        <p className="text-xs">Fetching allocation records...</p>
                      </div>
                    ) : allocationsList.length === 0 ? (
                      <div className="py-6 text-center text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-xs">
                        <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                          No allocations recorded
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          This entire receipt currently remains unallocated credit.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {allocationsList.map((alloc) => {
                          const rc = alloc.rent_charge;
                          const allocRupees = Math.round(alloc.allocated_amount / 100);
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
                                    {rc?.description ||
                                      `Rent period ${rc?.period_start} to ${rc?.period_end}`}
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
                                    ₹{allocRupees.toLocaleString("en-IN")}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 sm:self-center">
                                {permissions?.canRemoveAllocation ? (
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => handleRemoveAllocation(alloc.id)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900 transition-colors cursor-pointer disabled:opacity-50"
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
                                        Remove
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
                    )}
                  </div>

                  {/* Section B: Allocate Payment Section */}
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                      Allocate Remaining Balance
                    </div>

                    {selectedPaymentForManage.status !== "received" ? (
                      <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs">
                        This payment has status &apos;{selectedPaymentForManage.status}&apos; and cannot receive new allocations.
                      </div>
                    ) : unallocatedPaise <= 0 ? (
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Payment receipt is 100% fully allocated. No unallocated credit remains.</span>
                      </div>
                    ) : !canAllocateForThisProperty ? (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs">
                        You do not have permission to allocate payments for this property.
                      </div>
                    ) : eligibleCharges.length === 0 ? (
                      <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 space-y-1">
                        <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                          No outstanding rent charges available
                        </p>
                        <p className="text-[11px]">
                          This tenant has no pending or partially paid rent bills under this property.
                          The remaining ₹{unallocatedRupees.toLocaleString("en-IN")} balance will remain as unallocated credit until a rent bill is generated.
                        </p>
                      </div>
                    ) : (
                      <form
                        onSubmit={handleCreateAllocation}
                        className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 space-y-3"
                      >
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Select Outstanding Rent Bill *
                          </label>
                          <select
                            value={allocatingRentChargeId}
                            onChange={(e) => {
                              const newChargeId = e.target.value;
                              setAllocatingRentChargeId(newChargeId);
                              const bill = eligibleCharges.find((c) => c.id === newChargeId);
                              if (bill) {
                                const duePaise = bill.amount - bill.amount_paid;
                                const maxPaise = Math.min(unallocatedPaise, duePaise);
                                setAllocatingAmountRupees(Math.round(maxPaise / 100));
                              } else {
                                setAllocatingAmountRupees("");
                              }
                            }}
                            className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                            required
                          >
                            <option value="">-- Choose an eligible rent bill --</option>
                            {eligibleCharges.map((b) => {
                              const due = Math.round((b.amount - b.amount_paid) / 100);
                              return (
                                <option key={b.id} value={b.id}>
                                  {b.description || `Rent period ${b.period_start} to ${b.period_end}`} — Outstanding: ₹{due.toLocaleString("en-IN")}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {selectedChargeToAllocate && (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Amount to Allocate (₹) *
                              </label>
                              <div className="relative flex items-center max-w-xs">
                                <span className="absolute left-3 text-zinc-400 text-xs">₹</span>
                                <input
                                  type="number"
                                  min="1"
                                  max={Math.round(Math.min(unallocatedPaise, selectedBillDuePaise) / 100)}
                                  value={allocatingAmountRupees}
                                  onChange={(e) => setAllocatingAmountRupees(e.target.value)}
                                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                  required
                                />
                              </div>
                            </div>

                            {/* Live Calculation Preview */}
                            <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800/60 text-[11px] grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-zinc-400 block">Bill Outstanding Balance:</span>
                                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                  ₹{Math.round(selectedBillDuePaise / 100).toLocaleString("en-IN")}{" "}
                                  &rarr;{" "}
                                  <span className="text-blue-600 dark:text-blue-400 font-bold">
                                    ₹{Math.round(billRemainingPaise / 100).toLocaleString("en-IN")}
                                  </span>
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400 block">Payment Credit Balance:</span>
                                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                  ₹{unallocatedRupees.toLocaleString("en-IN")}{" "}
                                  &rarr;{" "}
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    ₹{Math.round(paymentRemainingPaise / 100).toLocaleString("en-IN")}
                                  </span>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-end">
                              <button
                                type="submit"
                                disabled={
                                  isSubmittingAllocation ||
                                  enteredAllocPaise <= 0 ||
                                  enteredAllocPaise > unallocatedPaise ||
                                  enteredAllocPaise > selectedBillDuePaise
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                              >
                                {isSubmittingAllocation ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Allocating...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Confirm Allocation (₹{Number(allocatingAmountRupees || 0).toLocaleString("en-IN")})
                                  </>
                                )}
                              </button>
                            </div>
                          </>
                        )}
                      </form>
                    )}
                  </div>
                </div>
              );
            })()}

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

      {/* Reverse Payment Modal */}
      {reverseModalOpen && selectedPaymentForReverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setReverseModalOpen(false);
                setSelectedPaymentForReverse(null);
                setReverseError(null);
              }}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Reverse Payment Receipt
                </h2>
                <p className="text-xs text-zinc-500">
                  Administrative financial reversal action
                </p>
              </div>
            </div>

            {reverseError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{reverseError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 space-y-2 mb-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedPaymentForReverse.tenant_name}
                </span>
                <span className="font-bold text-red-600 dark:text-red-400 text-sm">
                  ₹{Math.round(selectedPaymentForReverse.amount / 100).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="text-zinc-500 text-[11px] flex flex-wrap gap-x-3 gap-y-1">
                <span>Method: {selectedPaymentForReverse.payment_method.replace("_", " ").toUpperCase()}</span>
                <span>Ref: {selectedPaymentForReverse.transaction_reference || "None"}</span>
                <span>Property: {selectedPaymentForReverse.property_name}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300 space-y-1 mb-4">
              <p className="font-semibold">Reversal Notice:</p>
              <p>
                Reversing this payment updates its status to &apos;reversed&apos;. The payment record is preserved in your ledger for audit and compliance, but will be excluded from all collection metrics and will no longer be eligible for rent allocations.
              </p>
              <p className="font-medium text-amber-900 dark:text-amber-200">
                This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setReverseModalOpen(false);
                  setSelectedPaymentForReverse(null);
                  setReverseError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isReversing}
                onClick={handleConfirmReverse}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isReversing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Reversing Payment...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Confirm Reversal
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
