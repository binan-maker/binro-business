"use client";

import React, { useState, useEffect, useCallback } from "react";
import { businessService, type StaffMemberWithDetails } from "@/services/business.service";
import { propertyService } from "@/services/property.service";
import type { Property, BusinessInvitation } from "@/types/app.types";
import { normalizeIndianPhone } from "@/lib/validations/tenant.validation";
import {
  Shield,
  Building,
  Phone,
  Loader2,
  Users,
  CheckCircle2,
  X,
  Edit2,
  AlertCircle,
  UserPlus,
  Copy,
  Clock,
  Check,
} from "lucide-react";

export default function StaffPage() {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<"owner" | "admin" | "warden" | null>(null);
  const [staffList, setStaffList] = useState<StaffMemberWithDetails[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<BusinessInvitation[]>([]);

  // Modal State for Property Assignment
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<StaffMemberWithDetails | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [saving, setSaving] = useState(false);

  // Modal State for Warden Invitation
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitePropertyId, setInvitePropertyId] = useState<string>("");
  const [invitePhone, setInvitePhone] = useState<string>("");
  const [inviteFullName, setInviteFullName] = useState<string>("");
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState<number>(7);
  const [inviting, setInviting] = useState(false);
  const [inviteSuccessLink, setInviteSuccessLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const loadData = useCallback(async () => {
    try {
      const biz = await businessService.getActiveBusiness();
      if (!biz) {
        setLoading(false);
        return;
      }
      setBusinessId(biz.id);

      const [members, props, role, invitations] = await Promise.all([
        businessService.getBusinessMembersDetailed(biz.id),
        propertyService.getProperties(biz.id),
        businessService.getUserRole(biz.id),
        businessService.getPendingInvitations(biz.id),
      ]);

      setStaffList(members);
      setProperties(props);
      setCurrentUserRole(role);
      setPendingInvitations(invitations);
      if (props.length > 0 && !invitePropertyId) {
        setInvitePropertyId(props[0].id);
      }
    } catch (err) {
      console.error("Error loading staff data:", err);
    } finally {
      setLoading(false);
    }
  }, [invitePropertyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canManageStaff = currentUserRole === "owner" || currentUserRole === "admin";

  const handleOpenAssignModal = (member: StaffMemberWithDetails) => {
    setSelectedMember(member);
    setSelectedPropertyId(member.property_id || "all");
    setStatusMsg(null);
    setAssignModalOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !selectedMember) return;

    setSaving(true);
    setStatusMsg(null);

    try {
      await businessService.assignStaffProperty(
        businessId,
        selectedMember.id,
        selectedPropertyId
      );
      setStatusMsg({ type: "success", text: "Property access updated successfully!" });
      setAssignModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update property assignment.";
      setStatusMsg({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenInviteModal = () => {
    setInvitePhone("");
    setInviteFullName("");
    setInviteExpiresInDays(7);
    if (properties.length > 0) {
      setInvitePropertyId(properties[0].id);
    }
    setInviteSuccessLink(null);
    setCopiedLink(false);
    setStatusMsg(null);
    setInviteModalOpen(true);
  };

  const handleInvitePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d+]/g, "");
    if (raw.startsWith("+91")) raw = raw.slice(3);
    else if (raw.startsWith("91") && raw.length > 10) raw = raw.slice(2);
    else if (raw.startsWith("0")) raw = raw.slice(1);
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    setInvitePhone(digits);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !invitePropertyId) {
      setStatusMsg({ type: "error", text: "Please select an active property to assign." });
      return;
    }

    const norm = normalizeIndianPhone(invitePhone);
    if (!norm.valid) {
      setStatusMsg({
        type: "error",
        text: norm.error || "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
      });
      return;
    }

    setInviting(true);
    setStatusMsg(null);

    try {
      const invitationId = await businessService.createStaffInvitation({
        businessId,
        propertyId: invitePropertyId,
        phone: norm.phone, // Strict +91[6-9][0-9]{9}
        fullName: inviteFullName,
        expiresInDays: inviteExpiresInDays,
      });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const shareUrl = `${origin}/invite/${invitationId}`;
      setInviteSuccessLink(shareUrl);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create invitation.";
      setStatusMsg({ type: "error", text: msg });
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = (url: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const activeWardens = staffList.filter((s) => s.role === "warden");
  const totalMembers = staffList.length;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Staff & Property Wardens
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage organization members and assign property wardens with database RLS protection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-xs font-semibold flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            {totalMembers} Active Member{totalMembers === 1 ? "" : "s"}
          </span>

          {canManageStaff && (
            <button
              onClick={handleOpenInviteModal}
              disabled={properties.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Invite Warden
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            statusMsg.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Staff Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Total Team</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">{totalMembers}</p>
          <p className="text-[11px] text-zinc-400 mt-1">Authorized business users</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Property Wardens</span>
            <Shield className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {activeWardens.length}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">Assigned to specific hostels</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Managed Properties</span>
            <Building className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {properties.length}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">Available for warden delegation</p>
        </div>
      </div>

      {/* Staff Members Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Active Members
          </h2>
          <span className="text-xs text-zinc-400">
            {staffList.length} member{staffList.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <p className="text-xs">Loading authorized members from Supabase...</p>
          </div>
        ) : staffList.length === 0 ? (
          <div className="py-16 text-center text-zinc-500">
            <Users className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              No staff members registered
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Assigned Property</th>
                  <th className="py-3 px-4">Status</th>
                  {canManageStaff && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {staffList.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {s.full_name}
                      </div>
                      {s.email && (
                        <div className="text-[11px] text-zinc-400">{s.email}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-zinc-400" />
                        {s.phone}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                          s.role === "owner"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                            : s.role === "warden"
                            ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        {s.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                      <span className="flex items-center gap-1 font-medium">
                        <Building className="w-3.5 h-3.5 text-zinc-400" />
                        {s.property_name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold capitalize text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {s.status}
                      </span>
                    </td>
                    {canManageStaff && (
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenAssignModal(s)}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          Assign Property
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Invitations Section (Owner/Admin Only) */}
      {canManageStaff && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Pending Warden Invitations
              </h2>
            </div>
            <span className="text-xs text-zinc-400">
              {pendingInvitations.length} invitation{pendingInvitations.length === 1 ? "" : "s"}
            </span>
          </div>

          {pendingInvitations.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs">
              No pending invitations. Click &quot;Invite Warden&quot; above to delegate property access.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Invitee Phone</th>
                    <th className="py-3 px-4">Full Name</th>
                    <th className="py-3 px-4">Assigned Property</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Invite Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {pendingInvitations.map((inv) => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    const shareUrl = `${origin}/invite/${inv.id}`;
                    const expiryDate = new Date(inv.expires_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });

                    return (
                      <tr key={inv.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                        <td className="py-3.5 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                          {inv.phone}
                        </td>
                        <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                          {inv.full_name || "—"}
                        </td>
                        <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                          <span className="inline-flex items-center gap-1 font-medium">
                            <Building className="w-3.5 h-3.5 text-zinc-400" />
                            {inv.property_name}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-500 dark:text-zinc-400">
                          {expiryDate}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            Pending
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleCopyLink(shareUrl)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium text-[11px] transition-colors cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            Copy Link
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Assign Property Modal */}
      {assignModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setAssignModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Assign Property Access
              </h2>
              <p className="text-xs text-zinc-500">
                Configure which property <strong>{selectedMember.full_name}</strong> is authorized to manage.
              </p>
            </div>

            <form onSubmit={handleSaveAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Assigned Property Scope
                </label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">All Properties (Full Business Access)</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.address ? `(${p.address})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Wardens will be restricted to view only tenants and rooms in their assigned property.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
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
                      Saving...
                    </>
                  ) : (
                    "Save Assignment"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Warden Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setInviteModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {inviteSuccessLink ? (
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Invitation Created!
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Share this invitation link with the prospective warden. When they verify their phone
                  via SMS OTP, they will automatically gain access to this property.
                </p>

                <div className="mt-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60">
                  <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                    Shareable Invite Link
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteSuccessLink}
                      className="w-full text-xs font-mono py-1.5 px-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyLink(inviteSuccessLink)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedLink ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    Invite Property Warden
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    Delegate operational management of a hostel property to an authorized warden.
                  </p>
                </div>

                <form onSubmit={handleCreateInvite} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Assigned Property *
                    </label>
                    <select
                      value={invitePropertyId}
                      onChange={(e) => setInvitePropertyId(e.target.value)}
                      required
                      className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.address ? `(${p.address})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Warden Mobile Number *
                    </label>
                    <div className="flex rounded-xl shadow-xs border border-zinc-300 dark:border-zinc-700 focus-within:ring-2 focus-within:ring-blue-600 focus-within:border-transparent overflow-hidden bg-white dark:bg-zinc-800">
                      <div className="flex items-center px-3 bg-zinc-100 dark:bg-zinc-700/60 border-r border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 select-none">
                        +91
                      </div>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="98765 43210"
                        value={invitePhone}
                        onChange={handleInvitePhoneChange}
                        maxLength={10}
                        required
                        className="w-full py-2 px-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none bg-transparent"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Enter 10-digit number. Country code (+91) is applied automatically.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Full Name (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Kumar"
                      value={inviteFullName}
                      onChange={(e) => setInviteFullName(e.target.value)}
                      className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 placeholder-zinc-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Invitation Expiry
                    </label>
                    <select
                      value={inviteExpiresInDays}
                      onChange={(e) => setInviteExpiresInDays(Number(e.target.value))}
                      className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value={1}>1 Day</option>
                      <option value={3}>3 Days</option>
                      <option value={7}>7 Days (Recommended)</option>
                      <option value={14}>14 Days</option>
                      <option value={30}>30 Days</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(false)}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviting || !invitePhone}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      {inviting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate Invitation"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
