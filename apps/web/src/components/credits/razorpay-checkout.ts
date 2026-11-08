"use client";

/* Razorpay's checkout window (their script, loaded only when someone pays). */

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCtor = new (o: Record<string, unknown>) => { open(): void; on(e: string, f: (r: { error?: { description?: string } }) => void): void };

let loading: Promise<RazorpayCtor> | null = null;
function load(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return (loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("no Razorpay")));
    s.onerror = () => ((loading = null), reject(new Error("blocked")));
    document.head.appendChild(s);
  }));
}

/** Opens the checkout; resolves with Razorpay's proof of payment, or null when closed without paying. */
export async function payWithRazorpay(o: { keyId: string; orderId: string; amount: number; currency: string; description: string; prefill: { name: string; email: string } }): Promise<RazorpayResponse | null> {
  const Razorpay = await load();
  return new Promise((resolve, reject) => {
    const rp = new Razorpay({
      key: o.keyId,
      order_id: o.orderId,
      amount: o.amount,
      currency: o.currency,
      name: "Invytra",
      description: o.description,
      prefill: o.prefill,
      theme: { color: "#1c1917" },
      handler: (r: RazorpayResponse) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    });
    rp.on("payment.failed", (r) => reject(new Error(r.error?.description || "The payment didn't go through.")));
    rp.open();
  });
}
