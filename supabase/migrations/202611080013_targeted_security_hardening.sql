-- ============================================================
-- BINRO BUSINESS
-- STAGE 013 — PHASE 2A: TARGETED SECURITY HARDENING
-- Migration: 202611080013_targeted_security_hardening.sql
--
-- Findings addressed:
-- 1. SEC-001: Rent Charge INSERT Integrity (public.rent_charges)
--    Enforces that newly inserted rent charges must strictly start with
--    amount_paid = 0 and status = 'pending'. Prevents forging paid or
--    partially paid status without payment allocations via direct PostgREST/API inserts.
-- 2. SEC-002: Property SELECT RLS Isolation (public.properties)
--    Replaces "Members can view accessible properties" so owners/admins
--    can view all properties in their business, while wardens can ONLY
--    view properties assigned to them in property_staff.
-- 3. RLS-001: Business Membership Role Escalation (public.business_members)
--    Prevents admins from promoting themselves/others to owner, modifying
--    or suspending an owner's membership, or removing owner authority.
--    Prevents owner self-demotion or loss of the last active owner.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SEC-001: RENT CHARGE INSERT INTEGRITY
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_rent_charge_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Boundary check 1: Reject forged non-zero amount_paid
    IF NEW.amount_paid IS NOT NULL AND NEW.amount_paid <> 0 THEN
        RAISE EXCEPTION 'Newly created rent charge cannot have amount_paid > 0 (attempted: % paise). Payments must be recorded through payment allocations.', NEW.amount_paid;
    END IF;

    -- Boundary check 2: Reject non-pending initial status (e.g. 'paid', 'partially_paid', 'waived')
    IF NEW.status IS NOT NULL AND NEW.status <> 'pending' THEN
        RAISE EXCEPTION 'Newly created rent charge must start with status ''pending'' (attempted: %)', NEW.status;
    END IF;

    -- Unconditionally enforce canonical initial values
    NEW.amount_paid := 0;
    NEW.status := 'pending';

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_rent_charge_before_insert ON public.rent_charges;

CREATE TRIGGER validate_rent_charge_before_insert
    BEFORE INSERT ON public.rent_charges
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_rent_charge_insert();

-- Revoke direct execution from untrusted roles
REVOKE ALL ON FUNCTION public.validate_rent_charge_insert() FROM PUBLIC, anon, authenticated;

-- Tighten INSERT RLS policy on public.rent_charges
DROP POLICY IF EXISTS "Authorized users can create rent charges" ON public.rent_charges;

CREATE POLICY "Authorized users can create rent charges"
ON public.rent_charges
FOR INSERT
TO authenticated
WITH CHECK (
    (
        public.is_business_admin(business_id)
        OR public.is_property_staff(property_id)
    )
    AND amount_paid = 0
    AND status = 'pending'
);

COMMENT ON FUNCTION public.validate_rent_charge_insert() IS
    'Guarantees all newly inserted rent charges initialize with amount_paid = 0 and status = pending, blocking forged payment status without allocations.';

COMMENT ON TRIGGER validate_rent_charge_before_insert ON public.rent_charges IS
    'Enforces amount_paid = 0 and status = pending before row insertion.';


-- ============================================================
-- 2. SEC-002: PROPERTY SELECT RLS ISOLATION
-- ============================================================

DROP POLICY IF EXISTS "Members can view accessible properties" ON public.properties;

CREATE POLICY "Members can view accessible properties"
ON public.properties
FOR SELECT
TO authenticated
USING (
    public.is_business_admin(business_id)
    OR public.is_property_staff(id)
);

COMMENT ON POLICY "Members can view accessible properties" ON public.properties IS
    'Allows business owners and admins to view all properties in their business, while restricting wardens strictly to assigned properties.';


-- ============================================================
-- 3. RLS-001: BUSINESS MEMBERSHIP ROLE ESCALATION
-- ============================================================

