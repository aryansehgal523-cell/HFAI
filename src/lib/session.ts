import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { authOptions } from "./auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { refreshCreditsIfDue } from "./credits";

/**
 * Current user row (fresh from the database) or null.
 * Session failures (e.g. NEXTAUTH_SECRET missing in production) are logged and treated as
 * "signed out", so public pages like /jobs and /pricing keep working instead of crashing.
 */
export async function getCurrentUser() {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (e) {
    console.error("[auth] Could not read the session. Check NEXTAUTH_SECRET and NEXTAUTH_URL.", e);
    return null;
  }
  if (!session?.user?.id) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) return null;
  return refreshCreditsIfDue(user);
}

export async function requireUser(callbackUrl = "/dashboard") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return user;
}

export async function requireAdmin() {
  const user = await requireUser("/admin");
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
