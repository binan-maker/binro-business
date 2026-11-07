"use client";

import React from "react";
import { Search, X, ArrowUpDown } from "lucide-react";
import type { PropertyStatus } from "@/types/database.types";
import type { PropertyFilterOptions } from "@/types/app.types";

interface PropertyFiltersProps {
  filters: PropertyFilterOptions;
  onChange: (updated: PropertyFilterOptions) => void;
  statusCounts: {
    all: number;
    active: number;
    inactive: number;
    archived: number;
  };
}

export function PropertyFilters({
  filters,
  onChange,
  statusCounts,
}: PropertyFiltersProps) {
  const currentStatus = filters.status || "all";
  const currentSearch = filters.search || "";
  const currentSort = filters.sortBy || "created_at";
  const currentOrder = filters.sortOrder || "desc";

  const handleStatusChange = (status: PropertyStatus | "all") => {
    onChange({ ...filters, status });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, search: e.target.value });
  };

  const handleClearSearch = () => {
    onChange({ ...filters, search: "" });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "name_asc") {
      onChange({ ...filters, sortBy: "name", sortOrder: "asc" });
    } else if (val === "name_desc") {
      onChange({ ...filters, sortBy: "name", sortOrder: "desc" });
    } else if (val === "created_at_desc") {
      onChange({ ...filters, sortBy: "created_at", sortOrder: "desc" });
    } else if (val === "created_at_asc") {
      onChange({ ...filters, sortBy: "created_at", sortOrder: "asc" });
    } else if (val === "occupancy_desc") {
      onChange({ ...filters, sortBy: "occupancy", sortOrder: "desc" });
    } else if (val === "rooms_desc") {
      onChange({ ...filters, sortBy: "rooms", sortOrder: "desc" });
    }
  };

  const hasActiveFilters =
    Boolean(currentSearch.trim()) ||
    currentStatus !== "all" ||
    currentSort !== "created_at" ||
    currentOrder !== "desc";

  const handleResetFilters = () => {
    onChange({
      search: "",
      status: "all",
      sortBy: "created_at",
      sortOrder: "desc",
    });
  };

  const sortValue = `${currentSort}_${currentOrder}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search properties by name or address..."
            value={currentSearch}
            onChange={handleSearchChange}
            className="w-full py-2 pl-9 pr-8 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-2xs"
          />
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
          {currentSearch && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 rounded-md"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="relative inline-flex items-center">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            <select
              value={sortValue}
              onChange={handleSortChange}
              className="py-2 pl-8 pr-7 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none cursor-pointer shadow-2xs"
            >
              <option value="created_at_desc">Newest First</option>
              <option value="created_at_asc">Oldest First</option>
              <option value="name_asc">Name (A to Z)</option>
              <option value="name_desc">Name (Z to A)</option>
              <option value="occupancy_desc">Highest Occupancy</option>
              <option value="rooms_desc">Most Rooms</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="px-2.5 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => handleStatusChange("all")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
            currentStatus === "all"
              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-xs"
              : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          }`}
        >
          <span>All Hostels</span>
          <span
            className={`px-1.5 py-0.2 rounded-md text-[10px] ${
              currentStatus === "all"
                ? "bg-white/20 text-white dark:text-zinc-900 dark:bg-zinc-900/20"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            }`}
          >
            {statusCounts.all}
          </span>
        </button>

        <button
          onClick={() => handleStatusChange("active")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
            currentStatus === "active"
              ? "bg-emerald-600 text-white font-semibold shadow-xs"
              : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Active</span>
          <span
            className={`px-1.5 py-0.2 rounded-md text-[10px] ${
              currentStatus === "active"
                ? "bg-white/20 text-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            }`}
          >
            {statusCounts.active}
          </span>
        </button>

        <button
          onClick={() => handleStatusChange("inactive")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
            currentStatus === "inactive"
              ? "bg-amber-600 text-white font-semibold shadow-xs"
              : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>Inactive</span>
          <span
            className={`px-1.5 py-0.2 rounded-md text-[10px] ${
              currentStatus === "inactive"
                ? "bg-white/20 text-white"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            }`}
          >
            {statusCounts.inactive}
          </span>
        </button>

        {statusCounts.archived > 0 && (
          <button
            onClick={() => handleStatusChange("archived")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer shrink-0 ${
              currentStatus === "archived"
                ? "bg-zinc-700 text-white font-semibold shadow-xs"
                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            <span>Archived</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                currentStatus === "archived"
                  ? "bg-white/20 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
              }`}
            >
              {statusCounts.archived}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
