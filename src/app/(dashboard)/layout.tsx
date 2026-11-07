"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Building2,
  LayoutDashboard,
  Building,
  BedDouble,
  Users,
  CreditCard,
  Receipt,
  BarChart3,
  UserCheck,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Shield,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Properties", href: "/properties", icon: Building },
  { name: "Rooms & Beds", href: "/rooms", icon: BedDouble },
  { name: "Tenants", href: "/tenants", icon: Users },
  { name: "Rent & Dues", href: "/rent", icon: Receipt },
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Staff & Wardens", href: "/staff", icon: UserCheck },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [businessName, setBusinessName] = useState("BinRo PG Group");
  const [userRole, setUserRole] = useState<string>("Owner");
  const [userPhone, setUserPhone] = useState<string>("");

  useEffect(() => {
    async function loadSession() {
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          setUserPhone(data.user.phone || data.user.user_metadata?.phone || "");
        }

        const { businessService } = await import("@/services/business.service");
        const biz = await businessService.getActiveBusiness();
        if (biz) {
          setBusinessName(biz.name);
          if (data?.user && biz.owner_user_id === data.user.id) {
            setUserRole("Owner");
          }
        }
      } catch (err) {
        console.error("Error loading layout session:", err);
      }
    }
    loadSession();
  }, [supabase]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    sessionStorage.clear();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col lg:flex-row font-sans">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            <Building2 className="w-4 h-4" />
          </div>
          <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
            {businessName}
          </span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`${
          mobileMenuOpen ? "block" : "hidden"
        } lg:block w-full lg:w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0 lg:h-screen lg:sticky lg:top-0 z-30`}
      >
        {/* Brand & Business Selector */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 hidden lg:block">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                BinRo Business
              </div>
              <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[150px]">
                {businessName}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 text-xs text-zinc-600 dark:text-zinc-300">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Role: <strong className="text-zinc-900 dark:text-zinc-100">{userRole}</strong></span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"
                  }`}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Profile & Sign Out */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/40">
            <div className="truncate">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 truncate">
                {userPhone || "+91 Mobile User"}
              </p>
              <p className="text-[11px] text-zinc-400 truncate">{userRole} Access</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
