import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { error, json, rateLimit } from "@/lib/api";

const passwordPolicy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(-10);
};

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7),
  password: z.string().min(12).max(100).regex(passwordPolicy, "Use 12+ characters, at least 1 uppercase, 1 lowercase, 1 number and 1 symbol."),
  consent: z.literal(true, { errorMap: () => ({ message: "Accept the Terms and Privacy Policy to continue" }) }),
  marketing: z.boolean().optional(),
});

export async function POST(req: Request) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000)) return error("Too many sign ups from this network. Try again in an hour.", 429);

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Check the form and try again");
  const { name, email, phone, password, marketing } = parsed.data;
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length !== 10) return error("Enter a valid phone number.", 400);

  const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingEmail) return error("An account with this email already exists. Log in instead.", 409);

  const [existingPhone] = await db.select({ id: users.id }).from(users).where(eq(users.phone, normalizedPhone)).limit(1);
  if (existingPhone) return error("This phone number is already linked to another account.", 409);

  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  await db.insert(users).values({
    name,
    email,
    phone: normalizedPhone,
    passwordHash: await bcrypt.hash(password, 12),
    consentAt: new Date(),
    marketingOptIn: Boolean(marketing),
    role: admins.includes(email) ? "ADMIN" : "USER",
  });
  return json({ ok: true }, 201);
}
