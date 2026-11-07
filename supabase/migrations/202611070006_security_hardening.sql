BEGIN;

-- =========================================================
-- 1. PRE-FLIGHT: confirm all 13 tables exist and have RLS
-- =========================================================

DO $$
DECLARE
    expected_tables TEXT[] := ARRAY[
        'profiles',
        'businesses',
        'business_members',
        'properties',
        'property_staff',
        'floors',
        'rooms',
        'beds',
        'tenants',
        'occupancies',
        'rent_charges',
        'payments',
        'payment_allocations'
    ];

    missing_count INTEGER;
    rls_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO missing_count
    FROM unnest(expected_tables) AS expected(table_name)
    WHERE to_regclass(format('public.%I', expected.table_name)) IS NULL;

    IF missing_count > 0 THEN
        RAISE EXCEPTION
            'Migration 006 stopped: one or more expected tables are missing.';
    END IF;

    SELECT COUNT(*)
    INTO rls_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY(expected_tables)
      AND c.relrowsecurity = TRUE;

    IF rls_count <> cardinality(expected_tables) THEN
        RAISE EXCEPTION
            'Migration 006 stopped: RLS is not enabled on all 13 expected tables.';
    END IF;
END;
$$;


-- =========================================================
-- 2. REMOVE EXCESSIVE TABLE PERMISSIONS
-- =========================================================

REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
FROM PUBLIC, anon, authenticated;


-- =========================================================
-- 3. GRANT ONLY REQUIRED TABLE PERMISSIONS TO AUTHENTICATED
-- =========================================================

-- User profiles
GRANT SELECT, UPDATE
ON TABLE public.profiles
TO authenticated;

-- Business account
GRANT SELECT, INSERT, UPDATE
ON TABLE public.businesses
TO authenticated;

-- Membership: no direct INSERT or DELETE
GRANT SELECT, UPDATE
ON TABLE public.business_members
TO authenticated;

-- Properties
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.properties
TO authenticated;

-- Property staff assignments
GRANT SELECT, INSERT, DELETE
ON TABLE public.property_staff
TO authenticated;

-- Floors
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.floors
TO authenticated;

-- Rooms
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.rooms
TO authenticated;

-- Beds
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.beds
TO authenticated;

-- Tenants
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.tenants
TO authenticated;

-- Occupancies
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.occupancies
TO authenticated;

-- Rent charges
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.rent_charges
TO authenticated;

-- Payments: no direct DELETE
GRANT SELECT, INSERT, UPDATE
ON TABLE public.payments
TO authenticated;

-- Payment allocations: no direct UPDATE
GRANT SELECT, INSERT, DELETE
ON TABLE public.payment_allocations
TO authenticated;


-- =========================================================
-- 4. REMOVE EXCESSIVE SEQUENCE PERMISSIONS
-- =========================================================

REVOKE ALL PRIVILEGES
ON ALL SEQUENCES IN SCHEMA public
FROM PUBLIC, anon, authenticated;


-- =========================================================
-- 5. RESTRICT DIRECT EXECUTION OF TRIGGER FUNCTIONS
-- =========================================================

REVOKE EXECUTE ON FUNCTION public.add_business_owner()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.set_updated_at()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_bed_occupancy_status()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_rent_charge_payment_status()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_payment_allocation()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_payment_update()
FROM PUBLIC, anon, authenticated;


-- =========================================================
-- 6. GRANT EXECUTION OF RLS HELPER FUNCTIONS
-- =========================================================

REVOKE EXECUTE ON FUNCTION public.is_business_admin(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_business_admin(uuid)
TO authenticated;


REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_business_member(uuid)
TO authenticated;


REVOKE EXECUTE ON FUNCTION public.is_property_staff(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_property_staff(uuid)
TO authenticated;


REVOKE EXECUTE ON FUNCTION public.can_manage_property(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_manage_property(uuid)
TO authenticated;


-- =========================================================
-- 7. HARDEN FUTURE OBJECT DEFAULT PRIVILEGES
-- These commands apply to objects created by postgres.
-- We deliberately do not alter supabase_admin defaults.
-- =========================================================

-- Future tables
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

-- Future sequences
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- Future functions: remove default PUBLIC execution
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Future public-schema functions: remove anon/authenticated execution
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;


COMMIT;