import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { error, json, rateLimit } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  topic: z.enum(["support", "billing", "grievance", "employer", "removal", "other"]),
  message: z.string().trim().min(10).max(5000),
});

export async function POST(req: Request) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(`contact:${ip}`, 5, 60 * 60 * 1000)) return error("Too many messages. Try again later.", 429);
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Check the form");
  await db.insert(contactMessages).values(parsed.data);
  return json({ ok: true }, 201);
}
