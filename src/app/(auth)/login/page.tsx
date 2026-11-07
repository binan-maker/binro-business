"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Building2, Phone, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const countryCode = "+91";
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cleanNumber = phoneNumber.replace(/\D/g, "");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (cleanNumber.length < 10) {
      setErrorMsg("Please enter a valid 10-digit mobile number.");
      return;
    }

    const fullPhone = `${countryCode}${cleanNumber}`;
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: fullPhone,
      });

      if (error) {
        // If Supabase credentials are placeholder or demo mode is active
        if (error.message.includes("placeholder") || error.message.includes("fetch failed")) {
          sessionStorage.setItem("binro_auth_phone", fullPhone);
          router.push(`/verify-otp?phone=${encodeURIComponent(fullPhone)}&demo=true`);
          return;
        }
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      sessionStorage.setItem("binro_auth_phone", fullPhone);
      router.push(`/verify-otp?phone=${encodeURIComponent(fullPhone)}`);
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
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={loading}
                    className="w-full py-2.5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none bg-transparent"
                    maxLength={14}
                    required
                  />
                  <Phone className="w-4 h-4 text-zinc-400 mr-3 pointer-events-none" />
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">
                Standard E.164 verified SMS. No password needed.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || cleanNumber.length < 10}
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
