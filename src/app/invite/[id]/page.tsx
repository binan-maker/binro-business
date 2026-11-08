"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
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
  Check,
  Copy,
  Terminal,
  MapPin,
} from "lucide-react";

interface InvitationInfo {
  id: string;
  business_id: string;
  business_name: string;
  property_id: string;
  property_name: string;
  invited_phone_masked: string;
  invited_phone_normalized: string;
  full_name: string | null;
  status: string;
  expires_at: string;
  is_expired: boolean;
}

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
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [sqlCopied, setSqlCopied] = useState(false);

  const [status, setStatus] = useState<{
    type:
      | "idle"
      | "success"
      | "mismatch"
      | "expired"
      | "already_member"
      | "no_phone"
      | "unauthenticated"
      | "db_migration_needed"
      | "error";
    message: string;
  }>({
    type: "idle",
    message: "",
  });

  // Extract last 10 digits for accurate phone comparison
  const user10Digits = useMemo(() => {
    return (currentUserPhone || "").replace(/\D/g, "").slice(-10);
  }, [currentUserPhone]);

  const invited10Digits = useMemo(() => {
    return (invitation?.invited_phone_normalized || "").replace(/\D/g, "").slice(-10);
  }, [invitation?.invited_phone_normalized]);

  const isPhoneMatch = useMemo(() => {
    if (!user10Digits || !invited10Digits) return true; // neutral until loaded
    return user10Digits === invited10Digits;
  }, [user10Digits, invited10Digits]);

  const formattedUserPhone = useMemo(() => {
    if (!user10Digits || user10Digits.length < 10) return currentUserPhone || "";
    return `+91 ${user10Digits.slice(0, 5)} ${user10Digits.slice(5)}`;
  }, [user10Digits, currentUserPhone]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // 1. Check user auth
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
          // Check demo session
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

        // 2. Fetch invitation details
        if (invitationId) {
          const details = await businessService.getStaffInvitationDetails(invitationId);
          if (details) {
            setInvitation(details);
            if (details.status === "accepted") {
              setStatus({
                type: "already_member",
                message: "This invitation has already been accepted! Redirecting to dashboard...",
              });
              setTimeout(() => router.push("/dashboard"), 2500);
            } else if (details.is_expired) {
              setStatus({
                type: "expired",
                message: "This invitation has expired. Please contact the property manager to issue a new one.",
              });
            }
          }
        }
      } catch (err) {
        console.error("Auth & Invite check error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [supabase, invitationId, router]);

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
        message: "Invitation accepted successfully! Joining as Property Warden...",
      });

      // Clear cached business/property so new warden membership is picked up
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

      if (lower.includes("phone_mismatch_raw") || lower.includes("different phone")) {
        // If our client-side 10-digit check matches, then it's solely due to SQL unnormalized string equality
        if (isPhoneMatch && user10Digits) {
          setStatus({
            type: "db_migration_needed",
            message: `Your verified phone (${formattedUserPhone}) matches the invitation! However, the database enforces an exact string check (+91 prefix vs no + prefix). Please apply Migration 202611080010_normalize_phone_matching.sql to update the function.`,
          });
        } else {
          setStatus({
            type: "mismatch",
            message:
              "This invitation was sent to a different phone number than your currently signed-in account.",
          });
        }
      } else if (lower.includes("permission denied") || lower.includes("authentication required")) {
        setIsAuthenticated(false);
        setStatus({
          type: "unauthenticated",
          message:
            "A verified mobile login session is required. Please sign in with your mobile OTP.",
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
            "This invitation has expired. Please contact the property manager or hostel owner to issue a fresh link.",
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

  const sqlSnippet = `-- Apply in Supabase Dashboard -> SQL Editor
CREATE OR REPLACE FUNCTION public.normalize_phone_digits(raw_phone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT RIGHT(regexp_replace(COALESCE(raw_phone, ''), '\\D', '', 'g'), 10);
$$;

CREATE OR REPLACE FUNCTION public.accept_staff_invitation(target_invitation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_user_phone text;
    v_user_email text;
    v_invitation public.business_invitations%ROWTYPE;
    v_property_id uuid;
    v_member_id uuid;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    SELECT u.phone, u.email INTO v_user_phone, v_user_email FROM auth.users u WHERE u.id = v_user_id;
    IF v_user_phone IS NULL THEN RAISE EXCEPTION 'A verified phone number is required'; END IF;

    SELECT * INTO v_invitation FROM public.business_invitations WHERE id = target_invitation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
    IF v_invitation.status <> 'pending' THEN RAISE EXCEPTION 'Invitation is no longer pending'; END IF;
    IF v_invitation.expires_at <= pg_catalog.now() THEN
        UPDATE public.business_invitations SET status = 'expired' WHERE id = target_invitation_id;
        RETURN NULL;
    END IF;

    -- Match phone numbers using canonical 10-digit normalization
    IF public.normalize_phone_digits(v_user_phone) <> public.normalize_phone_digits(v_invitation.phone) THEN
        RAISE EXCEPTION 'Invitation belongs to a different phone number';
    END IF;

    SELECT p.id INTO v_property_id FROM public.properties p
    WHERE p.id = v_invitation.property_id AND p.business_id = v_invitation.business_id AND p.status = 'active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invited property is invalid or no longer active'; END IF;

    INSERT INTO public.profiles (id, full_name, phone, email)
    VALUES (v_user_id, v_invitation.full_name, '+91' || public.normalize_phone_digits(v_user_phone), v_user_email)
    ON CONFLICT (id) DO UPDATE SET phone = COALESCE(public.profiles.phone, EXCLUDED.phone);

    IF EXISTS (SELECT 1 FROM public.business_members WHERE business_id = v_invitation.business_id AND user_id = v_user_id) THEN
        RAISE EXCEPTION 'You are already a member of this business';
    END IF;

    INSERT INTO public.business_members (business_id, user_id, role, status)
    VALUES (v_invitation.business_id, v_user_id, 'warden', 'active') RETURNING id INTO v_member_id;

    INSERT INTO public.property_staff (property_id, business_id, business_member_id)
    VALUES (v_invitation.property_id, v_invitation.business_id, v_member_id)
    ON CONFLICT (property_id, business_member_id) DO NOTHING;

    UPDATE public.business_invitations SET status = 'accepted', accepted_by = v_user_id, accepted_at = pg_catalog.now()
    WHERE id = target_invitation_id;

    RETURN v_member_id;
END; $function$;`;

  const copySqlToClipboard = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(sqlSnippet);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2500);
    }
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

          {/* Database migration needed helper banner */}
          {status.type === "db_migration_needed" && (
            <div className="mb-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
              <Terminal className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-bold">Phone Number Confirmed (+91 {user10Digits})</p>
                <p className="leading-relaxed">
                  Your phone matches this invitation! In your Supabase database, run Migration 0010 to allow normalized phone comparison:
                </p>
                <button
                  type="button"
                  onClick={copySqlToClipboard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  {sqlCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied SQL to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy SQL Fix to Run in Supabase
                    </>
                  )}
                </button>
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
                  Currently signed in with: <strong>{formattedUserPhone || currentUserPhone}</strong>
                </p>
                {invitation?.invited_phone_masked && (
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                    Invitation was sent to: <strong>{invitation.invited_phone_masked}</strong>
                  </p>
                )}
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
                  Sign in with your 10-digit Indian mobile number to verify your access against this invitation.
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
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 mb-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                    <Building className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {invitation?.business_name || "Hostel Organization"}
                    </h3>
                    <p className="text-xs text-zinc-500 truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                      {invitation?.property_name || "Assigned Hostel Property"}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Assigned Role:</span>
                    <span className="font-bold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800">
                      Property Warden
                    </span>
                  </div>

                  {invitation?.invited_phone_masked && (
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Invited Number:</span>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {invitation.invited_phone_masked}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Currently Signed In:</span>
                    <div className="text-right">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {formattedUserPhone || currentUserEmail || (isAuthenticated ? "Logged In" : "Not signed in")}
                      </span>
                      {isAuthenticated && user10Digits && isPhoneMatch && (
                        <span className="ml-1.5 inline-flex items-center text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          <Check className="w-3 h-3 inline mr-0.5" />
                          Matched
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Access Scope:</span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {invitation?.property_name ? `${invitation.property_name} only` : "Assigned Property only"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={
                    accepting ||
                    (!isPhoneMatch && Boolean(invited10Digits)) ||
                    status.type === "expired" ||
                    status.type === "already_member"
                  }
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
              <span>Secured by Supabase Row-Level Security</span>
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
