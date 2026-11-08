"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { businessService } from "@/services/business.service";
import { propertyService } from "@/services/property.service";
import type {
  PropertyWithStats,
  PropertyFormData,
  PropertyFilterOptions,
} from "@/types/app.types";
import type { PropertyStatus } from "@/types/database.types";
import type { PropertyPermissions } from "@/lib/permissions/property.permissions";
import { PropertyHeader } from "@/components/properties/PropertyHeader";
import { PropertyFilters } from "@/components/properties/PropertyFilters";
import { PropertyCard } from "@/components/properties/PropertyCard";
import { PropertyListView } from "@/components/properties/PropertyListView";
import { PropertyFormModal } from "@/components/properties/PropertyFormModal";
import { PropertyDetailsModal } from "@/components/properties/PropertyDetailsModal";
import { PropertyStatusModal } from "@/components/properties/PropertyStatusModal";
import {
  Building,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  SearchX,
} from "lucide-react";

export default function PropertiesPage() {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string>("Your Business");
  const [permissions, setPermissions] = useState<PropertyPermissions>({
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canChangeStatus: false,
    isWarden: false,
    isAdminOrOwner: false,
    accessiblePropertyIds: [],
  });

  // Data
  const [properties, setProperties] = useState<PropertyWithStats[]>([]);
  const [activeContextId, setActiveContextId] = useState<string | null>(null);

  // View & Filter State
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filters, setFilters] = useState<PropertyFilterOptions>({
    search: "",
    status: "all",
    sortBy: "created_at",
    sortOrder: "desc",
  });

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithStats | null>(null);

  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<"activate" | "deactivate" | "archive" | "delete" | null>(null);

  // Notification Banner
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

  // Initial Context Restore
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedContext = sessionStorage.getItem("binro_active_property_id");
      if (storedContext) {
        setActiveContextId(storedContext);
      }
    }
  }, []);

  const loadProperties = useCallback(async () => {
    try {
      setLoading(true);
      const biz = await businessService.getActiveBusiness();
      if (!biz) {
        setLoading(false);
        return;
      }
      setBusinessId(biz.id);
      setBusinessName(biz.name);

      // Check role & permissions
      const context = await propertyService.getUserPropertyContext(biz.id);
      setPermissions(context.permissions);

      // Fetch enriched properties list
      const data = await propertyService.getProperties(biz.id, filters);
      setProperties(data);

      // If activeContextId is not set yet, default to first active property
      if (typeof window !== "undefined" && !sessionStorage.getItem("binro_active_property_id") && data.length > 0) {
        setActiveContextId(data[0].id);
        sessionStorage.setItem("binro_active_property_id", data[0].id);
      }
    } catch (err) {
      console.error("Error loading properties:", err);
      setNotification({
        type: "error",
        message: "Failed to load properties from Supabase. Please refresh.",
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  // Property Selection / Context Handler
  const handleSelectContext = (propertyId: string) => {
    setActiveContextId(propertyId);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("binro_active_property_id", propertyId);
    }
    const prop = properties.find((p) => p.id === propertyId);
    setNotification({
      type: "success",
      message: `Active property context set to "${prop?.name || "Selected Property"}".`,
    });
  };

  // Create Property
  const handleOpenCreateModal = () => {
    setSelectedProperty(null);
    setFormMode("create");
    setFormModalOpen(true);
  };

  // Edit Property
  const handleOpenEditModal = (property: PropertyWithStats) => {
    setSelectedProperty(property);
    setFormMode("edit");
    setFormModalOpen(true);
  };

  // View Details Modal
  const handleOpenDetailsModal = (property: PropertyWithStats) => {
    setSelectedProperty(property);
    setDetailsModalOpen(true);
  };

  // Status Change Prompt
  const handleToggleStatus = (property: PropertyWithStats, newStatus: PropertyStatus) => {
    setSelectedProperty(property);
    setStatusAction(newStatus === "active" ? "activate" : "deactivate");
    setStatusModalOpen(true);
  };

  const handleArchivePrompt = (property: PropertyWithStats) => {
    setSelectedProperty(property);
    setStatusAction("archive");
    setStatusModalOpen(true);
  };

  const handleDeletePrompt = (property: PropertyWithStats) => {
    setSelectedProperty(property);
    setStatusAction("delete");
    setStatusModalOpen(true);
  };

  // Form Submit Handler
  const handleFormSubmit = async (formData: PropertyFormData) => {
    if (!businessId) {
      throw new Error("Business context not resolved. Please reload.");
    }

    if (formMode === "create") {
      await propertyService.createProperty(businessId, formData);
      setNotification({
        type: "success",
        message: `Property "${formData.name}" was successfully registered!`,
      });
    } else if (selectedProperty) {
      await propertyService.updateProperty(selectedProperty.id, formData);
      setNotification({
        type: "success",
        message: `Property details for "${formData.name}" updated successfully.`,
      });
    }

    await loadProperties();
  };

  // Status Modal Confirm Handler
  const handleStatusConfirm = async () => {
    if (!selectedProperty || !statusAction) return;

    if (statusAction === "activate") {
      await propertyService.updatePropertyStatus(selectedProperty.id, "active");
      setNotification({
        type: "success",
        message: `Property "${selectedProperty.name}" is now active.`,
      });
    } else if (statusAction === "deactivate") {
      await propertyService.updatePropertyStatus(selectedProperty.id, "inactive");
      setNotification({
        type: "success",
        message: `Property "${selectedProperty.name}" has been deactivated.`,
      });
    } else if (statusAction === "archive") {
      await propertyService.archiveProperty(selectedProperty.id);
      setNotification({
        type: "success",
        message: `Property "${selectedProperty.name}" was archived. Historical financial records remain intact.`,
      });
    } else if (statusAction === "delete") {
      await propertyService.deleteProperty(selectedProperty.id);
      setNotification({
        type: "success",
        message: `Property "${selectedProperty.name}" was deleted.`,
      });
    }

    await loadProperties();
  };

  // Status Counts for Tabs
  const statusCounts = useMemo(() => {
    return {
      all: properties.length,
      active: properties.filter((p) => p.status === "active").length,
      inactive: properties.filter((p) => p.status === "inactive").length,
      archived: properties.filter((p) => p.status === "archived").length,
    };
  }, [properties]);

  return (
    <div className="space-y-6">
      {/* Header with KPI cards & Actions */}
      <PropertyHeader
        properties={properties}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenCreateModal={handleOpenCreateModal}
        canCreate={permissions.canCreate}
        isWarden={permissions.isWarden}
        businessName={businessName}
      />

      {/* Notification Toast Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 border transition-all animate-in fade-in duration-200 ${
            notification.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Warden Notice if restricted */}
      {permissions.isWarden && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold">Warden Role Enforced</p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5">
              You have warden privileges for this organization. You can view assigned property
              details, rooms, and tenant records. Property creation, editing, and status management
              are reserved for business owners and administrators.
            </p>
          </div>
        </div>
      )}

      {/* Search, Filter & Sort Controls */}
      {properties.length > 0 && (
        <PropertyFilters
          filters={filters}
          onChange={setFilters}
          statusCounts={statusCounts}
        />
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2.5">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-xs text-zinc-500">Querying live properties from Supabase...</p>
        </div>
      ) : properties.length === 0 ? (
        /* Empty State */
        filters.search || filters.status !== "all" ? (
          <div className="p-10 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
              <SearchX className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
              No matching properties found
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              We couldn&apos;t find any properties matching your current filter criteria.
            </p>
            <button
              onClick={() =>
                setFilters({
                  search: "",
                  status: "all",
                  sortBy: "created_at",
                  sortOrder: "desc",
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 cursor-pointer"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="p-12 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
              <Building className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-lg">
                No Properties Registered Yet
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mt-1">
                Start by adding your first PG or hostel location (e.g. &ldquo;Sai Balaji Boys PG&rdquo;).
                Once created, you can configure floors, rooms, beds, and assign wardens.
              </p>
            </div>

            {permissions.canCreate ? (
              <button
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Your First Property
              </button>
            ) : (
              <p className="text-xs text-zinc-400 italic">
                Contact your business administrator to configure properties.
              </p>
            )}
          </div>
        )
      ) : viewMode === "grid" ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((prop) => (
            <PropertyCard
              key={prop.id}
              property={prop}
              isActiveContext={activeContextId === prop.id}
              onSelectContext={handleSelectContext}
              onViewDetails={handleOpenDetailsModal}
              onEdit={handleOpenEditModal}
              onToggleStatus={handleToggleStatus}
              onArchive={handleArchivePrompt}
              onDelete={handleDeletePrompt}
              canEdit={permissions.canEdit}
              canChangeStatus={permissions.canChangeStatus}
              canDelete={permissions.canDelete}
            />
          ))}
        </div>
      ) : (
        /* List View */
        <PropertyListView
          properties={properties}
          activeContextId={activeContextId}
          onSelectContext={handleSelectContext}
          onViewDetails={handleOpenDetailsModal}
          onEdit={handleOpenEditModal}
          onToggleStatus={handleToggleStatus}
          canEdit={permissions.canEdit}
          canChangeStatus={permissions.canChangeStatus}
        />
      )}

      {/* Modals */}
      <PropertyFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        initialData={selectedProperty}
        mode={formMode}
      />

      <PropertyDetailsModal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        property={selectedProperty}
        onEdit={handleOpenEditModal}
        onSelectContext={handleSelectContext}
        isActiveContext={selectedProperty?.id === activeContextId}
        canEdit={permissions.canEdit}
      />

      <PropertyStatusModal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        property={selectedProperty}
        targetAction={statusAction}
        onConfirm={handleStatusConfirm}
      />
    </div>
  );
}
