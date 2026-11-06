"use client";

type RazorpayHandlerResponse = Record<string, string>;
type RazorpayOptions = Record<string, unknown> & { handler: (r: RazorpayHandlerResponse) => void };
declare global {
  interface Window {
    Razorpay?: new (opts: RazorpayOptions) => { open: () => void; on: (ev: string, cb: (e: unknown) => void) => void };
  }
}

let loading: Promise<boolean> | null = null;

export function loadRazorpay() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  loading ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => {
      loading = null;
      resolve(false);
    };
    document.body.appendChild(s);
  });
  return loading;
}

export async function openCheckout(opts: Omit<RazorpayOptions, "handler">) {
  const ok = await loadRazorpay();
  if (!ok || !window.Razorpay) throw new Error("Could not load Razorpay. Check your connection.");
  return new Promise<RazorpayHandlerResponse | null>((resolve) => {
    const rzp = new window.Razorpay!({
      ...opts,
      theme: { color: "#3346F2" },
      handler: (r) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on("payment.failed", () => resolve(null));
    rzp.open();
  });
}
