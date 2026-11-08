-- Migration: 202611080011_rent_charge_security_hardening.sql
-- Description: Security hardening for rent_charges updates.
-- Enforces ledger parity, immutable fields, role-based update restrictions,
-- and strict pg_trigger_depth execution boundaries.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_rent_charge_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_depth INTEGER;
    v_ledger_paid BIGINT;
    v_is_admin BOOLEAN;
    v_expected_status TEXT;
BEGIN
    v_depth := pg_catalog.pg_trigger_depth();

    -- Calculate current active allocation total for this rent charge using allocated_amount
    SELECT COALESCE(SUM(pa.allocated_amount), 0)::BIGINT
      INTO v_ledger_paid
      FROM public.payment_allocations pa
     WHERE pa.rent_charge_id = OLD.id;

    -- Compute canonical payment-derived status matching sync_rent_charge_payment_status()
    IF v_ledger_paid = 0 THEN
        v_expected_status := 'pending';
    ELSIF v_ledger_paid < NEW.amount THEN
        v_expected_status := 'partially_paid';
    ELSIF v_ledger_paid = NEW.amount THEN
        v_expected_status := 'paid';
    ELSE
        RAISE EXCEPTION 'Ledger corruption detected: allocated amount (% paise) exceeds rent charge amount (% paise)',
            v_ledger_paid, NEW.amount;
    END IF;

    ---------------------------------------------------------------------------
    -- PATH A: NESTED SYNCHRONIZATION (depth = 2)
    -- Triggered strictly by sync_rent_charge_payment_status() via payment_allocations
    ---------------------------------------------------------------------------
    IF v_depth = 2 THEN
        -- Verify immutable financial, period, structural, and descriptive fields
        IF NEW.amount IS DISTINCT FROM OLD.amount OR
           NEW.period_start IS DISTINCT FROM OLD.period_start OR
           NEW.period_end IS DISTINCT FROM OLD.period_end OR
           NEW.due_date IS DISTINCT FROM OLD.due_date OR
           NEW.business_id IS DISTINCT FROM OLD.business_id OR
           NEW.property_id IS DISTINCT FROM OLD.property_id OR
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
           NEW.occupancy_id IS DISTINCT FROM OLD.occupancy_id OR
           NEW.created_by IS DISTINCT FROM OLD.created_by OR
           NEW.created_at IS DISTINCT FROM OLD.created_at OR
           NEW.description IS DISTINCT FROM OLD.description OR
           NEW.notes IS DISTINCT FROM OLD.notes THEN
            RAISE EXCEPTION 'Internal allocation synchronization cannot alter rent charge details or notes';
        END IF;

        -- Ensure amount_paid exactly matches ledger
        IF NEW.amount_paid <> v_ledger_paid THEN
            RAISE EXCEPTION 'Internal sync amount_paid (% paise) does not match ledger sum (% paise)',
                NEW.amount_paid, v_ledger_paid;
        END IF;

        -- If existing bill was waived, sync maintains 'waived'
        IF OLD.status = 'waived' THEN
            IF NEW.status <> 'waived' THEN
                RAISE EXCEPTION 'Internal sync cannot alter status of a waived rent charge';
            END IF;
        ELSE
            -- Ensure status matches computed ledger status exactly
            IF NEW.status <> v_expected_status THEN
                RAISE EXCEPTION 'Internal sync status (%) does not match expected ledger status (%)',
                    NEW.status, v_expected_status;
                END IF;
        END IF;

        RETURN NEW;

    ---------------------------------------------------------------------------
    -- PATH B: DIRECT CLIENT UPDATE (depth = 1)
    ---------------------------------------------------------------------------
    ELSIF v_depth = 1 THEN
        -- 1. Structural identifiers and audit creation metadata are strictly immutable
        IF NEW.id IS DISTINCT FROM OLD.id OR
           NEW.business_id IS DISTINCT FROM OLD.business_id OR
           NEW.property_id IS DISTINCT FROM OLD.property_id OR
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
           NEW.occupancy_id IS DISTINCT FROM OLD.occupancy_id OR
           NEW.created_by IS DISTINCT FROM OLD.created_by OR
           NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Cannot modify rent charge identifiers or creation metadata';
        END IF;

        -- 2. Direct modification of amount_paid is forbidden for all callers
        IF NEW.amount_paid IS DISTINCT FROM OLD.amount_paid THEN
            RAISE EXCEPTION 'amount_paid cannot be updated directly; it is managed exclusively by payment allocations';
        END IF;

        -- Check caller authorization via business admin check
        v_is_admin := public.is_business_admin(OLD.business_id);

        -- 3. Non-admin (Warden / Property Staff) update restrictions
        IF NOT v_is_admin THEN
            -- Wardens can ONLY update description and notes
            IF NEW.amount IS DISTINCT FROM OLD.amount OR
               NEW.status IS DISTINCT FROM OLD.status OR
               NEW.period_start IS DISTINCT FROM OLD.period_start OR
               NEW.period_end IS DISTINCT FROM OLD.period_end OR
               NEW.due_date IS DISTINCT FROM OLD.due_date THEN
                RAISE EXCEPTION 'Property staff may only modify rent charge description and notes';
            END IF;

            RETURN NEW;
        END IF;

        -- 4. Owner / Admin update restrictions
        -- Admins cannot modify bill amount if allocations already exist
        IF NEW.amount IS DISTINCT FROM OLD.amount AND v_ledger_paid > 0 THEN
            RAISE EXCEPTION 'Cannot modify rent charge amount (% paise) because % paise has already been allocated',
                OLD.amount, v_ledger_paid;
        END IF;

        -- Period validation
        IF NEW.period_end < NEW.period_start THEN
            RAISE EXCEPTION 'period_end cannot precede period_start';
        END IF;

        -- Status transition rules
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            -- Transition INTO waived: requires admin, zero ledger allocations, and zero amount paid
            IF NEW.status = 'waived' THEN
                IF v_ledger_paid > 0 OR OLD.amount_paid > 0 THEN
                    RAISE EXCEPTION 'Cannot waive a rent charge with existing payment allocations';
                END IF;
            -- Transition OUT OF waived: un-waiving must restore status to canonical ledger status
            ELSIF OLD.status = 'waived' THEN
                IF NEW.status <> v_expected_status THEN
                    RAISE EXCEPTION 'Restoring waived charge must set status to canonical ledger status (%)',
                        v_expected_status;
                END IF;
            -- Other direct status changes are disallowed; status is governed by payment allocations
            ELSE
                IF NEW.status <> v_expected_status THEN
                    RAISE EXCEPTION 'Direct status update to % is invalid; status is determined by payment allocations (expected: %)',
                        NEW.status, v_expected_status;
                END IF;
            END IF;
        END IF;

        RETURN NEW;

    ---------------------------------------------------------------------------
    -- PATH C: UNEXPECTED TRIGGER DEPTH (< 1 or > 2)
    ---------------------------------------------------------------------------
    ELSE
        RAISE EXCEPTION 'Unexpected trigger execution depth % for rent_charges update', v_depth;
    END IF;
END;
$$;

-- Drop trigger if it already exists to guarantee idempotent creation
DROP TRIGGER IF EXISTS validate_rent_charge_before_update ON public.rent_charges;

-- Create BEFORE UPDATE trigger on public.rent_charges
CREATE TRIGGER validate_rent_charge_before_update
    BEFORE UPDATE ON public.rent_charges
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_rent_charge_update();

-- Revoke direct RPC execution from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.validate_rent_charge_update() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_rent_charge_update() IS
    'Validates all UPDATE operations on rent_charges: guarantees ledger parity, immutability of core fields, warden restriction to notes/description, and admin-only waiver/un-waiver workflows.';

COMMENT ON TRIGGER validate_rent_charge_before_update ON public.rent_charges IS
    'Enforces financial integrity and authorization rules before any update to rent_charges.';

COMMIT;
