import { createClient } from "@/lib/supabase/client";
import type { Payment, RecordPaymentPayload, UserRole } from "@/types/app.types";
import { getPaymentPermissions, type PaymentPermissions } from "@/lib/permissions/payment.permissions";
import { isValidId, validatePaymentAllocationInput } from "@/lib/validations/payment.validation";

export interface PaymentWithTenant extends Payment {
  tenant_name?: string;
  property_name?: string;
  allocations_summary?: string;
  allocated_paise?: number;
}

export interface PaymentAllocationDetail {
  id: string;
  payment_id: string;
  rent_charge_id: string;
  business_id: string;
  property_id: string;
  tenant_id: string;
  allocated_amount: number;
  created_at: string;
  rent_charge?: {
    id: string;
    period_start: string;
    period_end: string;
    amount: number;
    amount_paid: number;
    status: string;
    description?: string | null;
  };
}

export interface PaymentStats {
  totalCollected: number;
  thisMonthCollected: number;
  totalTransactions: number;
  methodCounts: {
    upi: number;
    cash: number;
    bank_transfer: number;
    other: number;
  };
  methodAmounts: {
    upi: number;
    cash: number;
    bank_transfer: number;
    other: number;
  };
}

export const paymentService = {
  async getUserPaymentPermissions(businessId: string): Promise<{
    role: UserRole | null;
    permissions: PaymentPermissions;
    userId: string | null;
    assignedPropertyIds: string[] | null;
  }> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      const permissions = getPaymentPermissions(null, null);
      return { role: null, permissions, userId: null, assignedPropertyIds: null };
    }

    const { data: members, error: memError } = await supabase
      .from("business_members")
      .select("id, role, status")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1);

    let role: UserRole | null = null;
    let memberId: string | null = null;

    if (!memError && members && members.length > 0) {
      role = members[0].role as UserRole;
      memberId = members[0].id;
    } else {
      const { data: biz } = await supabase
        .from("businesses")
        .select("id, owner_user_id")
        .eq("id", businessId)
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (biz) {
        role = "owner";
      }
    }

    if (!role) {
      const permissions = getPaymentPermissions(null, null);
      return { role: null, permissions, userId: user.id, assignedPropertyIds: null };
    }

    let assignedPropertyIds: string[] | null = null;
    if (role === "warden" && memberId) {
      const { data: staffRows } = await supabase
        .from("property_staff")
        .select("property_id")
        .eq("business_member_id", memberId);

      assignedPropertyIds = (staffRows || []).map((r) => r.property_id);
    }

    const permissions = getPaymentPermissions(role, assignedPropertyIds);
    return {
      role,
      permissions,
      userId: user.id,
      assignedPropertyIds,
    };
  },

  async getPayments(
    businessId: string,
    options?: {
      propertyId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      status?: "received" | "reversed" | "all";
    }
  ): Promise<PaymentWithTenant[]> {
    const supabase = createClient();
    const userContext = await this.getUserPaymentPermissions(businessId);

    let query = supabase
      .from("payments")
      .select("*")
      .eq("business_id", businessId);

    // Apply role scoping
    if (userContext.permissions.accessiblePropertyIds !== null) {
      if (userContext.permissions.accessiblePropertyIds.length === 0) {
        return [];
      }
      if (options?.propertyId && options.propertyId !== "all") {
        if (!userContext.permissions.accessiblePropertyIds.includes(options.propertyId)) {
          return [];
        }
        query = query.eq("property_id", options.propertyId);
      } else {
        query = query.in("property_id", userContext.permissions.accessiblePropertyIds);
      }
    } else {
      if (options?.propertyId && options.propertyId !== "all") {
        query = query.eq("property_id", options.propertyId);
      }
    }

    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }

    if (options?.startDate) {
      query = query.gte("paid_at", options.startDate);
    }

    if (options?.endDate) {
      query = query.lte("paid_at", options.endDate);
    }

    query = query.order("paid_at", { ascending: false });

    const { data: payments, error } = await query;

    if (error || !payments || payments.length === 0) return [];

    const tenantIds = Array.from(new Set(payments.map((p) => p.tenant_id)));
    const propertyIds = Array.from(new Set(payments.map((p) => p.property_id)));
    const paymentIds = payments.map((p) => p.id);

    const [tenantsRes, propertiesRes, allocationsRes] = await Promise.all([
      tenantIds.length > 0
        ? supabase.from("tenants").select("id, full_name").in("id", tenantIds)
        : Promise.resolve({ data: [] }),
      propertyIds.length > 0
        ? supabase.from("properties").select("id, name").in("id", propertyIds)
        : Promise.resolve({ data: [] }),
      paymentIds.length > 0
        ? supabase
            .from("payment_allocations")
            .select("payment_id, allocated_amount")
            .in("payment_id", paymentIds)
        : Promise.resolve({ data: [] }),
    ]);

    const tenantMap = (tenantsRes.data || []).reduce<Record<string, string>>((acc, t) => {
      acc[t.id] = t.full_name;
      return acc;
    }, {});

    const propertyMap = (propertiesRes.data || []).reduce<Record<string, string>>((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {});

    const allocSumMap = (allocationsRes.data || []).reduce<Record<string, number>>((acc, a) => {
      acc[a.payment_id] = (acc[a.payment_id] || 0) + Number(a.allocated_amount);
      return acc;
    }, {});

    return payments.map((p) => {
      const allocated = allocSumMap[p.id] || 0;
      let summary = "Unallocated";
      if (allocated >= p.amount) {
        summary = "Fully Allocated to Rent";
      } else if (allocated > 0) {
        summary = `Partially Allocated (₹${Math.round(allocated / 100).toLocaleString("en-IN")})`;
      }

      return {
        ...p,
        tenant_name: tenantMap[p.tenant_id] || "Tenant",
        property_name: propertyMap[p.property_id] || "Property",
        allocations_summary: summary,
        allocated_paise: allocated,
      };
    });
  },

  async recordPayment(payload: RecordPaymentPayload) {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

    // 1. Insert payment record
    const { data: payment, error: pError } = await supabase
      .from("payments")
      .insert({
        business_id: payload.business_id,
        property_id: payload.property_id,
        tenant_id: payload.tenant_id,
        amount: payload.amount,
        payment_method: payload.payment_method,
        transaction_reference: payload.transaction_reference || null,
        notes: payload.notes || null,
        paid_at: payload.paid_at || new Date().toISOString(),
        status: "received",
        recorded_by: userData?.user?.id || null,
      })
      .select()
      .single();

    if (pError) throw pError;

    // 2. If allocations are provided, allocate against unpaid rent charges
    if (payload.allocations && payload.allocations.length > 0) {
      const allocationInserts = payload.allocations.map((a) => ({
        payment_id: payment.id,
        rent_charge_id: a.rent_charge_id,
        business_id: payload.business_id,
        property_id: payload.property_id,
        tenant_id: payload.tenant_id,
        allocated_amount: a.allocated_amount,
      }));

      // Trigger sync_rent_charge_payment_status will update rent_charges automatically
      const { error: allocError } = await supabase
        .from("payment_allocations")
        .insert(allocationInserts);

      if (allocError) {
        console.error("Payment allocation error:", allocError.message);
        throw new Error(allocError.message || "Failed to allocate payment to rent bill.");
      }

    }

    return payment as Payment;
  },

  async getMonthlyCollections(businessId: string): Promise<number> {
    const supabase = createClient();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data } = await supabase
      .from("payments")
      .select("amount")
      .eq("business_id", businessId)
      .eq("status", "received")
      .gte("paid_at", firstDay);

    if (!data) return 0;
    return data.reduce((acc, p) => acc + p.amount, 0);
  },

  async getPaymentStats(
    businessId: string,
    options?: {
      propertyId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    }
  ): Promise<PaymentStats> {
    const supabase = createClient();
    const userContext = await this.getUserPaymentPermissions(businessId);

    let query = supabase
      .from("payments")
      .select("amount, payment_method, paid_at, property_id")
      .eq("business_id", businessId)
      .eq("status", "received");

    if (userContext.permissions.accessiblePropertyIds !== null) {
      if (userContext.permissions.accessiblePropertyIds.length === 0) {
        return {
          totalCollected: 0,
          thisMonthCollected: 0,
          totalTransactions: 0,
          methodCounts: { upi: 0, cash: 0, bank_transfer: 0, other: 0 },
          methodAmounts: { upi: 0, cash: 0, bank_transfer: 0, other: 0 },
        };
      }
      if (options?.propertyId && options.propertyId !== "all") {
        if (!userContext.permissions.accessiblePropertyIds.includes(options.propertyId)) {
          return {
            totalCollected: 0,
            thisMonthCollected: 0,
            totalTransactions: 0,
            methodCounts: { upi: 0, cash: 0, bank_transfer: 0, other: 0 },
            methodAmounts: { upi: 0, cash: 0, bank_transfer: 0, other: 0 },
          };
        }
        query = query.eq("property_id", options.propertyId);
      } else {
        query = query.in("property_id", userContext.permissions.accessiblePropertyIds);
      }
    } else {
      if (options?.propertyId && options.propertyId !== "all") {
        query = query.eq("property_id", options.propertyId);
      }
    }

    if (options?.startDate) {
      query = query.gte("paid_at", options.startDate);
    }

    if (options?.endDate) {
      query = query.lte("paid_at", options.endDate);
    }

    const { data: payments } = await query;

    const stats: PaymentStats = {
      totalCollected: 0,
      thisMonthCollected: 0,
      totalTransactions: payments?.length || 0,
      methodCounts: { upi: 0, cash: 0, bank_transfer: 0, other: 0 },
      methodAmounts: { upi: 0, cash: 0, bank_transfer: 0, other: 0 },
    };

    if (!payments) return stats;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    for (const p of payments) {
      const amt = Number(p.amount);
      stats.totalCollected += amt;

      const pDate = new Date(p.paid_at);
      if (pDate.getFullYear() === currentYear && pDate.getMonth() === currentMonth) {
        stats.thisMonthCollected += amt;
      }

      const method = p.payment_method as keyof typeof stats.methodCounts;
      if (stats.methodCounts[method] !== undefined) {
        stats.methodCounts[method] += 1;
        stats.methodAmounts[method] += amt;
      } else {
        stats.methodCounts.other += 1;
        stats.methodAmounts.other += amt;
      }
    }

    return stats;
  },

  async getPaymentAllocations(paymentId: string): Promise<PaymentAllocationDetail[]> {
    if (!isValidId(paymentId)) return [];

    const supabase = createClient();
    const { data: allocs, error } = await supabase
      .from("payment_allocations")
      .select(`
        id,
        payment_id,
        rent_charge_id,
        business_id,
        property_id,
        tenant_id,
        allocated_amount,
        created_at,
        rent_charges (
          id,
          period_start,
          period_end,
          amount,
          amount_paid,
          status,
          description
        )
      `)
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: true });

    if (error || !allocs) return [];

    interface RawAllocationItem {
      id: string;
      payment_id: string;
      rent_charge_id: string;
      business_id: string;
      property_id: string;
      tenant_id: string;
      allocated_amount: number | string;
      created_at: string;
      rent_charges?: {
        id: string;
        period_start: string;
        period_end: string;
        amount: number;
        amount_paid: number;
        status: string;
        description?: string | null;
      } | {
        id: string;
        period_start: string;
        period_end: string;
        amount: number;
        amount_paid: number;
        status: string;
        description?: string | null;
      }[] | null;
    }

    return (allocs as unknown as RawAllocationItem[]).map((a) => {
      const rc = Array.isArray(a.rent_charges) ? a.rent_charges[0] : a.rent_charges;
      return {
        id: a.id,
        payment_id: a.payment_id,
        rent_charge_id: a.rent_charge_id,
        business_id: a.business_id,
        property_id: a.property_id,
        tenant_id: a.tenant_id,
        allocated_amount: Number(a.allocated_amount),
        created_at: a.created_at,
        rent_charge: rc || undefined,
      };
    });
  },

  async removePaymentAllocation(allocationId: string): Promise<void> {
    if (!isValidId(allocationId)) {
      throw new Error("Invalid allocation identifier.");
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("payment_allocations")
      .delete()
      .eq("id", allocationId);

    if (error) {
      throw new Error(error.message || "Failed to remove payment allocation.");
    }
  },

  /**
   * Allocates an existing received payment's remaining balance to an outstanding rent charge.
   * Enforces trusted DB permission checks, relationship integrity (same business, property, tenant),
   * live allocation balances, and duplicate prevention.
   */
  async allocatePayment(payload: {
    paymentId: string;
    rentChargeId: string;
    allocatedAmount: number; // in paise
  }): Promise<PaymentAllocationDetail> {
    const paymentId = (payload.paymentId || "").trim();
    const rentChargeId = (payload.rentChargeId || "").trim();
    const numAllocAmount = Number(payload.allocatedAmount);

    if (!isValidId(paymentId)) {
      throw new Error("Payment identifier is required.");
    }
    if (!isValidId(rentChargeId)) {
      throw new Error("Rent charge identifier is required.");
    }
    if (isNaN(numAllocAmount) || !Number.isInteger(numAllocAmount) || numAllocAmount <= 0) {
      throw new Error("Allocated amount must be a positive integer in paise.");
    }

    const supabase = createClient();

    // 1. Fetch target payment
    const { data: payment, error: pError } = await supabase
      .from("payments")
      .select("id, business_id, property_id, tenant_id, amount, status")
      .eq("id", paymentId)
      .maybeSingle();

    if (pError || !payment) {
      throw new Error(pError?.message || "Payment record not found.");
    }

    // 2. Load authenticated user permissions from trusted database context
    const userContext = await this.getUserPaymentPermissions(payment.business_id);
    if (!userContext.role) {
      throw new Error("You are not an active member of this business.");
    }

    const canAllocate =
      userContext.permissions.canAllocatePayment &&
      (userContext.permissions.isAdminOrOwner ||
        (userContext.permissions.accessiblePropertyIds !== null &&
          userContext.permissions.accessiblePropertyIds.includes(payment.property_id)));

    if (!canAllocate) {
      throw new Error("You do not have permission to allocate payments for this property.");
    }

    // 3. Fetch target rent charge
    const { data: rentCharge, error: rError } = await supabase
      .from("rent_charges")
      .select("id, business_id, property_id, tenant_id, amount, amount_paid, status, period_start, period_end, description")
      .eq("id", rentChargeId)
      .maybeSingle();

    if (rError || !rentCharge) {
      throw new Error(rError?.message || "Rent charge record not found.");
    }

    // 4. Check for existing allocation to prevent duplicate entry
    const { data: existingAlloc } = await supabase
      .from("payment_allocations")
      .select("id")
      .eq("payment_id", payment.id)
      .eq("rent_charge_id", rentCharge.id)
      .maybeSingle();

    // 5. Query live allocations to calculate real remaining balances
    const [paymentAllocsRes, rentAllocsRes] = await Promise.all([
      supabase
        .from("payment_allocations")
        .select("allocated_amount")
        .eq("payment_id", payment.id),
      supabase
        .from("payment_allocations")
        .select("allocated_amount")
        .eq("rent_charge_id", rentCharge.id),
    ]);

    const currentPaymentAllocated = (paymentAllocsRes.data || []).reduce(
      (sum, a) => sum + Number(a.allocated_amount),
      0
    );
    const availablePaymentPaise = Math.max(0, payment.amount - currentPaymentAllocated);

    const currentRentAllocated = (rentAllocsRes.data || []).reduce(
      (sum, a) => sum + Number(a.allocated_amount),
      0
    );
    const outstandingRentPaise = Math.max(0, rentCharge.amount - currentRentAllocated);

    // 6. Comprehensive validation
    const validation = validatePaymentAllocationInput({
      payment_id: payment.id,
      rent_charge_id: rentCharge.id,
      allocated_amount: numAllocAmount,
      available_payment_paise: availablePaymentPaise,
      outstanding_rent_paise: outstandingRentPaise,
      payment_status: payment.status,
      rent_charge_status: rentCharge.status,
      payment_business_id: payment.business_id,
      rent_charge_business_id: rentCharge.business_id,
      payment_property_id: payment.property_id,
      rent_charge_property_id: rentCharge.property_id,
      payment_tenant_id: payment.tenant_id,
      rent_charge_tenant_id: rentCharge.tenant_id,
      is_duplicate: Boolean(existingAlloc),
    });

    if (!validation.valid) {
      const errMsg = Object.values(validation.errors).filter(Boolean).join(" ");
      throw new Error(errMsg || "Invalid payment allocation request.");
    }

    // 7. Insert payment allocation.
    // Database triggers (validate_payment_allocation_before_change) lock parent rows and re-validate;
    // sync_rent_charge_after_allocation automatically updates rent charge amount_paid and status.
    const { data: insertedAlloc, error: insertError } = await supabase
      .from("payment_allocations")
      .insert({
        payment_id: payment.id,
        rent_charge_id: rentCharge.id,
        business_id: payment.business_id,
        property_id: payment.property_id,
        tenant_id: payment.tenant_id,
        allocated_amount: validation.sanitized.allocated_amount,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(insertError.message || "Failed to create payment allocation.");
    }

    return {
      id: insertedAlloc.id,
      payment_id: insertedAlloc.payment_id,
      rent_charge_id: insertedAlloc.rent_charge_id,
      business_id: insertedAlloc.business_id,
      property_id: insertedAlloc.property_id,
      tenant_id: insertedAlloc.tenant_id,
      allocated_amount: Number(insertedAlloc.allocated_amount),
      created_at: insertedAlloc.created_at,
      rent_charge: {
        id: rentCharge.id,
        period_start: rentCharge.period_start,
        period_end: rentCharge.period_end,
        amount: rentCharge.amount,
        amount_paid: rentCharge.amount_paid + validation.sanitized.allocated_amount,
        status:
          rentCharge.amount_paid + validation.sanitized.allocated_amount >= rentCharge.amount
            ? "paid"
            : "partially_paid",
        description: rentCharge.description,
      },
    };
  },

  /**
   * Reverses an existing received payment receipt.
   * Enforces trusted DB permission checks (active owner/admin only),
   * strictly verifies payment status is 'received', verifies the payment belongs to the business,
   * asserts zero active allocations exist, and updates status to 'reversed'.
   * Database triggers and RLS policies serve as the final integrity layer.
   */
  async reversePayment(paymentId: string): Promise<Payment> {
    if (!isValidId(paymentId)) {
      throw new Error("Invalid payment identifier.");
    }

    const supabase = createClient();

    // 1. Fetch target payment
    const { data: payment, error: pError } = await supabase
      .from("payments")
      .select("id, business_id, property_id, tenant_id, amount, status")
      .eq("id", paymentId)
      .maybeSingle();

    if (pError || !payment) {
      throw new Error(pError?.message || "Payment record not found.");
    }

    // 2. Load authenticated user permissions from trusted database context
    const userContext = await this.getUserPaymentPermissions(payment.business_id);
    if (!userContext.role) {
      throw new Error("You are not an active member of this business.");
    }

    // 3. Admin-only authorization check (Wardens can NEVER reverse payments)
    if (!userContext.permissions.canReversePayment) {
      throw new Error("Only business owners and administrators are authorized to reverse payments.");
    }

    // 4. Status validation
    if (payment.status === "reversed") {
      throw new Error("This payment has already been reversed.");
    }

    if (payment.status !== "received") {
      throw new Error(`Cannot reverse a payment with status '${payment.status}'. Only received payments can be reversed.`);
    }

    // 5. Allocation check: Cannot reverse if any allocations exist
    const { data: allocations, error: aError } = await supabase
      .from("payment_allocations")
      .select("id, allocated_amount")
      .eq("payment_id", payment.id);

    if (aError) {
      throw new Error(aError.message || "Failed to verify payment allocations.");
    }

    if (allocations && allocations.length > 0) {
      throw new Error("Cannot reverse a payment that has existing allocations. Please remove all allocations first.");
    }

    // 6. Perform status update to 'reversed'
    // Enforced by Postgres RLS ("Admins can update payments") and trigger validate_payment_before_update
    const { data: updatedPayment, error: uError } = await supabase
      .from("payments")
      .update({
        status: "reversed",
      })
      .eq("id", payment.id)
      .select()
      .single();

    if (uError) {
      throw new Error(uError.message || "Failed to reverse payment.");
    }

    return updatedPayment as Payment;
  },
};

