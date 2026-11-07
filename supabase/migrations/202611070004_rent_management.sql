
-- ==========================================
-- BINRO: RENT MANAGEMENT
-- Migration: 202611070004_rent_management.sql
-- ==========================================

-- 1. Add a composite key to occupancies.
-- This ensures every rent charge belongs to the
-- correct tenant, property and business.

ALTER TABLE public.occupancies
ADD CONSTRAINT occupancies_full_reference_unique
UNIQUE (id, business_id, property_id, tenant_id);


-- 2. Rent charges
CREATE TABLE public.rent_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id UUID NOT NULL,
  property_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  occupancy_id UUID NOT NULL,

  -- Billing period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,

  -- Amounts stored in paise.
  amount BIGINT NOT NULL CHECK (amount > 0),
  amount_paid BIGINT NOT NULL DEFAULT 0
    CHECK (amount_paid >= 0),

  -- Payment status will be maintained by
  -- the payment allocation system in Migration 005.
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'partially_paid',
        'paid',
        'waived'
      )
    ),

  description TEXT,
  notes TEXT,

  created_by UUID REFERENCES public.profiles(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Validate billing period.
  CHECK (period_end >= period_start),

  -- A rent bill cannot be overpaid.
  CHECK (amount_paid <= amount),

  -- Ensure this occupancy belongs to the
  -- selected business, property and tenant.
  FOREIGN KEY (
    occupancy_id,
    business_id,
    property_id,
    tenant_id
  )
  REFERENCES public.occupancies (
    id,
    business_id,
    property_id,
    tenant_id
  ),

  -- Avoid duplicate bills for the same occupancy
  -- and billing period start date.
  UNIQUE (occupancy_id, period_start)
);


-- 3. Indexes for faster rent queries.
CREATE INDEX rent_charges_business_idx
ON public.rent_charges (business_id);

CREATE INDEX rent_charges_property_idx
ON public.rent_charges (property_id);

CREATE INDEX rent_charges_tenant_idx
ON public.rent_charges (tenant_id);

CREATE INDEX rent_charges_occupancy_idx
ON public.rent_charges (occupancy_id);

CREATE INDEX rent_charges_due_date_idx
ON public.rent_charges (due_date);

CREATE INDEX rent_charges_status_idx
ON public.rent_charges (status);


-- 4. Updated-at trigger.
CREATE TRIGGER rent_charges_updated_at
BEFORE UPDATE ON public.rent_charges
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- 5. Enable Row Level Security.
ALTER TABLE public.rent_charges
ENABLE ROW LEVEL SECURITY;


-- 6. View rent charges.
-- Owners/admins can see all rent in their business.
-- Wardens can see rent for their assigned properties.

CREATE POLICY "Authorized users can view rent charges"
ON public.rent_charges
FOR SELECT
TO authenticated
USING (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);


-- 7. Create rent charges.
CREATE POLICY "Authorized users can create rent charges"
ON public.rent_charges
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);


-- 8. Update rent charges.
CREATE POLICY "Authorized users can update rent charges"
ON public.rent_charges
FOR UPDATE
TO authenticated
USING (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
)
WITH CHECK (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);


-- 9. Delete rent charges.
-- Only owners/admins can delete rent charges.

CREATE POLICY "Admins can delete rent charges"
ON public.rent_charges
FOR DELETE
TO authenticated
USING (
  public.is_business_admin(business_id)
);


-- ==========================================
-- END OF MIGRATION 004
-- ==========================================
