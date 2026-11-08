"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { businessService } from "@/services/business.service";
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  LogOut,
  Building,
  Phone,
  LogIn,
} from "lucide-react";

function InviteAcceptContent() {
  const params = useParams();
  const invitationId = typeof params?.id === "string" ? params.id : "";
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserPhone, setCurrentUserPhone] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    type:
      | "idle"
      | "success"
      | "mismatch"
      | "expired"
      | "already_member"
      | "no_phone"
      | "unauthenticated"
      | "error";
    message: string;
  }>({
    type: "idle",
    message: "",
  });

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;

        if (user) {
          setIsAuthenticated(true);
          if (user.phone) {
            setCurrentUserPhone(user.phone);
          }
          if (user.email) {
            setCurrentUserEmail(user.email);
          }
        } else {
          // Check if demo session exists
          const demoSession = sessionStorage.getItem("binro_user_session");
          if (demoSession) {
            try {
              const parsed = JSON.parse(demoSession);
              if (parsed.phone) {
                setIsAuthenticated(true);
                setCurrentUserPhone(parsed.phone);
              }
            } catch {
              setIsAuthenticated(false);
            }
          } else {
            setIsAuthenticated(false);
          }
        }
      } catch (err) {
        console.error("Auth check error:", err);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [supabase]);

  const handleSignInRedirect = () => {
    router.push(`/login?returnUrl=/invite/${encodeURIComponent(invitationId)}`);
  };

  const handleAccept = async () => {
    if (!invitationId) return;

    if (!isAuthenticated) {
      handleSignInRedirect();
      return;
    }

    setAccepting(true);
    setStatus({ type: "idle", message: "" });

    try {
      await businessService.acceptStaffInvitation(invitationId);
      setStatus({
        type: "success",
        message: "Invitation accepted successfully! Redirecting you to your hostel dashboard...",
      });

      // Clear any cached active business so the newly accepted business is resolved
      sessionStorage.removeItem("binro_active_business");
      sessionStorage.removeItem("binro_active_property_id");

      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err: unknown) {
      let msg = "Failed to accept invitation.";
      if (err instanceof Error) {
        msg = err.message;
      } else if (typeof err === "object" && err !== null) {
        const obj = err as Record<string, unknown>;
        msg = String(obj.message || obj.error_description || obj.details || obj.error || msg);
      } else if (typeof err === "string") {
        msg = err;
      }

      const lower = msg.toLowerCase();

      if (lower.includes("permission denied") || lower.includes("authentication required")) {
        setIsAuthenticated(false);
        setStatus({
          type: "unauthenticated",
          message:
            "A verified mobile login session is required to execute acceptance. Please sign in with your mobile OTP.",
        });
      } else if (lower.includes("different phone")) {
        setStatus({
          type: "mismatch",
          message:
            "This invitation was sent to a different phone number than your currently signed-in account.",
        });
      } else if (lower.includes("verified phone") || lower.includes("phone number is required")) {
        setStatus({
          type: "no_phone",
          message:
            "A verified Indian mobile number is required to accept this warden invitation. Please sign in with your mobile OTP.",
        });
      } else if (lower.includes("expired")) {
        setStatus({
          type: "expired",
          message:
            "This invitation has expired. Please contact the property manager or hostel owner to issue a fresh invitation link.",
        });
      } else if (lower.includes("already a member")) {
        setStatus({
          type: "already_member",
          message: "You are already an active member of this business. Redirecting to your dashboard...",
        });
        setTimeout(() => {
          router.push("/dashboard");
        }, 1500);
      } else {
        setStatus({
          type: "error",
          message: msg,
        });
      }
    } finally {
      setAccepting(false);
    }
  };

  const handleSignOutAndSwitch = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    sessionStorage.removeItem("binro_user_session");
    sessionStorage.removeItem("binro_active_business");
    sessionStorage.removeItem("binro_auth_phone");
    handleSignInRedirect();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-xs text-zinc-500">Checking invitation details...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated with email only (no verified mobile number)
  const isEmailOnly = isAuthenticated && !currentUserPhone && Boolean(currentUserEmail);

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 mb-4">
          <Building2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Staff Invitation
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          BinRo Business • Property Warden Delegation
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-zinc-900 py-8 px-6 shadow-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl sm:px-10">
          {/* Status Banners */}
          {status.type === "success" && (
            <div className="mb-5 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Welcome aboard!</p>
                <p className="mt-0.5">{status.message}</p>
              </div>
            </div>
          )}

          {status.type === "already_member" && (
            <div className="mb-5 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-start gap-3 text-xs text-blue-800 dark:text-blue-300">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Already a Member</p>
                <p className="mt-0.5">{status.message}</p>
              </div>
            </div>
          )}

          {status.type === "unauthenticated" && (
            <div className="mb-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
              <LogIn className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Sign In Required</p>
                <p className="mt-0.5">{status.message}</p>
                <button
                  type="button"
                  onClick={handleSignInRedirect}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Sign In with Mobile (+91)
                </button>
              </div>
            </div>
          )}

          {status.type === "mismatch" && (
            <div className="mb-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Phone Number Mismatch</p>
                <p className="mt-0.5">{status.message}</p>
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                  Currently signed in with: <strong>{currentUserPhone}</strong>
                </p>
                <button
                  type="button"
                  onClick={handleSignOutAndSwitch}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign In With Invited Number
                </button>
              </div>
            </div>
          )}

          {status.type === "no_phone" && (
            <div className="mb-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
              <Phone className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Mobile Phone Verification Required</p>
                <p className="mt-0.5">{status.message}</p>
                <button
                  type="button"
                  onClick={handleSignOutAndSwitch}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Sign In with Mobile OTP (+91)
                </button>
              </div>
            </div>
          )}

          {(status.type === "expired" || status.type === "error") && (
            <div className="mb-5 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-3 text-xs text-red-800 dark:text-red-300">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {status.type === "expired" ? "Invitation Expired" : "Unable to Accept"}
                </p>
                <p className="mt-0.5">{status.message}</p>
              </div>
            </div>
          )}

          {/* Prompt to sign in if not authenticated */}
          {!isAuthenticated && status.type === "idle" && (
            <div className="mb-5 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-start gap-3 text-xs text-blue-800 dark:text-blue-300">
              <LogIn className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Sign In to Accept</p>
                <p className="mt-0.5">
                  You need to sign in with your 10-digit Indian mobile number (+91) to cryptographically
                  verify your phone against this invitation.
                </p>
                <button
                  type="button"
                  onClick={handleSignInRedirect}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Sign In with Mobile (+91)
                </button>
              </div>
            </div>
          )}

          {/* Email-only notice banner */}
          {isEmailOnly && status.type === "idle" && (
            <div className="mb-5 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-start gap-3 text-xs text-blue-800 dark:text-blue-300">
              <Phone className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Sign in with Mobile Number</p>
                <p className="mt-0.5">
                  You are logged in with email: <strong>{currentUserEmail}</strong>. BinRo warden
                  assignments require SMS OTP verification to your invited mobile number.
                </p>
                <button
                  type="button"
                  onClick={handleSignOutAndSwitch}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Sign in with Mobile (+91)
                </button>
              </div>
            </div>
          )}

          {status.type !== "success" && (
            <>
              {/* Invitation Information Card */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Property Warden Role
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Manage hostel rooms, tenant check-ins, and bed allocations.
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Account:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {currentUserPhone ||
                        currentUserEmail ||
                        (isAuthenticated ? "Logged In" : "Not signed in")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Access Scope:</span>
                    <span className="font-medium text-purple-600 dark:text-purple-400">
                      Assigned Property Only
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={accepting || status.type === "mismatch" || status.type === "expired"}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
                >
                  {accepting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Accepting Invitation...
                    </>
                  ) : (
                    <>
                      Accept Invitation & Join
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSignInRedirect}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                  Sign In with Mobile (+91) to Accept
                </button>
              )}

              <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
                <span>Verification: Cryptographic SMS OTP</span>
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={handleSignOutAndSwitch}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Switch Account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSignInRedirect}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </>
          )}

          <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Cryptographically verified with Postgres SMS OTP validation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 font-sans">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      }
    >
      <InviteAcceptContent />
    </Suspense>
  );
}
