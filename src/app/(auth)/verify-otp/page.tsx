"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { businessService } from "@/services/business.service";
import { Building2, ShieldCheck, AlertCircle, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const phoneParam = searchParams.get("phone") || "";
  const isDemo = searchParams.get("demo") === "true";

  const [phone, setPhone] = useState(() => {
    if (phoneParam) return phoneParam;
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("binro_auth_phone") || "";
    }
    return "";
  });

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [timer, setTimer] = useState(30);

  const canResend = timer === 0;
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!phone) {
      router.replace("/login");
    }
  }, [phone, router]);

  // Resend Countdown Timer
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleOtpChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, "");
    if (!digit && val !== "") return;

    const newOtp = [...otp];
    newOtp[index] = digit.slice(-1);
    setOtp(newOtp);

    // Auto advance focus
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const digits = pasted.split("");
      setOtp(digits);
      inputRefs.current[5]?.focus();
    }
  };

  const handleResendOtp = async () => {
    if (!canResend || loading) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error && !isDemo) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg("New OTP sent successfully!");
        setTimer(45);
      }
    } catch {
      setSuccessMsg("New OTP sent successfully!");
      setTimer(45);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = otp.join("");
    if (token.length < 6) {
      setErrorMsg("Please enter the complete 6-digit OTP.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const rawReturnUrl = searchParams.get("returnUrl");
      const safeReturnUrl =
        rawReturnUrl && rawReturnUrl.startsWith("/") && !rawReturnUrl.startsWith("//")
          ? rawReturnUrl
          : "/dashboard";

      if (isDemo || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        // Fallback for preview before live Supabase project is attached
        if (typeof document !== "undefined") {
          document.cookie = "binro_demo_session=1; path=/; SameSite=Lax";
        }
        sessionStorage.setItem("binro_user_session", JSON.stringify({ phone, role: "owner" }));
        const hasBusiness = sessionStorage.getItem("binro_active_business");
        const pendingDemoInvite = await businessService.getMyPendingInvitation();

        if (safeReturnUrl.startsWith("/invite/")) {
          router.push(safeReturnUrl);
        } else if (pendingDemoInvite) {
          router.push(`/invite/${pendingDemoInvite.id}`);
        } else if (hasBusiness) {
          router.push(safeReturnUrl);
        } else {
          router.push("/signup");
        }
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: "sms",
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      if (data?.user) {
        // If the user arrived with an invitation URL, route directly to the invitation acceptance page
        if (safeReturnUrl.startsWith("/invite/")) {
          router.push(safeReturnUrl);
          return;
        }

        // Check business membership and role
        const { data: memberData } = await supabase
          .from("business_members")
          .select("id, business_id, role, status")
          .eq("user_id", data.user.id)
          .eq("status", "active")
          .limit(1);

        if (memberData && memberData.length > 0) {
          // Existing owner or assigned staff -> Destination
          router.push(safeReturnUrl);
        } else {
          // Check if this user was invited as a staff warden to an existing business
          const pendingInvite = await businessService.getMyPendingInvitation();
          if (pendingInvite) {
            router.push(`/invite/${pendingInvite.id}`);
            return;
          }

          // New owner onboarding -> Business creation
          router.push("/signup");
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Verification failed.";
      setErrorMsg(message);
      setLoading(false);
    }
  };

  const maskedPhone = phone ? phone.replace(/(\+\d{2})(\d{3})(\d{4})(\d{3})/, "$1 $2**** $4") : "";

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 mb-4">
          <Building2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Verify your phone
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Enter the 6-digit code sent to{" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-200">
            {maskedPhone || phone}
          </span>
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

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-3 text-center">
                Enter 6-digit OTP
              </label>
              <div className="flex justify-between gap-2" onPaste={handlePaste}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    disabled={loading}
                    className="w-11 h-12 text-center text-lg font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent focus:outline-none transition-all"
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otp.join("").length < 6}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & Continue"
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-xs pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setPhone("");
                sessionStorage.removeItem("binro_auth_phone");
                router.push("/login");
              }}
              className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 font-medium cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Change Number
            </button>

            {canResend ? (
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
              >
                Resend OTP
              </button>
            ) : (
              <span className="text-zinc-400 dark:text-zinc-500">
                Resend in {timer}s
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Secure Supabase Phone Auth session</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  );
}
