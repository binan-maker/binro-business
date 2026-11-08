-- ============================================================
-- BINRO BUSINESS
-- STAGE 012 — BATCH 1: ATOMIC STAFF PROPERTY ASSIGNMENT & INVITATION CANCELLATION
-- Migration: 202611080012_staff_assignment_and_cancellation.sql
--
-- Purpose:
-- 1. Atomic staff property assignment:
--    Provides public.assign_staff_property() to replace or clear a member's property assignment
--    in a single atomic transaction. Validates caller authorization (owner/admin), member existence
--    and active status within the business, and property ownership/active status.
--    If target_property_id is NULL, clears the property-specific assignment to grant
--    business-wide property access ("all"). If reassignment fails for any reason, existing assignment
--    is preserved.
-- 2. Staff invitation cancellation:
--    Provides public.cancel_staff_invitation() to safely cancel pending warden invitations.
--    Enforces that caller is an active owner/admin of the invitation's business, prevents cancellation
--    of already accepted invitations, and updates status to 'cancelled'.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ATOMIC STAFF PROPERTY ASSIGNMENT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_staff_property(
    target_business_id uuid,
    target_member_id uuid,
    target_property_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_member_role text;
    v_member_status text;
BEGIN
    v_user_id := (SELECT auth.uid());

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Validate caller is active owner or admin of target business
    IF NOT public.is_business_admin(target_business_id) THEN
        RAISE EXCEPTION 'Only active owners and admins can assign staff properties';
    END IF;

    -- Validate target member exists in this business and is active
    SELECT bm.role, bm.status
    INTO v_member_role, v_member_status
    FROM public.business_members bm
    WHERE bm.id = target_member_id
      AND bm.business_id = target_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found in this business';
    END IF;

    IF v_member_status <> 'active' THEN
        RAISE EXCEPTION 'Cannot assign property to an inactive staff member';
    END IF;

    -- If target_property_id is provided, validate property belongs to this business and is active
    IF target_property_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = target_property_id
              AND p.business_id = target_business_id
              AND p.status = 'active'
        ) THEN
            RAISE EXCEPTION 'Target property does not exist or is not active in this business';
        END IF;
    END IF;

    -- Atomic reassignment:
    -- Remove any existing property assignment for this member within this business
    DELETE FROM public.property_staff
    WHERE business_id = target_business_id
      AND business_member_id = target_member_id;

    -- If target_property_id is specified (not "all"), insert the new assignment
    IF target_property_id IS NOT NULL THEN
        INSERT INTO public.property_staff (
            property_id,
            business_id,
            business_member_id
        )
        VALUES (
            target_property_id,
            target_business_id,
            target_member_id
        );
    END IF;

    RETURN true;
END;
$function$;

-- ============================================================
-- 2. CANCEL STAFF INVITATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_staff_invitation(
    target_invitation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_invitation public.business_invitations%ROWTYPE;
BEGIN
    v_user_id := (SELECT auth.uid());

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Fetch and lock the invitation
    SELECT *
    INTO v_invitation
    FROM public.business_invitations
    WHERE id = target_invitation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    -- Caller must be active owner or admin of the business that issued the invitation
    IF NOT public.is_business_admin(v_invitation.business_id) THEN
        RAISE EXCEPTION 'Only active owners and admins can cancel staff invitations';
    END IF;

    -- Prevent cancellation of accepted invitations
    IF v_invitation.status = 'accepted' THEN
        RAISE EXCEPTION 'Cannot cancel an invitation that has already been accepted';
    END IF;

    -- Check if already cancelled
    IF v_invitation.status = 'cancelled' THEN
        RAISE EXCEPTION 'Invitation is already cancelled';
    END IF;

    IF v_invitation.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending invitations can be cancelled';
    END IF;

    -- Mark status as cancelled
    UPDATE public.business_invitations
    SET status = 'cancelled'
    WHERE id = target_invitation_id;

    RETURN true;
END;
$function$;

-- ============================================================
-- 3. FUNCTION PERMISSIONS
-- ============================================================

REVOKE ALL ON FUNCTION public.assign_staff_property(uuid, uuid, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assign_staff_property(uuid, uuid, uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_staff_invitation(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cancel_staff_invitation(uuid)
TO authenticated;

COMMIT;
