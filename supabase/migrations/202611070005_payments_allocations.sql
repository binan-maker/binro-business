
-- ==========================================
-- BINRO: PAYMENTS & PAYMENT ALLOCATIONS
-- Migration: 202611070005_payments_allocations.sql
-- ==========================================


-- 1. Add a composite key to rent_charges.
-- This lets allocations verify that the payment
-- and rent bill belong to the same business,
-- property and tenant.

ALTER TABLE public.rent_charges
ADD CONSTRAINT rent_charges_full_reference_unique
UNIQUE (id, business_id, property_id, tenant_id);


-- 2. Payments
-- Each row represents money actually received.
-- Amounts are stored in paise.

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id UUID NOT NULL,
  property_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  amount BIGINT NOT NULL CHECK (amount > 0),

  payment_method TEXT NOT NULL
    CHECK (
      payment_method IN (
        'cash',
        'upi',
        'bank_transfer',
        'other'
      )
    ),

  transaction_reference TEXT,
  notes TEXT,

  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'reversed')),

  recorded_by UUID REFERENCES public.profiles(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (business_id)
    REFERENCES public.businesses(id),

  FOREIGN KEY (property_id, business_id)
    REFERENCES public.properties(id, business_id),

  FOREIGN KEY (tenant_id, business_id)
    REFERENCES public.tenants(id, business_id),

  UNIQUE (id, business_id, property_id, tenant_id)
);


-- 3. Payment allocations
-- Connects one payment to one rent charge.
-- A payment can have multiple allocation rows.
-- A rent charge can receive multiple payments.

CREATE TABLE public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  payment_id UUID NOT NULL,
  rent_charge_id UUID NOT NULL,

  business_id UUID NOT NULL,
  property_id UUID NOT NULL,
  tenant_id UUID NOT NULL,

  allocated_amount BIGINT NOT NULL
    CHECK (allocated_amount > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (
    payment_id,
    business_id,
    property_id,
    tenant_id
  )
  REFERENCES public.payments (
    id,
    business_id,
    property_id,
    tenant_id
  ),

  FOREIGN KEY (
    rent_charge_id,
    business_id,
    property_id,
    tenant_id
  )
  REFERENCES public.rent_charges (
    id,
    business_id,
    property_id,
    tenant_id
  ),

  UNIQUE (payment_id, rent_charge_id)
);


-- 4. Indexes

CREATE INDEX payments_business_idx
ON public.payments (business_id);

CREATE INDEX payments_property_idx
ON public.payments (property_id);

CREATE INDEX payments_tenant_idx
ON public.payments (tenant_id);

CREATE INDEX payments_paid_at_idx
ON public.payments (paid_at DESC);

CREATE INDEX payments_status_idx
ON public.payments (status);

CREATE INDEX payment_allocations_payment_idx
ON public.payment_allocations (payment_id);

CREATE INDEX payment_allocations_rent_charge_idx
ON public.payment_allocations (rent_charge_id);

CREATE INDEX payment_allocations_business_idx
ON public.payment_allocations (business_id);


-- 5. Prevent invalid payment edits and reversal.
-- A payment with allocations cannot have its amount
-- changed or be reversed until its allocations
-- have been removed.

CREATE OR REPLACE FUNCTION public.validate_payment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.amount <> NEW.amount
     AND EXISTS (
       SELECT 1
       FROM public.payment_allocations pa
       WHERE pa.payment_id = OLD.id
     )
  THEN
    RAISE EXCEPTION
      'Cannot change payment amount while allocations exist';
  END IF;

  IF OLD.status = 'reversed' AND NEW.status <> 'reversed' THEN
    RAISE EXCEPTION
      'A reversed payment cannot be restored';
  END IF;

  IF NEW.status = 'reversed'
     AND EXISTS (
       SELECT 1
       FROM public.payment_allocations pa
       WHERE pa.payment_id = OLD.id
     )
  THEN
    RAISE EXCEPTION
      'Remove payment allocations before reversing this payment';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_payment_before_update
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.validate_payment_update();


-- 6. Validate allocations and serialize concurrent
-- allocation operations by locking their parent rows.

CREATE OR REPLACE FUNCTION public.validate_payment_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_amount BIGINT;
  v_payment_status TEXT;
  v_rent_amount BIGINT;
  v_rent_status TEXT;
  v_payment_allocated NUMERIC;
  v_rent_allocated NUMERIC;
