-- ==========================================
-- BINRO: STAGE 010 TENANT MANAGEMENT FIXES
-- Migration: 202611070007_tenant_management_fixes.sql
-- ==========================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. FIX: sync_bed_occupancy_status() trigger function
-- -----------------------------------------------------------------------------
-- Problem: The original trigger in Migration 003 unconditionally executed:
--   UPDATE public.beds SET status = 'occupied' WHERE id = NEW.bed_id AND status = 'available'
-- whenever NEW.status = 'active'.
-- On an UPDATE to an active occupancy that modified metadata (notes, expected checkout date,
-- or monthly rent) while keeping the same bed, the bed was already 'occupied'.
-- The query matched 0 rows and raised "Selected bed is not available for occupancy".
--
-- Solution:
-- - On TG_OP = 'UPDATE': release OLD.bed_id to 'available' if it was active and is
--   either transitioning away from 'active' OR moving to a different bed.
-- - On TG_OP = 'INSERT': claim NEW.bed_id only if NEW.status = 'active' and status is 'available'.
-- - On TG_OP = 'UPDATE': claim NEW.bed_id only if NEW.status = 'active' AND
--   (OLD.status <> 'active' OR NEW.bed_id <> OLD.bed_id).
--   If NEW.status = 'active' and bed_id is unchanged, the bed is already occupied by this stay;
--   no status modification is performed.

CREATE OR REPLACE FUNCTION public.sync_bed_occupancy_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A. Handle UPDATE: release old bed if previously active and either:
  --    1. Status is changing away from 'active' (checkout or cancellation), OR
  --    2. Bed is being changed to a different bed (bed transfer)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active'
       AND (
         NEW.status <> 'active'
         OR NEW.bed_id <> OLD.bed_id
       )
    THEN
      UPDATE public.beds
      SET status = 'available'
      WHERE id = OLD.bed_id
        AND status = 'occupied';
    END IF;
  END IF;

  -- B. Handle INSERT: claim new bed if occupancy is active
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      UPDATE public.beds
      SET status = 'occupied'
      WHERE id = NEW.bed_id
        AND status = 'available';

      IF NOT FOUND THEN
        RAISE EXCEPTION
          'Selected bed is not available for occupancy';
      END IF;
    END IF;

  -- C. Handle UPDATE: claim new bed ONLY when:
  --    1. Re-activating an inactive stay (OLD.status <> 'active'), OR
  --    2. Transferring to a new bed (NEW.bed_id <> OLD.bed_id)
  --    Note: If status remains 'active' and bed_id is unchanged, the bed is
  --    already occupied by this stay; no modification is needed.
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'active'
       AND (
         OLD.status <> 'active'
         OR NEW.bed_id <> OLD.bed_id
       )
    THEN
      UPDATE public.beds
      SET status = 'occupied'
      WHERE id = NEW.bed_id
        AND status = 'available';

      IF NOT FOUND THEN
        RAISE EXCEPTION
          'Selected bed is not available for occupancy';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. REVISE TENANT SELECT RLS POLICY
-- -----------------------------------------------------------------------------
-- Existing policy in Migration 003:
--   CREATE POLICY "Authorized users can view tenants"
--   ON public.tenants FOR SELECT TO authenticated
--   USING (
--     public.is_business_admin(business_id)
--     OR EXISTS (
--       SELECT 1 FROM public.occupancies o
--       WHERE o.tenant_id = tenants.id
--         AND o.status = 'active'
--         AND public.is_property_staff(o.property_id)
--     )
--   );
--
-- Limitation: The "AND o.status = 'active'" clause prevented wardens from viewing
-- past/checked-out tenants who previously stayed at their assigned property.
--
-- Correction: Drop and recreate "Authorized users can view tenants" to allow wardens
-- to view tenants connected through any occupancy (active OR completed) at their assigned property.

DROP POLICY IF EXISTS "Authorized users can view tenants" ON public.tenants;

CREATE POLICY "Authorized users can view tenants"
ON public.tenants
FOR SELECT TO authenticated
USING (
  public.is_business_admin(business_id)
  OR EXISTS (
    SELECT 1
    FROM public.occupancies o
    WHERE o.tenant_id = tenants.id
      AND public.is_property_staff(o.property_id)
  )
);

