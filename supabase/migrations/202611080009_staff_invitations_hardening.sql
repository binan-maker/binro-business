-- ============================================================
-- BINRO BUSINESS
-- STAGE 007 — STAFF INVITATIONS HARDENING
-- Migration: 202611080009_staff_invitations_hardening.sql
--
-- Purpose:
-- 1. Tighten phone validation constraint to standard Indian E.164 (+91[6-9][0-9]{9}).
-- 2. Update create_staff_invitation() with identical phone validation.
-- 3. In accept_staff_invitation(), verify invited property is active with FOR SHARE row lock.
-- 4. In accept_staff_invitation(), use safe profile upsert without overwriting
--    existing phone or email, only updating full_name if previously NULL.
--
-- Pre-requisites:
-- 202611080008_staff_invitations.sql has already run.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. PRE-CHECK EXISTING INVITATION RECORDS & UPDATE PHONE CONSTRAINT
-- ============================================================

-- Fail loudly if existing records violate the tighter format.
-- Prevents silent data modification or unexpected constraint failure.
DO $$
DECLARE
    v_invalid_count integer;
BEGIN
    SELECT count(*)
    INTO v_invalid_count
    FROM public.business_invitations
    WHERE phone !~ '^\+91[6-9][0-9]{9}$';

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION
            'Cannot apply phone check: % existing invitation record(s) do not match ^\+91[6-9][0-9]{9}$',
            v_invalid_count;
    END IF;
END;
$$;

ALTER TABLE public.business_invitations
DROP CONSTRAINT IF EXISTS business_invitations_phone_check;

ALTER TABLE public.business_invitations
ADD CONSTRAINT business_invitations_phone_check
CHECK (phone ~ '^\+91[6-9][0-9]{9}$');

