
-- ==========================================
-- BINRO: TENANTS & OCCUPANCY
-- Migration: 202611070003_tenants_occupancy.sql
-- ==========================================

-- 1. Add a composite key to beds so an occupancy
-- can verify that its bed belongs to the correct room.

ALTER TABLE public.beds
ADD CONSTRAINT beds_id_room_unique
UNIQUE (id, room_id);


-- 2. Tenants
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id UUID NOT NULL
    REFERENCES public.businesses(id) ON DELETE CASCADE,

  full_name TEXT NOT NULL
    CHECK (length(trim(full_name)) > 0),

  phone TEXT NOT NULL,
  email TEXT,
  emergency_contact TEXT,
  emergency_contact_name TEXT,

  date_of_birth DATE,
  gender TEXT
    CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),

  address TEXT,
  identity_type TEXT,
  identity_reference TEXT,

  notes TEXT,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (id, business_id)
);


-- 3. Occupancies
-- Every stay is a separate record.
-- Checking out does not delete the tenant or their history.

CREATE TABLE public.occupancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id UUID NOT NULL,
  property_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  room_id UUID NOT NULL,
  bed_id UUID NOT NULL,

  check_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_check_out_date DATE,
  check_out_date DATE,

  monthly_rent BIGINT NOT NULL DEFAULT 0
    CHECK (monthly_rent >= 0),

  security_deposit BIGINT NOT NULL DEFAULT 0
    CHECK (security_deposit >= 0),

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),

  notes TEXT,

  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Tenant must belong to the same business.
  FOREIGN KEY (tenant_id, business_id)
    REFERENCES public.tenants(id, business_id),

  -- Property must belong to the same business.
  FOREIGN KEY (property_id, business_id)
    REFERENCES public.properties(id, business_id),

  -- Room must belong to the selected property.
  FOREIGN KEY (room_id, property_id)
    REFERENCES public.rooms(id, property_id),

  -- Bed must belong to the selected room.
  FOREIGN KEY (bed_id, room_id)
    REFERENCES public.beds(id, room_id),

  CHECK (
    expected_check_out_date IS NULL
    OR expected_check_out_date >= check_in_date
  ),

  CHECK (
    check_out_date IS NULL
    OR check_out_date >= check_in_date
  ),

  CHECK (
    (status = 'active' AND check_out_date IS NULL)
    OR
    (status IN ('completed', 'cancelled') AND check_out_date IS NOT NULL)
  )
);


-- 4. Prevent multiple active occupancies for one bed.
CREATE UNIQUE INDEX one_active_occupancy_per_bed
ON public.occupancies (bed_id)
WHERE status = 'active';


-- 5. Prevent a tenant from having multiple active stays.
CREATE UNIQUE INDEX one_active_occupancy_per_tenant
ON public.occupancies (tenant_id)
WHERE status = 'active';


-- 6. Useful indexes for common queries.
CREATE INDEX tenants_business_id_idx
ON public.tenants (business_id);

CREATE INDEX occupancies_business_id_idx
ON public.occupancies (business_id);

CREATE INDEX occupancies_property_id_idx
ON public.occupancies (property_id);

CREATE INDEX occupancies_tenant_id_idx
ON public.occupancies (tenant_id);

CREATE INDEX occupancies_bed_id_idx
ON public.occupancies (bed_id);


-- 7. Keep bed availability synchronized with occupancy.
-- Occupancy is the source of truth for whether a bed is occupied.

CREATE OR REPLACE FUNCTION public.sync_bed_occupancy_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_bed_status_after_occupancy
AFTER INSERT OR UPDATE ON public.occupancies
FOR EACH ROW
EXECUTE FUNCTION public.sync_bed_occupancy_status();


-- 8. Updated-at triggers.
CREATE TRIGGER tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER occupancies_updated_at
BEFORE UPDATE ON public.occupancies
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- 9. Enable Row Level Security.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occupancies ENABLE ROW LEVEL SECURITY;


-- 10. Tenant policies.

-- Owners and admins can view all tenants in their business.
-- Wardens can view tenants staying in their assigned properties.

CREATE POLICY "Authorized users can view tenants"
ON public.tenants
FOR SELECT TO authenticated
USING (
  public.is_business_admin(business_id)
  OR EXISTS (
    SELECT 1
    FROM public.occupancies o
    WHERE o.tenant_id = tenants.id
      AND o.status = 'active'
      AND public.is_property_staff(o.property_id)
  )
);

CREATE POLICY "Admins can create tenants"
ON public.tenants
FOR INSERT TO authenticated
WITH CHECK (
  public.is_business_admin(business_id)
);

CREATE POLICY "Admins can update tenants"
ON public.tenants
FOR UPDATE TO authenticated
USING (
  public.is_business_admin(business_id)
)
WITH CHECK (
  public.is_business_admin(business_id)
);

CREATE POLICY "Admins can delete tenants"
ON public.tenants
FOR DELETE TO authenticated
USING (
  public.is_business_admin(business_id)
);


-- 11. Occupancy policies.

-- Owners/admins see all occupancy records in their business.
-- Wardens see occupancy records for assigned properties.

CREATE POLICY "Authorized users can view occupancies"
ON public.occupancies
FOR SELECT TO authenticated
USING (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);

CREATE POLICY "Authorized users can create occupancies"
ON public.occupancies
FOR INSERT TO authenticated
WITH CHECK (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);

CREATE POLICY "Authorized users can update occupancies"
ON public.occupancies
FOR UPDATE TO authenticated
USING (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
)
WITH CHECK (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);

CREATE POLICY "Admins can delete occupancies"
ON public.occupancies
FOR DELETE TO authenticated
USING (
  public.is_business_admin(business_id)
);


-- ==========================================
-- END OF MIGRATION 003
-- ==========================================
