"use client";

import React, { useState, useEffect } from "react";
import { businessService } from "@/services/business.service";
import { createClient } from "@/lib/supabase/client";
import {
  Building2,
  Shield,
  Save,
  User,
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building,
} from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Form Fields
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    async function loadSettings() {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();

        if (authData?.user) {
          setUserId(authData.user.id);
          setOwnerPhone(authData.user.phone || authData.user.user_metadata?.phone || "Verified User");

          // Fetch profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", authData.user.id)
            .maybeSingle();

          if (profile) {
            setFullName(profile.full_name || authData.user.user_metadata?.full_name || "");
            setOwnerEmail(profile.email || authData.user.email || "");
          }
        }

        const biz = await businessService.getActiveBusiness();
        if (biz) {
          setBusinessId(biz.id);
          setBusinessName(biz.name);
        }
      } catch (err) {
        console.error("Error loading settings:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !userId) return;

    setSaving(true);
    setStatusMsg(null);

    try {
      const supabase = createClient();

      // 1. Update business name
      if (businessName.trim()) {
        await businessService.updateBusiness(businessId, businessName);
      }

      // 2. Update profile
      await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          email: ownerEmail.trim() || null,
        })
        .eq("id", userId);

      setStatusMsg({ type: "success", text: "Settings and business profile saved successfully!" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update business settings.";
      setStatusMsg({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <p className="text-xs">Loading business profile from Supabase...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Settings
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Manage business profile, organization identity, and account credentials.
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
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

      <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
              <Building className="w-4 h-4 text-blue-600" />
              Business Organization
            </h2>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Business / PG Organization Name *
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                className="w-full py-2.5 px-3 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <Building2 className="w-4 h-4 text-zinc-400 absolute right-3 pointer-events-none" />
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Appears on all rent receipts, tenant allocations, and the management dashboard.
            </p>
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-purple-600" />
              Owner Profile & Credentials
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full py-2.5 px-3 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Primary Verified Phone
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={ownerPhone}
                    disabled
                    className="w-full py-2.5 px-3 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                  />
                  <Shield className="w-4 h-4 text-emerald-500 absolute right-3 pointer-events-none" />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Verified phone identity via Supabase Authentication.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Notification Email (Optional)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="e.g. owner@pgbusiness.in"
                    className="w-full py-2.5 px-3 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <Mail className="w-4 h-4 text-zinc-400 absolute right-3 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
