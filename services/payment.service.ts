import { createClient } from "@/lib/supabase/client";
import type { Payment, RecordPaymentPayload } from "@/types/app.types";

export interface PaymentWithTenant extends Payment {
  tenant_name?: string;
  property_name?: string;
  allocations_summary?: string;
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
  async getPayments(businessId: string): Promise<PaymentWithTenant[]> {
    const supabase = createClient();
    const { data: payments, error } = await supabase
      .from("payments")
      .select("*")
      .eq("business_id", businessId)
      .order("paid_at", { ascending: false });

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

  async getPaymentStats(businessId: string): Promise<PaymentStats> {
    const supabase = createClient();
    const { data: payments } = await supabase
      .from("payments")
      .select("amount, payment_method, paid_at")
      .eq("business_id", businessId)
      .eq("status", "received");

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
};
