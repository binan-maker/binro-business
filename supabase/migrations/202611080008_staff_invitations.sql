
-- ============================================================
-- BINRO BUSINESS
-- STAGE 007 — STAFF INVITATIONS
-- Migration: 202611080008_staff_invitations.sql
--
-- Purpose:
-- 1. Store warden invitations.
-- 2. Allow active owners/admins to invite wardens.
-- 3. Accept invitations using verified Supabase phone numbers.
-- 4. Create membership and property assignment atomically.
--
-- IMPORTANT:
-- Review before execution.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. INVITATION TABLE
-- ============================================================

CREATE TABLE public.business_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id uuid NOT NULL,
    property_id uuid NOT NULL,

    phone text NOT NULL,
    full_name text,

    invited_by_member_id uuid NOT NULL,

    status text NOT NULL DEFAULT 'pending',

    expires_at timestamptz NOT NULL
        DEFAULT (now() + interval '7 days'),

    accepted_by uuid,
    accepted_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT business_invitations_status_check
        CHECK (
            status IN (
                'pending',
                'accepted',
                'cancelled',
                'expired'
            )
        ),

    CONSTRAINT business_invitations_phone_check
        CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),

    CONSTRAINT business_invitations_business_fkey
        FOREIGN KEY (business_id)
        REFERENCES public.businesses(id)
        ON DELETE CASCADE,

    CONSTRAINT business_invitations_property_business_fkey
        FOREIGN KEY (property_id, business_id)
        REFERENCES public.properties(id, business_id)
        ON DELETE CASCADE,

    CONSTRAINT business_invitations_inviter_fkey
        FOREIGN KEY (invited_by_member_id, business_id)
        REFERENCES public.business_members(id, business_id)
        ON DELETE CASCADE,

    CONSTRAINT business_invitations_accepted_by_fkey
        FOREIGN KEY (accepted_by)
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    CONSTRAINT business_invitations_accepted_at_check
        CHECK (
            status <> 'accepted'
            OR accepted_at IS NOT NULL
        )
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE UNIQUE INDEX business_invitations_one_pending_phone
ON public.business_invitations (business_id, phone)
WHERE status = 'pending';

CREATE INDEX business_invitations_business_created_idx
ON public.business_invitations (
    business_id,
    created_at DESC
);

CREATE INDEX business_invitations_property_idx
ON public.business_invitations (property_id);

-- ============================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================

CREATE TRIGGER business_invitations_updated_at
BEFORE UPDATE ON public.business_invitations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.business_invitations
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_invitations
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.business_invitations
TO authenticated;

CREATE POLICY "Admins can view business invitations"
ON public.business_invitations
FOR SELECT
TO authenticated
USING (
    public.is_business_admin(business_id)
);

-- No direct INSERT, UPDATE or DELETE policies.
-- Invitation changes are performed through secure RPCs.

-- ============================================================
-- 5. CREATE STAFF INVITATION
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

    IF v_phone IS NULL
       OR v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
        RAISE EXCEPTION 'Phone must be in E.164 format';
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

    -- Verify property belongs to this business.

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

    -- Expire older invitations.

    UPDATE public.business_invitations
    SET status = 'expired'
    WHERE business_id = target_business_id
      AND phone = v_phone
      AND status = 'pending'
      AND expires_at <= pg_catalog.now();

    -- Existing business members should use
    -- the existing property assignment workflow.

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
-- 6. ACCEPT STAFF INVITATION
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

        -- NULL means invitation expired.
        RETURN NULL;

    END IF;

    -- Match the verified Auth phone.

    IF v_user_phone <> v_invitation.phone THEN
        RAISE EXCEPTION
            'Invitation belongs to a different phone number';
    END IF;

    -- Ensure profile exists.
    -- Normally created by handle_new_user().

    INSERT INTO public.profiles AS existing_profile (
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
        full_name = COALESCE(
            existing_profile.full_name,
            EXCLUDED.full_name
        ),
        phone = COALESCE(
            existing_profile.phone,
            EXCLUDED.phone
        ),
        email = COALESCE(
            existing_profile.email,
            EXCLUDED.email
        );

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
-- 7. FUNCTION PERMISSIONS
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
-- END OF MIGRATION
-- ============================================================
