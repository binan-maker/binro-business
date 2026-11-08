"use client";

import React, { useState, useEffect, useCallback } from "react";
import { businessService } from "@/services/business.service";
import { rentService, type RentChargeWithTenant } from "@/services/rent.service";
import { tenantService, type TenantWithOccupancyInfo } from "@/services/tenant.service";
import {
  Plus,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  X,
  FileText,
  Ban,
  RotateCcw,
  Edit3,
  Lock,
  Trash2,
} from "lucide-react";

import {
  type RentPermissions,
  canEditBillAtProperty,
  canDeleteBillAtProperty,
} from "@/lib/permissions/rent.permissions";

export default function RentPage() {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [bills, setBills] = useState<RentChargeWithTenant[]>([]);
  const [activeTenants, setActiveTenants] = useState<TenantWithOccupancyInfo[]>([]);
  const [permissions, setPermissions] = useState<RentPermissions | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Waiver State
  const [waiveModalOpen, setWaiveModalOpen] = useState(false);
  const [selectedBillForWaiver, setSelectedBillForWaiver] = useState<RentChargeWithTenant | null>(null);
  const [waiverReason, setWaiverReason] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit Description & Notes State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedBillForEdit, setSelectedBillForEdit] = useState<RentChargeWithTenant | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAmountRupees, setEditAmountRupees] = useState<number | string>(0);

  // Delete Rent Charge State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedBillForDelete, setSelectedBillForDelete] = useState<RentChargeWithTenant | null>(null);
  const [isDeletingBill, setIsDeletingBill] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);


  // Form State
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amountRupees, setAmountRupees] = useState(8500);
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

      const [charges, allTenants, userPerms] = await Promise.all([
        rentService.getRentCharges(biz.id),
        tenantService.getTenantsByBusiness(biz.id),
        rentService.getUserRentPermissions(biz.id),
      ]);

      setBills(charges);
      setPermissions(userPerms.permissions);
      const staying = allTenants.filter((t) => !!t.occupancy);
      setActiveTenants(staying);

      if (staying.length > 0) {
        setSelectedTenantId(staying[0].id);
        const rent = Math.round((staying[0].occupancy?.monthly_rent || 850000) / 100);
        setAmountRupees(rent);
      }

      // Default current month cycle
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      setPeriodStart(`${y}-${m}-01`);
      setPeriodEnd(`${y}-${m}-28`);
      setDueDate(`${y}-${m}-05`);
    } catch (err) {
      console.error("Error loading rent charges:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateRentBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const tenantObj = activeTenants.find((t) => t.id === selectedTenantId);
    if (!businessId || !tenantObj || !tenantObj.occupancy) {
      setErrorMsg("Please select an active tenant with a registered stay.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      await rentService.createRentCharge({
        business_id: businessId,
        property_id: tenantObj.occupancy.property_id,
        tenant_id: tenantObj.id,
        occupancy_id: tenantObj.occupancy.id,
        period_start: periodStart,
        period_end: periodEnd,
        due_date: dueDate,
        amount: Math.round(Number(amountRupees) * 100),
        description: `Rent for ${periodStart} to ${periodEnd}`,
      });

      setModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate rent bill.";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenWaiveModal = (bill: RentChargeWithTenant) => {
    setActionError(null);
    setSelectedBillForWaiver(bill);
    setWaiverReason("");
    setWaiveModalOpen(true);
  };

  const handleConfirmWaiver = async () => {
    if (!selectedBillForWaiver) return;
    setActionLoadingId(selectedBillForWaiver.id);
    setActionError(null);

    try {
      await rentService.waiveRentCharge(selectedBillForWaiver.id, waiverReason);
      setWaiveModalOpen(false);
      setSelectedBillForWaiver(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to waive rent charge.";
      setActionError(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRestoreBill = async (bill: RentChargeWithTenant) => {
    setActionLoadingId(bill.id);
    setActionError(null);

    try {
      await rentService.restoreRentCharge(bill.id);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to restore rent charge.";
      setActionError(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenEditModal = (bill: RentChargeWithTenant) => {
    setActionError(null);
    setSelectedBillForEdit(bill);
    setEditDescription(bill.description || "");
    setEditNotes(bill.notes || "");
    setEditAmountRupees(Math.round(bill.amount / 100));
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillForEdit) return;
    setActionLoadingId(selectedBillForEdit.id);
    setActionError(null);

    const hasAllocations = selectedBillForEdit.amount_paid > 0;
    const newAmountNum = Number(editAmountRupees);
    if (isNaN(newAmountNum) || newAmountNum <= 0) {
      setActionError("Please enter a valid bill amount greater than 0.");
      setActionLoadingId(null);
      return;
    }

    const newAmountPaise = Math.round(newAmountNum * 100);
    const isAmountChanged = newAmountPaise !== selectedBillForEdit.amount;

    // Strict client-side check: if amount changed and allocations exist, block it!
    if (isAmountChanged && hasAllocations) {
      setActionError(
        `Cannot modify rent charge amount because payments (₹${Math.round(
          selectedBillForEdit.amount_paid / 100
        ).toLocaleString("en-IN")}) have already been allocated to it.`
      );
      setActionLoadingId(null);
      return;
    }

    try {
      const updatePayload: {
        description: string;
        notes: string;
        amount?: number;
      } = {
        description: editDescription,
        notes: editNotes,
      };

      if (permissions?.isAdminOrOwner && isAmountChanged) {
        updatePayload.amount = newAmountPaise;
      }

      await rentService.updateRentCharge(selectedBillForEdit.id, updatePayload);
      setEditModalOpen(false);
      setSelectedBillForEdit(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update rent charge.";
      setActionError(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenDeleteModal = (bill: RentChargeWithTenant) => {
    setDeleteError(null);
    setSelectedBillForDelete(bill);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedBillForDelete) return;
    setIsDeletingBill(true);
    setDeleteError(null);

    try {
      await rentService.deleteRentCharge(selectedBillForDelete.id);
      setDeleteModalOpen(false);
      setSelectedBillForDelete(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete rent charge.";
      setDeleteError(msg);
    } finally {
      setIsDeletingBill(false);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Rent & Billing Roll
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Monthly billing periods and due statuses queried live from Supabase.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg(null);
            setModalOpen(true);
          }}
          disabled={activeTenants.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Generate Rent Bill
        </button>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center justify-between text-xs text-red-700 dark:text-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-red-500 hover:text-red-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
          <p className="text-xs text-zinc-500">Loading rent charges from Supabase...</p>
        </div>
      ) : bills.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
            No rent bills generated yet
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {activeTenants.length > 0
              ? "Generate your first monthly rent bill for an active tenant."
              : "Check in a tenant first in the Tenants section before creating rent bills."}
          </p>
          {activeTenants.length > 0 && (
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Generate First Bill
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tenant</th>
                  <th className="py-3 px-4">Billing Period</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {bills.map((bill) => {
                  const balance = bill.amount - bill.amount_paid;
                  const isActionLoading = actionLoadingId === bill.id;
                  const canWaive = Boolean(permissions?.canWaiveBill);
                  const canEdit = permissions ? canEditBillAtProperty(permissions, bill.property_id) : false;
                  const canDelete = permissions ? canDeleteBillAtProperty(permissions, bill.property_id) : false;
                  const isDeletable = bill.amount_paid === 0 && bill.status !== "paid" && bill.status !== "partially_paid";

                  return (
                    <tr key={bill.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                      <td className="py-3.5 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                        {bill.tenant_name}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                        {bill.period_start} to {bill.period_end}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-500">{bill.due_date}</td>
                      <td className="py-3.5 px-4 font-bold text-zinc-900 dark:text-zinc-100">
                        ₹{Math.round(bill.amount / 100).toLocaleString("en-IN")}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                        ₹{Math.round(bill.amount_paid / 100).toLocaleString("en-IN")}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-amber-600 dark:text-amber-400">
                        ₹{Math.round(balance / 100).toLocaleString("en-IN")}
                      </td>
                      <td className="py-3.5 px-4">
                        {bill.status === "paid" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        )}
                        {bill.status === "partially_paid" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3 h-3" /> Partial
                          </span>
                        )}
                        {bill.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                            <AlertCircle className="w-3 h-3" /> Pending
                          </span>
                        )}
                        {bill.status === "waived" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                            <Ban className="w-3 h-3" /> Waived
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(bill)}
                              disabled={isActionLoading || isDeletingBill}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-600 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
                              title="Edit description and notes"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                          )}

                          {canWaive && (
                            bill.status === "waived" ? (
                              <button
                                type="button"
                                onClick={() => handleRestoreBill(bill)}
                                disabled={isActionLoading || isDeletingBill}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Restore this bill back to pending"
                              >
                                {isActionLoading ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3" />
                                )}
                                Restore
                              </button>
                            ) : bill.status === "pending" && bill.amount_paid === 0 ? (
                              <button
                                type="button"
                                onClick={() => handleOpenWaiveModal(bill)}
                                disabled={isActionLoading || isDeletingBill}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Waive this unpaid rent bill"
                              >
                                {isActionLoading ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Ban className="w-3 h-3" />
                                )}
                                Waive
                              </button>
                            ) : null
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteModal(bill)}
                              disabled={isActionLoading || isDeletingBill || !isDeletable}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              title={
                                !isDeletable
                                  ? "Cannot delete rent bill with payment history"
                                  : "Delete this erroneous unpaid rent charge"
                              }
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          )}

                          {!canEdit && !canWaive && !canDelete && (
                            <span className="text-zinc-400 text-xs">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Waive Confirmation Modal */}
      {waiveModalOpen && selectedBillForWaiver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center">
                  <Ban className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold">Waive Rent Charge</h3>
              </div>
              <button
                onClick={() => {
                  setWaiveModalOpen(false);
                  setSelectedBillForWaiver(null);
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-2 bg-zinc-50 dark:bg-zinc-800/50 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-500">Tenant:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedBillForWaiver.tenant_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Period:</span>
                <span>
                  {selectedBillForWaiver.period_start} to {selectedBillForWaiver.period_end}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Amount:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  ₹{Math.round(selectedBillForWaiver.amount / 100).toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-500">
              Waiving this bill sets its status to <strong className="text-zinc-700 dark:text-zinc-300">Waived</strong> with ₹0 paid. Only bills with no payment allocations can be waived. You can restore it back to pending later if needed.
            </p>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Reason / Note (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Owner concession, promotional waiver"
                value={waiverReason}
                onChange={(e) => setWaiverReason(e.target.value)}
                maxLength={200}
                className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setWaiveModalOpen(false);
                  setSelectedBillForWaiver(null);
                }}
                disabled={actionLoadingId !== null}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWaiver}
                disabled={actionLoadingId !== null}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {actionLoadingId === selectedBillForWaiver.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Waiving...
                  </>
                ) : (
                  "Confirm Waiver"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Description & Notes Modal */}
      {editModalOpen && selectedBillForEdit && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold">Edit Rent Charge</h3>
              </div>
              <button
                onClick={() => {
                  setEditModalOpen(false);
                  setSelectedBillForEdit(null);
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-2 bg-zinc-50 dark:bg-zinc-800/50 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-500">Tenant:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedBillForEdit.tenant_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Period:</span>
                <span>
                  {selectedBillForEdit.period_start} to {selectedBillForEdit.period_end}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Amount:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  ₹{Math.round(selectedBillForEdit.amount / 100).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Status:</span>
                <span className="font-semibold capitalize text-zinc-700 dark:text-zinc-300">
                  {selectedBillForEdit.status.replace("_", " ")}
                </span>
              </div>
            </div>

            {permissions?.isWarden && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-800 dark:text-amber-300">
                <strong>Staff Permission Scope:</strong> You can edit operational descriptions and internal notes for assigned properties. Financial amounts, dates, and statuses are protected by business policy.
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Bill Amount (₹)
                  </label>
                  {selectedBillForEdit.amount_paid > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      <Lock className="w-3 h-3" />
                      Locked (₹{Math.round(selectedBillForEdit.amount_paid / 100).toLocaleString("en-IN")} Allocated)
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  value={editAmountRupees}
                  onChange={(e) => setEditAmountRupees(e.target.value)}
                  disabled={!permissions?.isAdminOrOwner || selectedBillForEdit.amount_paid > 0}
                  className={`w-full py-2 px-3 text-xs rounded-xl border ${
                    selectedBillForEdit.amount_paid > 0 || !permissions?.isAdminOrOwner
                      ? "border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                      : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  }`}
                />
                {selectedBillForEdit.amount_paid > 0 ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Payments have already been allocated to this charge. Bill amount cannot be changed when allocations exist.
                  </p>
                ) : !permissions?.isAdminOrOwner ? (
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Only owners and administrators can adjust billing amounts.
                  </p>
                ) : (
                  <p className="text-[11px] text-zinc-400 mt-1">
                    No payment allocations exist yet. Owners/Admins may adjust the bill amount before receipts are recorded.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Room Rent - Standard"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={255}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Internal Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Add operational notes or tenant payment remarks..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  maxLength={1000}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditModalOpen(false);
                    setSelectedBillForEdit(null);
                  }}
                  disabled={actionLoadingId !== null}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoadingId !== null}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoadingId === selectedBillForEdit.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Rent Bill Modal */}
      {modalOpen && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Generate Rent Bill
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

            <form onSubmit={handleCreateRentBill} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Tenant *
                </label>
                <select
                  value={selectedTenantId}
                  onChange={(e) => {
                    setSelectedTenantId(e.target.value);
                    const t = activeTenants.find((x) => x.id === e.target.value);
                    if (t?.occupancy) {
                      setAmountRupees(Math.round(t.occupancy.monthly_rent / 100));
                    }
                  }}
                  required
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {activeTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Period Start *
                  </label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Period End *
                  </label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Bill Amount (₹) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={amountRupees}
                    onChange={(e) => setAmountRupees(Number(e.target.value))}
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
                  disabled={saving || !selectedTenantId}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Create Bill"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Rent Charge Confirmation Modal */}
      {deleteModalOpen && selectedBillForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold">Delete Rent Charge</h3>
              </div>
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setSelectedBillForDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeletingBill}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-2 bg-zinc-50 dark:bg-zinc-800/50 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-500">Tenant:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedBillForDelete.tenant_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Period:</span>
                <span>
                  {selectedBillForDelete.period_start} to {selectedBillForDelete.period_end}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Due Date:</span>
                <span>{selectedBillForDelete.due_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Amount:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  ₹{Math.round(selectedBillForDelete.amount / 100).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Current Status:</span>
                <span className="font-semibold capitalize text-zinc-700 dark:text-zinc-300">
                  {selectedBillForDelete.status.replace("_", " ")}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-800 dark:text-red-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Permanent Record Deletion
              </div>
              <p className="text-[11px] leading-relaxed text-red-700 dark:text-red-400">
                This will permanently delete this rent charge record. Deletion is restricted to erroneous rent charges with zero recorded payments and zero allocations. This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setSelectedBillForDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeletingBill}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingBill}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {isDeletingBill ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Charge
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
