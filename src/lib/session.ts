import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { authOptions } from "./auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { refreshCreditsIfDue } from "./credits";

/** Current user row (fresh from the database) or null. */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
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
