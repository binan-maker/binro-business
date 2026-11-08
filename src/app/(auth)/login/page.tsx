"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Building2, Phone, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

import { normalizeIndianPhone } from "@/lib/validations/tenant.validation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const countryCode = "+91";
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const returnUrl = searchParams.get("returnUrl") || "";
  const returnQuery = returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : "";

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d+]/g, "");
    if (raw.startsWith("+91")) {
      raw = raw.slice(3);
    } else if (raw.startsWith("91") && raw.length > 10) {
      raw = raw.slice(2);
    } else if (raw.startsWith("0")) {
      raw = raw.slice(1);
    }
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    setPhoneNumber(digits);
    if (errorMsg) setErrorMsg(null);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const norm = normalizeIndianPhone(phoneNumber);
    if (!norm.valid) {
      setErrorMsg(norm.error || "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.");
      return;
    }

    const fullPhone = norm.phone; // Exactly "+91[6-9][0-9]{9}"
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: fullPhone,
      });

      if (error) {
        // If Supabase credentials are placeholder or demo mode is active
        if (error.message.includes("placeholder") || error.message.includes("fetch failed")) {
          sessionStorage.setItem("binro_auth_phone", fullPhone);
          router.push(`/verify-otp?phone=${encodeURIComponent(fullPhone)}&demo=true${returnQuery}`);
          return;
        }
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      sessionStorage.setItem("binro_auth_phone", fullPhone);
      router.push(`/verify-otp?phone=${encodeURIComponent(fullPhone)}${returnQuery}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send OTP. Please try again.";
      setErrorMsg(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 mb-4">
          <Building2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          BinRo Business
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Hostel & PG Management SaaS Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-zinc-900 py-8 px-6 shadow-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl sm:px-10">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Sign in with mobile
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              We will send a 6-digit One-Time Password (OTP) to your phone.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSendOtp} className="space-y-5">
            <div>
              <label
                htmlFor="phone"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Mobile Number
              </label>
              <div className="flex rounded-xl shadow-xs border border-zinc-300 dark:border-zinc-700 focus-within:ring-2 focus-within:ring-blue-600 focus-within:border-transparent overflow-hidden bg-white dark:bg-zinc-800">
                <div className="flex items-center px-3 bg-zinc-100 dark:bg-zinc-700/60 border-r border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 select-none">
                  {countryCode}
                </div>
                <div className="relative flex-1 flex items-center">
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    disabled={loading}
                    className="w-full py-2.5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none bg-transparent"
                    maxLength={10}
                    required
                  />
                  <Phone className="w-4 h-4 text-zinc-400 mr-3 pointer-events-none" />
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">
                Enter 10-digit number. Country code (+91) is applied automatically.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || phoneNumber.length < 10}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending OTP...
                </>
              ) : (
                <>
                  Get Verification Code
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Secured by Supabase Row-Level Security</span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Need help? Contact support at{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            support@binro.in
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span>Loading...</span>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