-- ============================================================
-- 2. HARDEN CREATE STAFF INVITATION RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_staff_invitation(
    target_business_id uuid,
    target_property_id uuid,
    target_phone text,
    target_full_name text DEFAULT NULL,
    target_expires_in_days integer DEFAULT 7
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$

DECLARE
    v_user_id uuid;
    v_inviter_member_id uuid;
    v_inviter_phone text;
    v_phone text;
    v_invitation_id uuid;

BEGIN

    v_user_id := (SELECT auth.uid());

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    v_phone := pg_catalog.btrim(target_phone);

    -- Strict Indian mobile E.164 format (+91 followed by 10 digits starting with 6-9)
    IF v_phone IS NULL
       OR v_phone !~ '^\+91[6-9][0-9]{9}$' THEN
        RAISE EXCEPTION
            'Phone must be a valid 10-digit Indian mobile number in E.164 format (+91XXXXXXXXXX)';
    END IF;

    IF target_expires_in_days IS NULL
       OR target_expires_in_days < 1
       OR target_expires_in_days > 30 THEN
        RAISE EXCEPTION
            'Invitation expiry must be between 1 and 30 days';
    END IF;

    -- Verify active owner/admin membership.
    SELECT bm.id, pr.phone
    INTO v_inviter_member_id, v_inviter_phone
    FROM public.business_members bm
    JOIN public.profiles pr
      ON pr.id = bm.user_id
    WHERE bm.business_id = target_business_id
      AND bm.user_id = v_user_id
      AND bm.role IN ('owner', 'admin')
      AND bm.status = 'active';

    IF v_inviter_member_id IS NULL THEN
        RAISE EXCEPTION
            'Only active owners and admins can invite staff';
    END IF;

    IF v_inviter_phone IS NOT DISTINCT FROM v_phone THEN
        RAISE EXCEPTION
            'You cannot invite your own phone number';
    END IF;

    -- Verify property belongs to this business and is active.
    IF NOT EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = target_property_id
          AND p.business_id = target_business_id
          AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'Property is invalid or inactive';
    END IF;

    -- Expire older pending invitations for this phone under this business.
    UPDATE public.business_invitations
    SET status = 'expired'
    WHERE business_id = target_business_id
      AND phone = v_phone
      AND status = 'pending'
      AND expires_at <= pg_catalog.now();

    -- Existing business members should use the property assignment workflow.
    IF EXISTS (
        SELECT 1
        FROM public.business_members bm
        JOIN public.profiles pr
          ON pr.id = bm.user_id
        WHERE bm.business_id = target_business_id
          AND pr.phone = v_phone
    ) THEN
        RAISE EXCEPTION
            'This person is already a business member';
    END IF;

    INSERT INTO public.business_invitations (
        business_id,
        property_id,
        phone,
        full_name,
        invited_by_member_id,
        expires_at
    )
    VALUES (
        target_business_id,
        target_property_id,
        v_phone,
        NULLIF(pg_catalog.btrim(target_full_name), ''),
        v_inviter_member_id,
        pg_catalog.now()
            + (target_expires_in_days * interval '1 day')
    )
    RETURNING id INTO v_invitation_id;

    RETURN v_invitation_id;

END;

$function$;

-- ============================================================
-- 3. HARDEN ACCEPT STAFF INVITATION RPC
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
    v_phone_confirmed_at timestamptz;

    v_invitation public.business_invitations%ROWTYPE;

    v_property_id uuid;
    v_profile_phone text;
    v_member_id uuid;

BEGIN

    v_user_id := (SELECT auth.uid());

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Read verified phone from Supabase Auth.
    SELECT u.phone, u.phone_confirmed_at
    INTO v_user_phone, v_phone_confirmed_at
    FROM auth.users u
    WHERE u.id = v_user_id;

    IF v_user_phone IS NULL
       OR v_phone_confirmed_at IS NULL THEN
        RAISE EXCEPTION
            'A verified phone number is required';
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
        RAISE EXCEPTION
            'Invitation is no longer pending';
    END IF;

    IF v_invitation.expires_at <= pg_catalog.now() THEN

        UPDATE public.business_invitations
        SET status = 'expired'
        WHERE id = target_invitation_id;

        -- NULL return indicates invitation expired.
        RETURN NULL;

    END IF;

    -- Match the verified Auth phone.
    IF v_user_phone <> v_invitation.phone THEN
        RAISE EXCEPTION
            'Invitation belongs to a different phone number';
    END IF;

    -- Verify that the invited property still exists, belongs to the business, and is active.
    -- Lock the property row (FOR SHARE) so concurrent transactions cannot deactivate or delete it.
    SELECT p.id
    INTO v_property_id
    FROM public.properties p
    WHERE p.id = v_invitation.property_id
      AND p.business_id = v_invitation.business_id
      AND p.status = 'active'
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Invited property is invalid or no longer active';
    END IF;

    -- Safe profile insertion / update:
    -- 1. Insert profile from auth.users if it does not yet exist.
    -- 2. Never overwrite existing phone or email.
    -- 3. Only populate full_name if existing full_name is NULL and invitation supplies a name.
    INSERT INTO public.profiles (
        id,
        full_name,
        phone,
        email
    )
    SELECT
        u.id,
        v_invitation.full_name,
        u.phone,
        u.email
    FROM auth.users u
    WHERE u.id = v_user_id
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = EXCLUDED.full_name
    WHERE public.profiles.full_name IS NULL
      AND EXCLUDED.full_name IS NOT NULL;

    -- Verify profile phone matches verified invitation phone.
    SELECT phone
    INTO v_profile_phone
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_profile_phone IS DISTINCT FROM v_invitation.phone THEN
        RAISE EXCEPTION
            'Profile phone does not match verified invitation phone';
    END IF;

    -- Prevent duplicate membership.
    IF EXISTS (
        SELECT 1
        FROM public.business_members
        WHERE business_id = v_invitation.business_id
          AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION
            'You are already a member of this business';
    END IF;

    -- Create active warden membership.
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

    -- Assign invited property.
    INSERT INTO public.property_staff (
        property_id,
        business_id,
        business_member_id
    )
    VALUES (
        v_invitation.property_id,
        v_invitation.business_id,
        v_member_id
    );

    -- Complete invitation.
    UPDATE public.business_invitations
    SET
        status = 'accepted',
        accepted_by = v_user_id,
        accepted_at = pg_catalog.now()
    WHERE id = target_invitation_id;

    RETURN v_member_id;

END;

$function$;

-- ============================================================
-- 4. FUNCTION PERMISSIONS
-- ============================================================

REVOKE ALL ON FUNCTION public.create_staff_invitation(
    uuid, uuid, text, text, integer
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_staff_invitation(
    uuid, uuid, text, text, integer
)
TO authenticated;

REVOKE ALL ON FUNCTION public.accept_staff_invitation(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(uuid)
TO authenticated;

COMMIT;

-- ============================================================
-- END OF MIGRATION 202611080009_staff_invitations_hardening.sql
-- ============================================================
