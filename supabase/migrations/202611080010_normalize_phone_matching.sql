-- ============================================================
-- BINRO BUSINESS
-- STAGE 008 — ROBUST PHONE NORMALIZATION & WARDEN INVITATION DISCOVERY
-- Migration: 202611080010_normalize_phone_matching.sql
--
-- Purpose:
-- 1. Create public.normalize_phone_digits() to extract standard 10-digit Indian mobile.
-- 2. Update accept_staff_invitation() to compare phone numbers canonically so that
--    +919895509299, 919895509299, and 9895509299 all match seamlessly without false
--    "Phone Number Mismatch" errors.
-- 3. Provide public.get_staff_invitation_details() to allow the invite page to safely
--    display hostel name, property name, and masked phone before acceptance.
-- 4. Provide public.get_my_pending_invitations() so wardens logging in via mobile OTP
--    are automatically discovered and routed to their invitation instead of being sent to /signup.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. PHONE NORMALIZATION HELPER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.normalize_phone_digits(raw_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT RIGHT(regexp_replace(COALESCE(raw_phone, ''), '\D', '', 'g'), 10);
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone_digits(text)
TO PUBLIC, anon, authenticated;

-- ============================================================
-- 2. GET INVITATION DETAILS (SAFE PROJECTION FOR INVITE PAGE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_staff_invitation_details(
    target_invitation_id uuid
)
RETURNS TABLE (
    id uuid,
    business_id uuid,
    business_name text,
    property_id uuid,
    property_name text,
    invited_phone_masked text,
    invited_phone_normalized text,
    full_name text,
    status text,
    expires_at timestamptz,
    is_expired boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_inv public.business_invitations%ROWTYPE;
    v_bname text;
    v_pname text;
    v_digits text;
    v_masked text;
BEGIN
    SELECT *
    INTO v_inv
    FROM public.business_invitations
    WHERE business_invitations.id = target_invitation_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT b.name INTO v_bname
    FROM public.businesses b
    WHERE b.id = v_inv.business_id;

    SELECT p.name INTO v_pname
    FROM public.properties p
    WHERE p.id = v_inv.property_id;

    v_digits := public.normalize_phone_digits(v_inv.phone);
    IF length(v_digits) = 10 THEN
        v_masked := '+91 ' || substr(v_digits, 1, 5) || ' *****';
    ELSE
        v_masked := '+91 ***** *****';
    END IF;

    RETURN QUERY
    SELECT
        v_inv.id,
        v_inv.business_id,
        COALESCE(v_bname, 'BinRo Business'),
        v_inv.property_id,
        COALESCE(v_pname, 'Assigned Hostel Property'),
        v_masked,
        '+91' || v_digits,
        v_inv.full_name,
        v_inv.status,
        v_inv.expires_at,
        (v_inv.expires_at <= pg_catalog.now());
END;
$function$;

REVOKE ALL ON FUNCTION public.get_staff_invitation_details(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_staff_invitation_details(uuid)
TO anon, authenticated;

-- ============================================================
-- 3. GET PENDING INVITATIONS FOR CURRENT LOGGED-IN USER
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_pending_invitations()
RETURNS TABLE (
    id uuid,
    business_id uuid,
    business_name text,
    property_id uuid,
    property_name text,
    full_name text,
    created_at timestamptz,
    expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_user_phone text;
    v_profile_phone text;
    v_target_digits text;
BEGIN
    v_user_id := (SELECT auth.uid());
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    SELECT u.phone INTO v_user_phone
    FROM auth.users u
    WHERE u.id = v_user_id;

    SELECT p.phone INTO v_profile_phone
    FROM public.profiles p
    WHERE p.id = v_user_id;

    v_target_digits := public.normalize_phone_digits(COALESCE(v_user_phone, v_profile_phone));

    IF v_target_digits IS NULL OR length(v_target_digits) < 10 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        bi.id,
        bi.business_id,
        COALESCE(b.name, 'BinRo Business') AS business_name,
        bi.property_id,
        COALESCE(p.name, 'Assigned Property') AS property_name,
        bi.full_name,
        bi.created_at,
        bi.expires_at
    FROM public.business_invitations bi
    JOIN public.businesses b ON b.id = bi.business_id
    JOIN public.properties p ON p.id = bi.property_id
    WHERE public.normalize_phone_digits(bi.phone) = v_target_digits
      AND bi.status = 'pending'
      AND bi.expires_at > pg_catalog.now()
    ORDER BY bi.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_pending_invitations()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_pending_invitations()
TO authenticated;

-- ============================================================
-- 4. HARDENED ACCEPT STAFF INVITATION WITH PHONE NORMALIZATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_staff_invitation(
    target_invitation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$

DECLARE
    v_user_id uuid;
    v_user_phone text;
    v_user_email text;
    v_phone_confirmed_at timestamptz;

    v_invitation public.business_invitations%ROWTYPE;

    v_property_id uuid;
    v_profile_phone text;
    v_member_id uuid;

    v_user_digits text;
    v_inv_digits text;

BEGIN

    v_user_id := (SELECT auth.uid());

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Read user phone from Supabase Auth.
    SELECT u.phone, u.phone_confirmed_at, u.email
    INTO v_user_phone, v_phone_confirmed_at, v_user_email
    FROM auth.users u
    WHERE u.id = v_user_id;

    IF v_user_phone IS NULL THEN
        RAISE EXCEPTION 'A verified phone number is required';
    END IF;

    -- Lock invitation against concurrent acceptance.
    SELECT *
    INTO v_invitation
    FROM public.business_invitations
    WHERE id = target_invitation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    IF v_invitation.status <> 'pending' THEN
        -- If already accepted by this user, return existing membership id
        IF v_invitation.status = 'accepted' AND v_invitation.accepted_by = v_user_id THEN
            SELECT id INTO v_member_id
            FROM public.business_members
            WHERE business_id = v_invitation.business_id
              AND user_id = v_user_id
            LIMIT 1;

            IF v_member_id IS NOT NULL THEN
                RETURN v_member_id;
            END IF;
        END IF;

        RAISE EXCEPTION 'Invitation is no longer pending';
    END IF;

    IF v_invitation.expires_at <= pg_catalog.now() THEN
        UPDATE public.business_invitations
        SET status = 'expired'
        WHERE id = target_invitation_id;

        RETURN NULL;
    END IF;

    -- Match phone numbers using canonical last-10-digits normalization.
    -- This handles +919895509299 vs 919895509299 vs 9895509299 seamlessly.
    v_user_digits := public.normalize_phone_digits(v_user_phone);
    v_inv_digits := public.normalize_phone_digits(v_invitation.phone);

    IF v_user_digits <> v_inv_digits THEN
        RAISE EXCEPTION 'Invitation belongs to a different phone number';
    END IF;

    -- Verify that the invited property still exists, belongs to the business, and is active.
    SELECT p.id
    INTO v_property_id
    FROM public.properties p
    WHERE p.id = v_invitation.property_id
      AND p.business_id = v_invitation.business_id
      AND p.status = 'active'
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invited property is invalid or no longer active';
    END IF;

    -- Safe profile insertion / update:
    -- Standardize phone to canonical E.164 (+91 followed by 10 digits)
    INSERT INTO public.profiles (
        id,
        full_name,
        phone,
        email
    )
    VALUES (
        v_user_id,
        v_invitation.full_name,
        '+91' || v_user_digits,
        v_user_email
    )
    ON CONFLICT (id) DO UPDATE
    SET
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone, '+91' || v_user_digits),
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

    -- Verify profile phone normalized digits match invitation digits
    SELECT phone
    INTO v_profile_phone
    FROM public.profiles
    WHERE id = v_user_id;

    IF public.normalize_phone_digits(v_profile_phone) <> v_inv_digits THEN
        RAISE EXCEPTION 'Profile phone does not match verified invitation phone';
    END IF;

    -- Prevent duplicate membership
    IF EXISTS (
        SELECT 1
        FROM public.business_members
        WHERE business_id = v_invitation.business_id
          AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'You are already a member of this business';
    END IF;

    -- Create active warden membership
    INSERT INTO public.business_members (
        business_id,
        user_id,
        role,
        status
    )
    VALUES (
        v_invitation.business_id,
        v_user_id,
        'warden',
        'active'
    )
    RETURNING id INTO v_member_id;

    -- Assign invited property
    INSERT INTO public.property_staff (
        property_id,
        business_id,
        business_member_id
    )
    VALUES (
        v_invitation.property_id,
        v_invitation.business_id,
        v_member_id
    )
    ON CONFLICT (property_id, business_member_id) DO NOTHING;

    -- Complete invitation
    UPDATE public.business_invitations
    SET
        status = 'accepted',
        accepted_by = v_user_id,
        accepted_at = pg_catalog.now()
    WHERE id = target_invitation_id;

    RETURN v_member_id;

END;

$function$;

REVOKE ALL ON FUNCTION public.accept_staff_invitation(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(uuid)
TO authenticated;

COMMIT;

-- ============================================================
-- END OF MIGRATION 202611080010_normalize_phone_matching.sql
-- ============================================================
