"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Building2, User, Mail, ArrowRight, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        // If not in demo mode and no active auth user, redirect to login
        const stored = sessionStorage.getItem("binro_auth_phone");
        if (!stored) {
          router.replace("/login");
        }
      }
    }
    checkAuth();
  }, [supabase, router]);

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !businessName.trim()) {
      setErrorMsg("Please enter both your full name and business name.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        // Fallback for live preview/demo
        const demoBusiness = {
          id: "demo-biz-1",
          name: businessName.trim(),
          owner_name: fullName.trim(),
        };
        sessionStorage.setItem("binro_active_business", JSON.stringify(demoBusiness));
        router.push("/dashboard");
        return;
      }

      // 1. Ensure user profile exists and is updated
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          full_name: fullName.trim(),
          email: email.trim() || null,
          phone: user.phone || null,
        });

      if (profileError) {
        console.warn("Profile upsert notice:", profileError.message);
      }

      // 2. Insert the business without .select()
      // In PostgreSQL RLS, .insert().select() evaluates the SELECT policy (is_business_member)
      // BEFORE the AFTER INSERT trigger (on_business_created) commits the membership row.
      const { error: businessError } = await supabase
        .from("businesses")
        .insert({
          name: businessName.trim(),
          owner_user_id: user.id,
        });

      if (businessError) {
        setErrorMsg(businessError.message);
        setLoading(false);
        return;
      }

      // 3. Now that the trigger has created the business_members row, fetch the active business
      const { data: businessData } = await supabase
        .from("businesses")
        .select("id, name, owner_user_id, created_at, updated_at")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (businessData) {
        sessionStorage.setItem("binro_active_business", JSON.stringify(businessData));
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create business.";
      setErrorMsg(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 mb-4">
          <Building2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Set up your business
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Welcome to BinRo! Create your business profile to get started.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-zinc-900 py-8 px-6 shadow-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl sm:px-10">
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleCreateBusiness} className="space-y-5">
            <div>
              <label
                htmlFor="fullName"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Owner Full Name
              </label>
              <div className="relative flex items-center">
                <input
                  id="fullName"
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                  className="w-full py-2.5 px-3 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  required
                />
                <User className="w-4 h-4 text-zinc-400 absolute right-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label
                htmlFor="businessName"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Business / PG Organization Name
              </label>
              <div className="relative flex items-center">
                <input
                  id="businessName"
                  type="text"
                  placeholder="e.g. Balaji Living & Hostels"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={loading}
                  className="w-full py-2.5 px-3 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  required
                />
                <Building2 className="w-4 h-4 text-zinc-400 absolute right-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                You can add multiple individual properties inside this business account.
              </p>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Email Address <span className="text-zinc-400">(Optional)</span>
              </label>
              <div className="relative flex items-center">
                <input
                  id="email"
                  type="email"
                  placeholder="ramesh@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="w-full py-2.5 px-3 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
                <Mail className="w-4 h-4 text-zinc-400 absolute right-3 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !fullName.trim() || !businessName.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Business...
                </>
              ) : (
                <>
                  Complete Setup & Open Dashboard
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Full ownership rights will be assigned to your verified mobile number.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