-- RETAINED POLICIES ON public.tenants (UNTOUCHED):
-- 1. "Admins can create tenants" (INSERT):
--    WITH CHECK (public.is_business_admin(business_id))
--    Retained. Wardens CANNOT directly INSERT into public.tenants.
-- 2. "Admins can update tenants" (UPDATE):
--    USING (public.is_business_admin(business_id)) WITH CHECK (public.is_business_admin(business_id))
--    Retained. Wardens CANNOT directly UPDATE public.tenants via table queries.
--    Admins retain direct update capabilities. Wardens must use update_tenant_profile.
-- 3. "Admins can delete tenants" (DELETE):
--    USING (public.is_business_admin(business_id))
--    Retained. Wardens CANNOT delete tenants.


-- -----------------------------------------------------------------------------
-- 3. ATOMIC PROPERTY-SCOPED TENANT REGISTRATION RPC
-- -----------------------------------------------------------------------------
-- Enables authorized staff (owners, admins, and assigned wardens) to register a new
-- tenant and create their initial occupancy atomically in a single transaction.

CREATE OR REPLACE FUNCTION public.register_tenant_with_occupancy(
  p_business_id UUID,
  p_property_id UUID,
  p_room_id UUID,
  p_bed_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL,
  p_emergency_contact TEXT DEFAULT NULL,
  p_emergency_contact_name TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_gender TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_identity_type TEXT DEFAULT NULL,
  p_identity_reference TEXT DEFAULT NULL,
  p_tenant_notes TEXT DEFAULT NULL,
  p_check_in_date DATE DEFAULT CURRENT_DATE,
  p_expected_check_out_date DATE DEFAULT NULL,
  p_monthly_rent BIGINT DEFAULT 0,
  p_security_deposit BIGINT DEFAULT 0,
  p_occupancy_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_tenant_id UUID;
  v_occupancy_id UUID;
  v_bed_status TEXT;
  v_result JSONB;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Validate property belongs to business and is active
  IF NOT EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = p_property_id
      AND p.business_id = p_business_id
      AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Property does not exist, is inactive/archived, or does not belong to this business.';
  END IF;

  -- 3. Verify caller authorization: business admin OR assigned property staff
  IF NOT (
    public.is_business_admin(p_business_id)
    OR public.is_property_staff(p_property_id)
  ) THEN
    RAISE EXCEPTION 'Access denied: You do not have permission to check in tenants at this property.';
  END IF;

  -- 4. Validate room belongs to property and is active
  IF NOT EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = p_room_id
      AND r.property_id = p_property_id
      AND r.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Room does not exist, is inactive/under maintenance, or does not belong to this property.';
  END IF;

  -- 5. Validate bed belongs to room
  IF NOT EXISTS (
    SELECT 1 FROM public.beds b
    WHERE b.id = p_bed_id
      AND b.room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'Bed does not belong to the selected room.';
  END IF;

  -- 6. Lock bed row and verify availability (race-condition safe)
  SELECT status INTO v_bed_status
  FROM public.beds
  WHERE id = p_bed_id
  FOR UPDATE;

  IF v_bed_status <> 'available' THEN
    RAISE EXCEPTION 'Selected bed is not available for occupancy (current status: %).', v_bed_status;
  END IF;

  -- 7. Validate inputs
  IF trim(coalesce(p_full_name, '')) = '' THEN
    RAISE EXCEPTION 'Tenant full name cannot be blank.';
  END IF;

  IF trim(coalesce(p_phone, '')) = '' THEN
    RAISE EXCEPTION 'Tenant phone number cannot be blank.';
  END IF;

  IF p_gender IS NOT NULL AND p_gender NOT IN ('male', 'female', 'other', 'prefer_not_to_say') THEN
    RAISE EXCEPTION 'Invalid gender value: %', p_gender;
  END IF;

  IF p_monthly_rent < 0 THEN
    RAISE EXCEPTION 'Monthly rent cannot be negative.';
  END IF;

  IF p_security_deposit < 0 THEN
    RAISE EXCEPTION 'Security deposit cannot be negative.';
  END IF;

  IF p_expected_check_out_date IS NOT NULL AND p_expected_check_out_date < coalesce(p_check_in_date, CURRENT_DATE) THEN
    RAISE EXCEPTION 'Expected check-out date cannot precede check-in date.';
  END IF;

  -- 8. Insert Tenant Record
  INSERT INTO public.tenants (
    business_id,
    full_name,
    phone,
    email,
    emergency_contact,
    emergency_contact_name,
    date_of_birth,
    gender,
    address,
    identity_type,
    identity_reference,
    notes,
    status
  ) VALUES (
    p_business_id,
    trim(p_full_name),
    trim(p_phone),
    nullif(trim(p_email), ''),
    nullif(trim(p_emergency_contact), ''),
    nullif(trim(p_emergency_contact_name), ''),
    p_date_of_birth,
    p_gender,
    nullif(trim(p_address), ''),
    nullif(trim(p_identity_type), ''),
    nullif(trim(p_identity_reference), ''),
    nullif(trim(p_tenant_notes), ''),
    'active'
  )
  RETURNING id INTO v_tenant_id;

  -- 9. Insert Occupancy Record
  -- Bed status sync trigger will transition bed status from 'available' to 'occupied'.
  INSERT INTO public.occupancies (
    business_id,
    property_id,
    tenant_id,
    room_id,
    bed_id,
    check_in_date,
    expected_check_out_date,
    monthly_rent,
    security_deposit,
    notes,
    status,
    created_by
  ) VALUES (
    p_business_id,
    p_property_id,
    v_tenant_id,
    p_room_id,
    p_bed_id,
    coalesce(p_check_in_date, CURRENT_DATE),
    p_expected_check_out_date,
    p_monthly_rent,
    p_security_deposit,
    nullif(trim(p_occupancy_notes), ''),
    'active',
    v_caller_id
  )
  RETURNING id INTO v_occupancy_id;

  -- 10. Assemble response JSON
  SELECT jsonb_build_object(
    'tenant_id', v_tenant_id,
    'occupancy_id', v_occupancy_id,
    'property_id', p_property_id,
    'room_id', p_room_id,
    'bed_id', p_bed_id,
    'check_in_date', coalesce(p_check_in_date, CURRENT_DATE),
    'status', 'active'
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. RESTRICTED TENANT PROFILE UPDATE RPC
-- -----------------------------------------------------------------------------
-- Enables wardens to edit ONLY approved basic tenant fields (name, phone, email,
-- emergency contacts, and address).
-- Wardens CANNOT modify business_id, tenant status, identity_type, identity_reference,
-- or administrative notes. Direct table UPDATE on public.tenants remains blocked
-- for wardens by the "Admins can update tenants" RLS policy.

CREATE OR REPLACE FUNCTION public.update_tenant_profile(
  p_tenant_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL,
  p_emergency_contact TEXT DEFAULT NULL,
  p_emergency_contact_name TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_business_id UUID;
  v_is_admin BOOLEAN;
  v_has_access BOOLEAN;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Fetch tenant business association
  SELECT business_id
  INTO v_business_id
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found.';
  END IF;

  -- 3. Check authorization
  v_is_admin := public.is_business_admin(v_business_id);

  IF NOT v_is_admin THEN
    -- For wardens: verify the tenant has an occupancy at a property assigned to this warden
    SELECT EXISTS (
      SELECT 1
      FROM public.occupancies o
      WHERE o.tenant_id = p_tenant_id
        AND o.business_id = v_business_id
        AND public.is_property_staff(o.property_id)
    ) INTO v_has_access;

    IF NOT v_has_access THEN
      RAISE EXCEPTION 'Access denied: You do not have permission to edit this tenant.';
    END IF;
  END IF;

  -- 4. Validate inputs
  IF trim(coalesce(p_full_name, '')) = '' THEN
    RAISE EXCEPTION 'Tenant full name cannot be blank.';
  END IF;

  IF trim(coalesce(p_phone, '')) = '' THEN
    RAISE EXCEPTION 'Tenant phone number cannot be blank.';
  END IF;

  -- 5. Update strictly approved basic columns only
  UPDATE public.tenants
  SET
    full_name = trim(p_full_name),
    phone = trim(p_phone),
    email = nullif(trim(p_email), ''),
    emergency_contact = nullif(trim(p_emergency_contact), ''),
    emergency_contact_name = nullif(trim(p_emergency_contact_name), ''),
    address = nullif(trim(p_address), ''),
    updated_at = now()
  WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 5. HARDEN EXECUTION PERMISSIONS ON RPC FUNCTIONS
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.register_tenant_with_occupancy(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, BIGINT, BIGINT, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_tenant_with_occupancy(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, BIGINT, BIGINT, TEXT
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_tenant_profile(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_tenant_profile(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

COMMIT;

-- ==========================================
-- END OF MIGRATION 007
-- ==========================================
