"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { businessService } from "@/services/business.service";
import { propertyService } from "@/services/property.service";
import { roomService } from "@/services/room.service";
import type {
  PropertyWithStats,
  FloorWithStats,
  RoomWithDetails,
  BedWithOccupant,
  FloorFormData,
  RoomFormData,
  BedFormData,
} from "@/types/app.types";
import type { BedStatus } from "@/types/database.types";
import { getInventoryPermissions, type InventoryPermissions } from "@/lib/permissions/room.permissions";
import { PropertyContextSelector } from "@/components/rooms/PropertyContextSelector";
import { FloorTabs } from "@/components/rooms/FloorTabs";
import { RoomCard } from "@/components/rooms/RoomCard";
import { RoomDetailsModal } from "@/components/rooms/RoomDetailsModal";
import { AddRoomModal } from "@/components/rooms/AddRoomModal";
import { EditRoomModal } from "@/components/rooms/EditRoomModal";
import { AddFloorModal } from "@/components/rooms/AddFloorModal";
import { ManageFloorsModal } from "@/components/rooms/ManageFloorsModal";
import { BedModal } from "@/components/rooms/BedModal";
import { BedStatusModal } from "@/components/rooms/BedStatusModal";
import {
  BedDouble,
  Plus,
  Search,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  DoorOpen,
  Users,
} from "lucide-react";

