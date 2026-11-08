"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { businessService } from "@/services/business.service";
import { propertyService } from "@/services/property.service";
import { tenantService } from "@/services/tenant.service";
import type {
  PropertyWithStats,
  TenantWithFullDetails,
} from "@/types/app.types";
import type { TenantPermissions } from "@/lib/permissions/tenant.permissions";

// Tenant Management Components
import { PropertyContextSelector } from "@/components/rooms/PropertyContextSelector";
import { TenantStatsPulse } from "@/components/tenants/TenantStatsPulse";
import { TenantFilters } from "@/components/tenants/TenantFilters";
import { TenantTable } from "@/components/tenants/TenantTable";
import { RegisterTenantModal } from "@/components/tenants/RegisterTenantModal";
import { TenantDetailsModal } from "@/components/tenants/TenantDetailsModal";
import { EditTenantModal } from "@/components/tenants/EditTenantModal";
import { CheckOutModal } from "@/components/tenants/CheckOutModal";
import { TransferBedModal } from "@/components/tenants/TransferBedModal";

import {
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";

function TenantsContent() {
  const searchParams = useSearchParams();
  const queryPropId = searchParams.get("propertyId");

  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string>("BinRo Business");

  // User Permissions & Property Context
  const [permissions, setPermissions] = useState<TenantPermissions>({
    canRegisterTenant: true,
    canEditTenantProfile: true,
    canCheckOutTenant: true,
    canTransferBed: true,
    canDeleteTenant: false,
    isWarden: false,
    isAdminOrOwner: true,
    accessiblePropertyIds: null,
  });

  const [properties, setProperties] = useState<PropertyWithStats[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  // Tenants Data & Filters
  const [tenants, setTenants] = useState<TenantWithFullDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [sortBy, setSortBy] = useState<"name" | "created_at" | "check_in_date">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Modals Orchestration
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantWithFullDetails | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  // Notification Toast
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Auto-dismiss notification after 5s
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  // 1. Initial Load: Business Context & Properties
  useEffect(() => {
    async function initContext() {
      try {
        setLoading(true);
        const biz = await businessService.getActiveBusiness();
        if (!biz) {
          setLoading(false);
          return;
        }

        setBusinessId(biz.id);
        setBusinessName(biz.name);

        // Fetch user tenant permissions
        const userContext = await tenantService.getUserTenantContext(biz.id);
        setPermissions(userContext.permissions);

        // Fetch properties with real-time stats
        const propsData = await propertyService.getProperties(biz.id);
        setProperties(propsData);

        if (propsData.length > 0) {
          let targetPropId = "";
          if (queryPropId && propsData.some((p) => p.id === queryPropId)) {
            targetPropId = queryPropId;
          } else if (typeof window !== "undefined") {
            const stored = sessionStorage.getItem("binro_active_property_id");
            if (stored && propsData.some((p) => p.id === stored)) {
              targetPropId = stored;
            } else {
              targetPropId = propsData[0].id;
            }
          } else {
            targetPropId = propsData[0].id;
          }

          setSelectedPropertyId(targetPropId);
          if (typeof window !== "undefined") {
            sessionStorage.setItem("binro_active_property_id", targetPropId);
          }
        }
      } catch (err) {
        console.error("Error initializing tenants context:", err);
        setNotification({
          type: "error",
          message: "Failed to load business session. Please refresh.",
        });
      } finally {
        setLoading(false);
      }
    }

    initContext();
  }, [queryPropId]);

  // 2. Load Tenants when businessId, selectedPropertyId, statusFilter, sortBy, sortOrder changes
  const loadTenants = useCallback(async () => {
    if (!businessId) return;

    try {
      const data = await tenantService.getTenants(businessId, {
        propertyId: selectedPropertyId || undefined,
        status: statusFilter,
        sortBy,
        sortOrder,
      });

      setTenants(data);

      // Keep selectedTenant in sync if modal is open (using functional updater to decouple callback identity)
      setSelectedTenant((prev) => {
        if (!prev) return null;
        return data.find((t) => t.id === prev.id) || prev;
      });
    } catch (err) {
      console.error("Error loading tenants list:", err);
      setNotification({
        type: "error",
        message: "Failed to query tenant records from database.",
      });
    }
  }, [businessId, selectedPropertyId, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (businessId) {
      loadTenants();
    }
  }, [businessId, selectedPropertyId, statusFilter, sortBy, sortOrder, loadTenants]);

  // Property Selection Handler
  const handleSelectProperty = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("binro_active_property_id", propertyId);
    }
    const prop = properties.find((p) => p.id === propertyId);
    setNotification({
      type: "success",
      message: `Property context switched to "${prop?.name || "Selected Property"}".`,
    });
  };

  // Client-side search filtering over loaded tenants
  const filteredTenants = useMemo(() => {
    if (!searchQuery.trim()) return tenants;
    const q = searchQuery.trim().toLowerCase();
    return tenants.filter((t) => {
      const nameMatch = t.full_name.toLowerCase().includes(q);
      const phoneMatch = t.phone.toLowerCase().includes(q);
      const emailMatch = (t.email || "").toLowerCase().includes(q);
      const roomMatch = (t.current_occupancy?.room_number || "").toLowerCase().includes(q);
      const bedMatch = (t.current_occupancy?.bed_number || "").toLowerCase().includes(q);
      return nameMatch || phoneMatch || emailMatch || roomMatch || bedMatch;
    });
  }, [tenants, searchQuery]);

  // Active property object for fast stats pulse
  const activeProperty = properties.find((p) => p.id === selectedPropertyId);

  // Modal Triggers
  const handleOpenDetails = (tenant: TenantWithFullDetails) => {
    setSelectedTenant(tenant);
    setDetailsModalOpen(true);
  };

  const handleOpenEdit = (tenant: TenantWithFullDetails) => {
    setSelectedTenant(tenant);
    setEditModalOpen(true);
  };

  const handleOpenCheckOut = (tenant: TenantWithFullDetails) => {
    setSelectedTenant(tenant);
    setCheckOutModalOpen(true);
  };

  const handleOpenTransfer = (tenant: TenantWithFullDetails) => {
    setSelectedTenant(tenant);
    setTransferModalOpen(true);
  };

  // Success Handlers
  const handleRegistrationSuccess = () => {
    setNotification({
      type: "success",
      message: "Tenant successfully registered and checked in to the allocated bed!",
    });
    loadTenants();
  };

  const handleEditSuccess = () => {
    setNotification({
      type: "success",
      message: "Tenant profile details updated successfully.",
    });
    loadTenants();
  };

  const handleCheckOutSuccess = () => {
    setNotification({
      type: "success",
      message: "Tenant checked out successfully. Bed released to available status.",
    });
    loadTenants();
  };

  const handleTransferSuccess = () => {
    setNotification({
      type: "success",
      message: "Tenant bed transfer completed successfully.",
    });
    loadTenants();
  };

  // Unassigned Warden Guard View
  if (
    !loading &&
    permissions.isWarden &&
    (!permissions.accessiblePropertyIds || permissions.accessiblePropertyIds.length === 0)
  ) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tenants Directory
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Warden Staff Account — Pending Assignment
          </p>
        </div>

        <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            No Assigned Properties
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 max-w-md mx-auto leading-relaxed">
            Your account is authorized as a property warden, but you have not yet been assigned to a specific hostel or PG property. Tenant directory access and check-in workflows are restricted until the business owner delegates a property to you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Tenants Directory
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              Stage 010
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage residents, KYC records, active bed allocations, and historical occupancies in {businessName}.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {permissions.canRegisterTenant && (
            <button
              onClick={() => setRegisterModalOpen(true)}
              disabled={properties.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Register & Check In
            </button>
          )}
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border shadow-xs animate-in fade-in duration-200 ${
            notification.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Property Context Selector */}
      <PropertyContextSelector
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onSelectProperty={handleSelectProperty}
        isWarden={permissions.isWarden}
      />

      {/* Tenant Fast Stats Pulse */}
      <TenantStatsPulse
        tenants={tenants}
        totalBeds={activeProperty?.bedsTotal}
        occupiedBeds={activeProperty?.bedsOccupied}
      />

      {/* Search, Filter & Sort Controls */}
      <TenantFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        totalCount={tenants.length}
        filteredCount={filteredTenants.length}
      />

      {/* Tenant Directory Table / Cards */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-400">
          <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
          <p className="text-xs">Querying tenant directory from database...</p>
        </div>
      ) : (
        <TenantTable
          tenants={filteredTenants}
          permissions={permissions}
          onViewDetails={handleOpenDetails}
          onEditProfile={handleOpenEdit}
          onCheckOut={handleOpenCheckOut}
          onTransferBed={handleOpenTransfer}
          onRegisterClick={() => setRegisterModalOpen(true)}
          hasFilters={searchQuery !== "" || statusFilter !== "all" || sortBy !== "created_at"}
          onResetFilters={() => {
            setSearchQuery("");
            setStatusFilter("all");
            setSortBy("created_at");
            setSortOrder("desc");
          }}
        />
      )}

      {/* Modals */}
      {businessId && (
        <RegisterTenantModal
          isOpen={registerModalOpen}
          onClose={() => setRegisterModalOpen(false)}
          businessId={businessId}
          properties={properties}
          initialPropertyId={selectedPropertyId}
          onSuccess={handleRegistrationSuccess}
        />
      )}

      <TenantDetailsModal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        tenant={selectedTenant}
        permissions={permissions}
        onEditProfile={handleOpenEdit}
        onCheckOut={handleOpenCheckOut}
        onTransferBed={handleOpenTransfer}
      />

      <EditTenantModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        tenant={selectedTenant}
        onSuccess={handleEditSuccess}
      />

      <CheckOutModal
        isOpen={checkOutModalOpen}
        onClose={() => setCheckOutModalOpen(false)}
        tenant={selectedTenant}
        onSuccess={handleCheckOutSuccess}
      />

      <TransferBedModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        tenant={selectedTenant}
        onSuccess={handleTransferSuccess}
      />
    </div>
  );
}

export default function TenantsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-xs">Loading Tenants Directory...</p>
        </div>
      }
    >
      <TenantsContent />
    </Suspense>
  );
}