BEGIN

  IF TG_OP = 'INSERT' THEN

    -- Lock payment first.
    SELECT amount, status
    INTO v_payment_amount, v_payment_status
    FROM public.payments
    WHERE id = NEW.payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment not found';
    END IF;

    IF v_payment_status <> 'received' THEN
      RAISE EXCEPTION
        'Only received payments can be allocated';
    END IF;

    -- Lock rent charge.
    SELECT amount, status
    INTO v_rent_amount, v_rent_status
    FROM public.rent_charges
    WHERE id = NEW.rent_charge_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rent charge not found';
    END IF;

    IF v_rent_status = 'waived' THEN
      RAISE EXCEPTION
        'Cannot allocate payments to a waived rent charge';
    END IF;

    -- Existing allocation total for this payment.
    SELECT COALESCE(SUM(allocated_amount), 0)
    INTO v_payment_allocated
    FROM public.payment_allocations
    WHERE payment_id = NEW.payment_id;

    IF v_payment_allocated + NEW.allocated_amount
       > v_payment_amount THEN
      RAISE EXCEPTION
        'Allocation exceeds the available payment amount';
    END IF;

    -- Existing allocation total for this rent charge.
    SELECT COALESCE(SUM(allocated_amount), 0)
    INTO v_rent_allocated
    FROM public.payment_allocations
    WHERE rent_charge_id = NEW.rent_charge_id;

    IF v_rent_allocated + NEW.allocated_amount
       > v_rent_amount THEN
      RAISE EXCEPTION
        'Allocation exceeds the outstanding rent amount';
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN

    -- Lock parent rows before removing the allocation.
    PERFORM 1
    FROM public.payments
    WHERE id = OLD.payment_id
    FOR UPDATE;

    PERFORM 1
    FROM public.rent_charges
    WHERE id = OLD.rent_charge_id
    FOR UPDATE;

    RETURN OLD;

  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER validate_payment_allocation_before_change
BEFORE INSERT OR DELETE ON public.payment_allocations
FOR EACH ROW
EXECUTE FUNCTION public.validate_payment_allocation();


-- 7. Automatically recalculate rent paid amount
-- and status after allocation changes.

CREATE OR REPLACE FUNCTION public.sync_rent_charge_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rent_charge_id UUID;
  v_total_paid BIGINT;
BEGIN

  IF TG_OP = 'INSERT' THEN
    v_rent_charge_id := NEW.rent_charge_id;
  ELSE
    v_rent_charge_id := OLD.rent_charge_id;
  END IF;

  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_total_paid
  FROM public.payment_allocations
  WHERE rent_charge_id = v_rent_charge_id;

  UPDATE public.rent_charges
  SET
    amount_paid = v_total_paid,
    status = CASE
      WHEN status = 'waived' THEN 'waived'
      WHEN v_total_paid = 0 THEN 'pending'
      WHEN v_total_paid < amount THEN 'partially_paid'
      ELSE 'paid'
    END
  WHERE id = v_rent_charge_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_rent_charge_after_allocation
AFTER INSERT OR DELETE ON public.payment_allocations
FOR EACH ROW
EXECUTE FUNCTION public.sync_rent_charge_payment_status();


-- 8. Updated-at triggers.

CREATE TRIGGER payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- 9. Enable Row Level Security.

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;


-- 10. Payment policies.

-- Owners/admins and assigned wardens can view payments.

CREATE POLICY "Authorized users can view payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);


-- Owners/admins and assigned wardens can record payments.

CREATE POLICY "Authorized users can record payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);


-- Only owners/admins can update payment records.
-- This is needed for controlled payment reversals.

CREATE POLICY "Admins can update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (public.is_business_admin(business_id))
WITH CHECK (public.is_business_admin(business_id));


-- No payment DELETE policy.
-- Payment history must be preserved.


-- 11. Payment allocation policies.

CREATE POLICY "Authorized users can view payment allocations"
ON public.payment_allocations
FOR SELECT
TO authenticated
USING (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);


CREATE POLICY "Authorized users can create payment allocations"
ON public.payment_allocations
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_business_admin(business_id)
  OR public.is_property_staff(property_id)
);


-- Only owners/admins can remove allocations.
-- Corrections should be controlled and auditable.

CREATE POLICY "Admins can delete payment allocations"
ON public.payment_allocations
FOR DELETE
TO authenticated
USING (
  public.is_business_admin(business_id)
);


-- No UPDATE policy for allocations.
-- Correct an allocation by deleting and recreating it.


-- ==========================================
-- END OF MIGRATION 005
-- ==========================================
