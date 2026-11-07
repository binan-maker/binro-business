"use client";

import React, { useState, useEffect, useCallback } from "react";
import { businessService } from "@/services/business.service";
import { propertyService } from "@/services/property.service";
import { roomService } from "@/services/room.service";
import { tenantService, type TenantWithOccupancyInfo } from "@/services/tenant.service";
import type { Property, Bed } from "@/types/app.types";
import {
  Users,
  Plus,
  Phone,
  BedDouble,
  Calendar,
  Search,
  Loader2,
  X,
  AlertCircle,
  LogOut,
} from "lucide-react";

export default function TenantsPage() {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantWithOccupancyInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Properties & available beds for modal
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [availableBeds, setAvailableBeds] = useState<Bed[]>([]);
  const [loadingBeds, setLoadingBeds] = useState(false);

  // Form State
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [selectedBedId, setSelectedBedId] = useState("");
  const [checkInDate, setCheckInDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [monthlyRent, setMonthlyRent] = useState(8500);
  const [securityDeposit, setSecurityDeposit] = useState(17000);
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

      const [tenantList, propList] = await Promise.all([
        tenantService.getTenantsByBusiness(biz.id),
        propertyService.getProperties(biz.id),
      ]);

      setTenants(tenantList);
      setProperties(propList);
      if (propList.length > 0) {
        setSelectedPropertyId(propList[0].id);
      }
    } catch (err) {
      console.error("Error loading tenants:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load available beds when selected property changes in modal
  useEffect(() => {
    async function loadBeds() {
      if (!selectedPropertyId) return;
      setLoadingBeds(true);
      try {
        const beds = await roomService.getAvailableBeds(selectedPropertyId);
        setAvailableBeds(beds);
        if (beds.length > 0) {
          setSelectedBedId(beds[0].id);
          setMonthlyRent(Math.round(beds[0].monthly_rent / 100));
          setSecurityDeposit(Math.round(beds[0].monthly_rent / 100) * 2);
        } else {
          setSelectedBedId("");
        }
      } catch (err) {
        console.error("Error loading available beds:", err);
      } finally {
        setLoadingBeds(false);
      }
    }

    if (modalOpen && selectedPropertyId) {
      loadBeds();
    }
  }, [selectedPropertyId, modalOpen]);

  const handleRegisterAndCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !selectedPropertyId || !selectedBedId || !fullName.trim() || !phone.trim()) {
      setErrorMsg("Please fill in all required fields and select an available bed.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      // 1. Create tenant record
      const tenant = await tenantService.createTenant(
        businessId,
        fullName,
        phone,
        email,
        emergencyContact
      );

      // Find the room for the chosen bed
      const bedObj = availableBeds.find((b) => b.id === selectedBedId);
      if (!bedObj) throw new Error("Selected bed is not valid.");

      // 2. Create occupancy (this auto-updates bed status to 'occupied' via DB trigger)
      await tenantService.registerAndCheckIn({
        business_id: businessId,
        property_id: selectedPropertyId,
        tenant_id: tenant.id,
        room_id: bedObj.room_id,
        bed_id: selectedBedId,
        check_in_date: checkInDate,
        monthly_rent: Math.round(Number(monthlyRent) * 100),
        security_deposit: Math.round(Number(securityDeposit) * 100),
      });

      setFullName("");
      setPhone("");
      setEmail("");
      setEmergencyContact("");
      setModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register tenant.";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckOut = async (occupancyId: string, tenantName: string) => {
    if (!confirm(`Are you sure you want to check out ${tenantName}? The assigned bed will be set back to available.`)) {
      return;
    }

    try {
      await tenantService.checkOut(occupancyId);
      await loadData();
    } catch (err) {
      console.error("Error checking out tenant:", err);
    }
  };

  const filtered = tenants.filter(
    (t) =>
      t.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tenants
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Tenant registry, active occupancies, and check-in/out records in Supabase.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg(null);
            setModalOpen(true);
          }}
          disabled={properties.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Register & Check-In Tenant
        </button>
      </div>

      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="Search by name or phone number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full py-2 pl-9 pr-4 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
          <p className="text-xs text-zinc-500">Loading tenants from Supabase...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
            No tenants registered yet
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Check in your first tenant to allocate a bed and start tracking rent and deposits.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            disabled={properties.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Check-In First Tenant
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tenant Name</th>
                  <th className="py-3 px-4">Mobile</th>
                  <th className="py-3 px-4">Occupancy Status</th>
                  <th className="py-3 px-4">Monthly Rent</th>
                  <th className="py-3 px-4">Check-In Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filtered.map((tenant) => {
                  const hasActiveOcc = !!tenant.occupancy;
                  return (
                    <tr key={tenant.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                      <td className="py-3.5 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                        {tenant.full_name}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                        <span className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-zinc-400" />
                          {tenant.phone}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {hasActiveOcc ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <BedDouble className="w-3.5 h-3.5" />
                            Active Stay
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            Checked Out
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-zinc-900 dark:text-zinc-100">
                        {tenant.occupancy
                          ? `₹${Math.round(tenant.occupancy.monthly_rent / 100).toLocaleString("en-IN")}`
                          : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-500">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                          {tenant.occupancy?.check_in_date || "—"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {hasActiveOcc && (
                          <button
                            onClick={() => handleCheckOut(tenant.occupancy!.id, tenant.full_name)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-semibold hover:underline cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            Check Out
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Check-In Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Register & Check-In Tenant
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

            <form onSubmit={handleRegisterAndCheckIn} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Anand V"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Mobile Phone *
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="anand@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98888 77777 (Father)"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
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

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Available Bed *
                  </label>
                  {loadingBeds ? (
                    <div className="py-2 text-xs text-zinc-500">Checking available beds...</div>
                  ) : availableBeds.length === 0 ? (
                    <div className="py-2 text-xs text-red-500 font-medium">No available beds</div>
                  ) : (
                    <select
                      value={selectedBedId}
                      onChange={(e) => {
                        setSelectedBedId(e.target.value);
                        const b = availableBeds.find((x) => x.id === e.target.value);
                        if (b) {
                          setMonthlyRent(Math.round(b.monthly_rent / 100));
                          setSecurityDeposit(Math.round(b.monthly_rent / 100) * 2);
                        }
                      }}
                      required
                      className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {availableBeds.map((b) => (
                        <option key={b.id} value={b.id}>
                          Bed {b.bed_number} (₹{Math.round(b.monthly_rent / 100)}/mo)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Check-In Date *
                  </label>
                  <input
                    type="date"
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    required
                    className="w-full py-2 px-3 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Rent (₹/mo) *
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
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Security Deposit (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={securityDeposit}
                    onChange={(e) => setSecurityDeposit(Number(e.target.value))}
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
                  disabled={saving || !selectedBedId || !fullName.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Checking in...
                    </>
                  ) : (
                    "Complete Check-In"
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
