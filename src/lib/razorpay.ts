import Razorpay from "razorpay";
import crypto from "node:crypto";

let instance: Razorpay | null = null;

export function razorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys are not configured");
  }
  instance ??= new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  return instance;
}

export const razorpayEnabled = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Checkout signature for subscriptions: HMAC(payment_id|subscription_id). */
export function verifySubscriptionSignature(paymentId: string, subscriptionId: string, signature: string) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
  return safeEqual(expected, signature);
}

/** Checkout signature for one time orders: HMAC(order_id|payment_id). */
export function verifyOrderSignature(orderId: string, paymentId: string, signature: string) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqual(expected, signature);
}

/** Webhook signature: HMAC of the raw body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
  return safeEqual(expected, signature);
}

/** Sequential, financial year based invoice number, e.g. HF/2026-27/000123. */
export function invoiceNumber(seq: number, date = new Date()) {
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `HF/${y}-${String((y + 1) % 100).padStart(2, "0")}/${String(seq).padStart(6, "0")}`;
}
