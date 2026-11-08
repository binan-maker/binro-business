"use client";

import React from "react";
import { Search, X, ArrowUpDown } from "lucide-react";

interface TenantFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: "all" | "active" | "completed";
  onStatusFilterChange: (status: "all" | "active" | "completed") => void;
  sortBy: "name" | "created_at" | "check_in_date";
  onSortByChange: (sortBy: "name" | "created_at" | "check_in_date") => void;
  sortOrder: "asc" | "desc";
  onSortOrderChange: (order: "asc" | "desc") => void;
  totalCount: number;
  filteredCount: number;
}

export function TenantFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  totalCount,
  filteredCount,
}: TenantFiltersProps) {
  const isFiltered = searchQuery !== "" || statusFilter !== "all" || sortBy !== "created_at";

  const handleClear = () => {
    onSearchChange("");
    onStatusFilterChange("all");
    onSortByChange("created_at");
    onSortOrderChange("desc");
  };

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by name, phone, email, room, bed..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full py-2 pl-9 pr-8 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-zinc-800 transition-colors"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 rounded cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs">
            <button
              onClick={() => onStatusFilterChange("all")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                statusFilter === "all"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => onStatusFilterChange("active")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                statusFilter === "active"
                  ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              Active Stay
            </button>
            <button
              onClick={() => onStatusFilterChange("completed")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                statusFilter === "completed"
                  ? "bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-400 shadow-2xs font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              Checked Out
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-600 dark:text-zinc-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] text-zinc-400 hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) =>
                onSortByChange(e.target.value as "name" | "created_at" | "check_in_date")
              }
              className="bg-transparent font-medium focus:outline-none cursor-pointer pr-1 text-zinc-800 dark:text-zinc-200"
            >
              <option value="created_at" className="bg-white dark:bg-zinc-900 text-zinc-900">
                Registration Date
              </option>
              <option value="check_in_date" className="bg-white dark:bg-zinc-900 text-zinc-900">
                Check-In Date
              </option>
              <option value="name" className="bg-white dark:bg-zinc-900 text-zinc-900">
                Tenant Name
              </option>
            </select>

            <button
              onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase cursor-pointer"
              title={`Switch to ${sortOrder === "asc" ? "descending" : "ascending"}`}
            >
              {sortOrder}
            </button>
          </div>

          {/* Clear Filters Button */}
          {isFiltered && (
            <button
              onClick={handleClear}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Result Count Indicator */}
      <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
        <span>
          Showing <strong className="text-zinc-700 dark:text-zinc-300">{filteredCount}</strong> of{" "}
          <strong className="text-zinc-700 dark:text-zinc-300">{totalCount}</strong> tenants
        </span>
        {statusFilter !== "all" && (
          <span className="capitalize text-blue-600 dark:text-blue-400 font-medium">
            Filtering by: {statusFilter} status
          </span>
        )}
      </div>
    </div>
  );
}