function RoomsContent() {
  const searchParams = useSearchParams();
  const queryPropId = searchParams.get("propertyId");

  const [loading, setLoading] = useState(true);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyWithStats[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  const [permissions, setPermissions] = useState<InventoryPermissions>({
    canCreateFloor: false,
    canEditFloor: false,
    canDeleteFloor: false,
    canCreateRoom: false,
    canEditRoom: false,
    canDeleteRoom: false,
    canCreateBed: false,
    canEditBed: false,
    canDeleteBed: false,
    isWarden: false,
    isAdminOrOwner: false,
  });

  // Floors & Rooms Data
  const [floors, setFloors] = useState<FloorWithStats[]>([]);
  const [rooms, setRooms] = useState<RoomWithDetails[]>([]);

  // Filter & Search State
  const [selectedFloorId, setSelectedFloorId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modals State
  const [addRoomModalOpen, setAddRoomModalOpen] = useState(false);
  const [editRoomModalOpen, setEditRoomModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithDetails | null>(null);
  const [roomDetailsModalOpen, setRoomDetailsModalOpen] = useState(false);

  const [addFloorModalOpen, setAddFloorModalOpen] = useState(false);
  const [manageFloorsModalOpen, setManageFloorsModalOpen] = useState(false);

  const [bedModalOpen, setBedModalOpen] = useState(false);
  const [bedModalMode, setBedModalMode] = useState<"add" | "edit">("add");
  const [selectedBed, setSelectedBed] = useState<BedWithOccupant | null>(null);

  const [bedStatusModalOpen, setBedStatusModalOpen] = useState(false);

  // Notification Toast
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  // 1. Initial Load: Business & Properties
  useEffect(() => {
    async function loadPropertiesList() {
      try {
        setPropertiesLoading(true);
        const biz = await businessService.getActiveBusiness();
        if (!biz) {
          setPropertiesLoading(false);
          setLoading(false);
          return;
        }

        // Check user role and permissions
        const context = await propertyService.getUserPropertyContext(biz.id);
        const invPerms = getInventoryPermissions(context.role);
        setPermissions(invPerms);

        const props = await propertyService.getProperties(biz.id);
        setProperties(props);

        if (props.length > 0) {
          // Determine initial property context
          let targetPropId = "";
          if (queryPropId && props.some((p) => p.id === queryPropId)) {
            targetPropId = queryPropId;
          } else if (typeof window !== "undefined") {
            const stored = sessionStorage.getItem("binro_active_property_id");
            if (stored && props.some((p) => p.id === stored)) {
              targetPropId = stored;
            } else {
              targetPropId = props[0].id;
            }
          } else {
            targetPropId = props[0].id;
          }

          setSelectedPropertyId(targetPropId);
          if (typeof window !== "undefined") {
            sessionStorage.setItem("binro_active_property_id", targetPropId);
          }
        }
      } catch (err) {
        console.error("Error loading properties:", err);
      } finally {
        setPropertiesLoading(false);
      }
    }

    loadPropertiesList();
  }, [queryPropId]);

  // 2. Load Floors & Rooms for Selected Property
  const loadInventory = useCallback(async () => {
    if (!selectedPropertyId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [floorsData, roomsData] = await Promise.all([
        roomService.getFloorsByProperty(selectedPropertyId),
        roomService.getRoomsWithDetails(
          selectedPropertyId,
          selectedFloorId === "all" ? undefined : selectedFloorId === "unassigned" ? null : selectedFloorId,
          searchQuery
        ),
      ]);

      setFloors(floorsData);
      setRooms(roomsData);

      // Keep selectedRoom updated if details modal is open
      if (selectedRoom) {
        const refreshed = roomsData.find((r) => r.id === selectedRoom.id);
        if (refreshed) setSelectedRoom(refreshed);
      }
    } catch (err) {
      console.error("Error loading inventory:", err);
      setNotification({
        type: "error",
        message: "Failed to load rooms and beds from Supabase.",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId, selectedFloorId, searchQuery, selectedRoom]);

  useEffect(() => {
    if (selectedPropertyId) {
      loadInventory();
    }
  }, [selectedPropertyId, selectedFloorId, searchQuery, loadInventory]);

  // Property Context Switcher
  const handleSelectProperty = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setSelectedFloorId("all");
    setSearchQuery("");
    if (typeof window !== "undefined") {
      sessionStorage.setItem("binro_active_property_id", propertyId);
    }
  };

  // Floor Handlers
  const handleCreateFloor = async (formData: FloorFormData) => {
    await roomService.createFloor(selectedPropertyId, formData);
    setNotification({
      type: "success",
      message: `Floor "${formData.name}" created successfully.`,
    });
    await loadInventory();
  };

  const handleUpdateFloor = async (
    floorId: string,
    name: string,
    floorNumber?: number | null
  ) => {
    await roomService.updateFloor(floorId, { name, floor_number: floorNumber });
    setNotification({
      type: "success",
      message: `Floor updated successfully.`,
    });
    await loadInventory();
  };

  const handleDeleteFloor = async (floorId: string) => {
    await roomService.deleteFloor(floorId);
    setNotification({
      type: "success",
      message: "Floor deleted successfully.",
    });
    if (selectedFloorId === floorId) {
      setSelectedFloorId("all");
    }
    await loadInventory();
  };

  // Room Handlers
  const handleCreateRoom = async (
    formData: RoomFormData,
    initialBeds?: { count: number; rentRupees: number }
  ) => {
    await roomService.createRoom(selectedPropertyId, formData, initialBeds);
    setNotification({
      type: "success",
      message: `Room ${formData.room_number} added with ${initialBeds?.count || 0} bed(s).`,
    });
    await loadInventory();
  };

  const handleUpdateRoom = async (
    roomId: string,
    formData: Partial<RoomFormData>
  ) => {
    await roomService.updateRoom(roomId, formData);
    setNotification({
      type: "success",
      message: "Room updated successfully.",
    });
    await loadInventory();
  };

  const handleDeleteRoom = async (room: RoomWithDetails) => {
    if (room.bedsOccupied > 0) {
      setNotification({
        type: "error",
        message: `Cannot delete Room ${room.room_number}: ${room.bedsOccupied} bed(s) are occupied. Check out occupants first.`,
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete Room ${room.room_number} and all its vacant beds?`)) {
      return;
    }

    try {
      await roomService.deleteRoom(room.id);
      setNotification({
        type: "success",
        message: `Room ${room.room_number} was deleted.`,
      });
      if (selectedRoom?.id === room.id) {
        setRoomDetailsModalOpen(false);
      }
      await loadInventory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete room.";
      setNotification({ type: "error", message: msg });
    }
  };

  // Bed Handlers
  const handleOpenAddBed = (room: RoomWithDetails) => {
    setSelectedRoom(room);
    setSelectedBed(null);
    setBedModalMode("add");
    setBedModalOpen(true);
  };

  const handleOpenEditBed = (bed: BedWithOccupant, room: RoomWithDetails) => {
    setSelectedRoom(room);
    setSelectedBed(bed);
    setBedModalMode("edit");
    setBedModalOpen(true);
  };

  const handleOpenBedStatus = (bed: BedWithOccupant, room: RoomWithDetails) => {
    setSelectedRoom(room);
    setSelectedBed(bed);
    setBedStatusModalOpen(true);
  };

  const handleBedFormSubmit = async (formData: BedFormData) => {
    if (!selectedRoom) return;

    if (bedModalMode === "add") {
      await roomService.addBedToRoom(selectedRoom.id, formData);
      setNotification({
        type: "success",
        message: `Bed ${formData.bed_number} added to Room ${selectedRoom.room_number}.`,
      });
    } else if (selectedBed) {
      await roomService.updateBed(selectedBed.id, formData);
      setNotification({
        type: "success",
        message: `Bed ${formData.bed_number} updated.`,
      });
    }

    await loadInventory();
  };

  const handleConfirmBedStatus = async (bedId: string, status: BedStatus) => {
    await roomService.updateBedStatus(bedId, status);
    setNotification({
      type: "success",
      message: `Bed status updated to "${status}".`,
    });
    await loadInventory();
  };

  const handleDeleteBed = async (bed: BedWithOccupant, room: RoomWithDetails) => {
    if (bed.status === "occupied") {
      setNotification({
        type: "error",
        message: `Cannot delete Bed ${bed.bed_number} because it is currently occupied. Check out the tenant first.`,
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete Bed ${bed.bed_number} from Room ${room.room_number}?`)) {
      return;
    }

    try {
      await roomService.deleteBed(bed.id);
      setNotification({
        type: "success",
        message: `Bed ${bed.bed_number} removed.`,
      });
      await loadInventory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete bed.";
      setNotification({ type: "error", message: msg });
    }
  };

  // Filtered Rooms calculation
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const matchesType = roomTypeFilter === "all" || r.room_type === roomTypeFilter;
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesType && matchesStatus;
    });
  }, [rooms, roomTypeFilter, statusFilter]);

  const unassignedRoomsCount = useMemo(() => {
    return rooms.filter((r) => !r.floor_id).length;
  }, [rooms]);

  // Overall Inventory Stats for Selected Property
  const inventoryStats = useMemo(() => {
    const totalRooms = rooms.length;
    const totalBeds = rooms.reduce((acc, r) => acc + r.bedsTotal, 0);
    const occupiedBeds = rooms.reduce((acc, r) => acc + r.bedsOccupied, 0);
    const availableBeds = rooms.reduce((acc, r) => acc + r.bedsAvailable, 0);
    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    return {
      totalRooms,
      totalBeds,
      occupiedBeds,
      availableBeds,
      occupancyRate,
    };
  }, [rooms]);

  return (
    <div className="space-y-6">
      {/* 1. Property Context Header */}
      <PropertyContextSelector
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onSelectProperty={handleSelectProperty}
        isWarden={permissions.isWarden}
      />

      {/* 2. Notification Toast Banner */}
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

      {/* 3. Property Inventory KPI Pulse */}
      {selectedPropertyId && !loading && rooms.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Rooms</span>
              <DoorOpen className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {inventoryStats.totalRooms}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Across {floors.length} floor{floors.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Total Beds</span>
              <BedDouble className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {inventoryStats.totalBeds}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Configured capacity
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Occupancy</span>
              <Users className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {inventoryStats.occupancyRate}%
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {inventoryStats.occupiedBeds} occupied
              </span>
            </div>
            <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(inventoryStats.occupancyRate, 100)}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Vacant Beds</span>
              <CheckCircle2 className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {inventoryStats.availableBeds}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ready for immediate allocation
            </p>
          </div>
        </div>
      )}

      {/* 4. Floors Navigation Tabs */}
      {selectedPropertyId && (
        <FloorTabs
          floors={floors}
          selectedFloorId={selectedFloorId}
          onSelectFloor={setSelectedFloorId}
          onOpenAddFloor={() => setAddFloorModalOpen(true)}
          onOpenManageFloors={() => setManageFloorsModalOpen(true)}
          canManageFloors={permissions.canCreateFloor}
          unassignedRoomsCount={unassignedRoomsCount}
        />
      )}

      {/* 4. Filter Strip & Search & Add Room CTA */}
      {selectedPropertyId && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              placeholder="Search room number (e.g. 101)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-2 pl-9 pr-8 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-2xs"
            />
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 p-0.5 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Type & Status Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative inline-flex items-center">
              <select
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
                className="py-2 px-3 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none cursor-pointer shadow-2xs pr-8"
              >
                <option value="all">All Room Types</option>
                <option value="single">Single Rooms</option>
                <option value="shared">Shared Rooms</option>
                <option value="dormitory">Dormitories</option>
              </select>
            </div>

            <div className="relative inline-flex items-center">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-2 px-3 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none cursor-pointer shadow-2xs pr-8"
              >
                <option value="all">All Room Statuses</option>
                <option value="active">Active Only</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {permissions.canCreateRoom && (
              <button
                onClick={() => setAddRoomModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-xs cursor-pointer ml-auto sm:ml-0"
              >
                <Plus className="w-4 h-4" />
                Add Room & Beds
              </button>
            )}
          </div>
        </div>
      )}

      {/* 5. Main Rooms Grid */}
      {loading || propertiesLoading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2.5">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-xs text-zinc-500">Querying live rooms and beds from Supabase...</p>
        </div>
      ) : properties.length === 0 ? (
        null /* handled by PropertyContextSelector */
      ) : rooms.length === 0 ? (
        /* Empty State */
        <div className="p-12 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-xs">
            <DoorOpen className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
              No rooms configured for this selection
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mt-1">
              {searchQuery
                ? `No room numbers match "${searchQuery}".`
                : selectedFloorId !== "all"
                ? "No rooms are assigned to this floor yet."
                : "Add your first room and allocate beds to begin checking in tenants."}
            </p>
          </div>

          {permissions.canCreateRoom && (
            <button
              onClick={() => setAddRoomModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add First Room
            </button>
          )}
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-500">
          No rooms match the applied filters ({roomTypeFilter !== "all" ? `Type: ${roomTypeFilter}` : ""}{" "}
          {statusFilter !== "all" ? `Status: ${statusFilter}` : ""}).
          <button
            onClick={() => {
              setRoomTypeFilter("all");
              setStatusFilter("all");
              setSearchQuery("");
            }}
            className="block mx-auto mt-2 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onViewDetails={(r) => {
                setSelectedRoom(r);
                setRoomDetailsModalOpen(true);
              }}
              onEditRoom={(r) => {
                setSelectedRoom(r);
                setEditRoomModalOpen(true);
              }}
              onDeleteRoom={handleDeleteRoom}
              onAddBed={handleOpenAddBed}
              onSelectBed={handleOpenBedStatus}
              canManage={permissions.canCreateRoom}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <AddRoomModal
        isOpen={addRoomModalOpen}
        onClose={() => setAddRoomModalOpen(false)}
        floors={floors}
        defaultFloorId={selectedFloorId}
        onSubmit={handleCreateRoom}
      />

      <EditRoomModal
        isOpen={editRoomModalOpen}
        onClose={() => setEditRoomModalOpen(false)}
        room={selectedRoom}
        floors={floors}
        onSubmit={handleUpdateRoom}
      />

      <RoomDetailsModal
        isOpen={roomDetailsModalOpen}
        onClose={() => setRoomDetailsModalOpen(false)}
        room={selectedRoom}
        onEditRoom={(r) => {
          setRoomDetailsModalOpen(false);
          setSelectedRoom(r);
          setEditRoomModalOpen(true);
        }}
        onAddBed={handleOpenAddBed}
        onEditBed={handleOpenEditBed}
        onChangeBedStatus={handleOpenBedStatus}
        onDeleteBed={handleDeleteBed}
        canManage={permissions.canCreateBed}
      />

      <AddFloorModal
        isOpen={addFloorModalOpen}
        onClose={() => setAddFloorModalOpen(false)}
        onSubmit={handleCreateFloor}
        suggestedFloorNumber={floors.length}
      />

      <ManageFloorsModal
        isOpen={manageFloorsModalOpen}
        onClose={() => setManageFloorsModalOpen(false)}
        floors={floors}
        onUpdateFloor={handleUpdateFloor}
        onDeleteFloor={handleDeleteFloor}
        onOpenAddFloor={() => {
          setManageFloorsModalOpen(false);
          setAddFloorModalOpen(true);
        }}
      />

      <BedModal
        isOpen={bedModalOpen}
        onClose={() => setBedModalOpen(false)}
        room={selectedRoom}
        bedToEdit={selectedBed}
        mode={bedModalMode}
        onSubmit={handleBedFormSubmit}
      />

      <BedStatusModal
        isOpen={bedStatusModalOpen}
        onClose={() => setBedStatusModalOpen(false)}
        bed={selectedBed}
        room={selectedRoom}
        onConfirm={handleConfirmBedStatus}
      />
    </div>
  );
}

export default function RoomsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-xs text-zinc-500">Loading room & bed inventory...</p>
        </div>
      }
    >
      <RoomsContent />
    </Suspense>
  );
}