-- Helper: verify if the authenticated caller is an active owner of the business
CREATE OR REPLACE FUNCTION public.is_business_owner(
    target_business_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.business_members
        WHERE business_id = target_business_id
          AND user_id = (SELECT auth.uid())
          AND role = 'owner'
          AND status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.is_business_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_owner(uuid) TO authenticated;

-- Replace UPDATE policy on public.business_members
DROP POLICY IF EXISTS "Admins can update business memberships" ON public.business_members;
DROP POLICY IF EXISTS "Authorized members can update business memberships" ON public.business_members;

CREATE POLICY "Authorized members can update business memberships"
ON public.business_members
FOR UPDATE
TO authenticated
USING (
    public.is_business_owner(business_id)
    OR (
        public.is_business_admin(business_id)
        AND role <> 'owner'
    )
)
WITH CHECK (
    public.is_business_owner(business_id)
    OR (
        public.is_business_admin(business_id)
        AND role <> 'owner'
    )
);

-- BEFORE UPDATE validation trigger to enforce strict ownership rules and protect last active owner
CREATE OR REPLACE FUNCTION public.validate_business_member_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role text;
    v_caller_status text;
    v_active_owner_count integer;
BEGIN
    -- 1. Structural identifiers and creation timestamps are strictly immutable
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.business_id IS DISTINCT FROM OLD.business_id OR
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Cannot modify business membership structural identifiers or creation timestamp';
    END IF;

    v_caller_id := (SELECT auth.uid());

    -- If executed without an interactive authenticated user context (e.g. system migrations), allow immutable check and return
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 2. Fetch caller role and status within this business
    SELECT bm.role, bm.status
      INTO v_caller_role, v_caller_status
      FROM public.business_members bm
     WHERE bm.business_id = OLD.business_id
       AND bm.user_id = v_caller_id;

    IF v_caller_role IS NULL OR v_caller_status <> 'active' THEN
        RAISE EXCEPTION 'Only active business members can update business memberships';
    END IF;

    -- 3. Non-owner restrictions (Wardens and Admins)
    IF v_caller_role <> 'owner' THEN
        -- Wardens cannot update any memberships
        IF v_caller_role = 'warden' THEN
            RAISE EXCEPTION 'Wardens are not permitted to manage business memberships';
        END IF;

        -- Admins cannot modify or suspend owner memberships
        IF OLD.role = 'owner' THEN
            RAISE EXCEPTION 'Administrators cannot modify or suspend owner memberships';
        END IF;

        -- Admins cannot promote any member to owner
        IF NEW.role = 'owner' THEN
            RAISE EXCEPTION 'Administrators cannot promote members to owner; only active owners can manage ownership';
        END IF;
    END IF;

    -- 4. Owner protections (protect against owner self-demotion or loss of last active owner)
    IF OLD.role = 'owner' AND OLD.status = 'active' THEN
        IF NEW.role <> 'owner' OR NEW.status <> 'active' THEN
            -- Acquire transaction-level row lock on parent business to serialize concurrent ownership modifications
            PERFORM 1
            FROM public.businesses
            WHERE id = OLD.business_id
            FOR UPDATE;

            SELECT COUNT(*)
              INTO v_active_owner_count
              FROM public.business_members bm
             WHERE bm.business_id = OLD.business_id
               AND bm.role = 'owner'
               AND bm.status = 'active'
               AND bm.id <> OLD.id;

            IF v_active_owner_count = 0 THEN
                RAISE EXCEPTION 'Cannot demote, suspend, or remove the last active owner of the business';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_business_member_before_update ON public.business_members;

CREATE TRIGGER validate_business_member_before_update
    BEFORE UPDATE ON public.business_members
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_business_member_update();

REVOKE ALL ON FUNCTION public.validate_business_member_update() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.is_business_owner(uuid) IS
    'Returns true if authenticated user is an active owner of the business.';

COMMENT ON FUNCTION public.validate_business_member_update() IS
    'Enforces role hierarchy on membership updates: prevents admin self-promotion/owner modification and prevents loss of the last active owner.';

COMMENT ON POLICY "Authorized members can update business memberships" ON public.business_members IS
    'Allows owners full update rights; restricts admins to non-owner rows with non-owner target roles.';

COMMIT;
