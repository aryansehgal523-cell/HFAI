import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { oauthAccounts, users } from "@/db/schema";
import { AUTH_SECRET } from "./secret";

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(-10);
};

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const credentialsSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
});

/** Find or create the user row for an OAuth login and link the provider account. */
async function upsertOAuthUser(input: {
  provider: string;
  providerAccountId: string;
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  const email = input.email.toLowerCase();
  const linked = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, input.provider), eq(oauthAccounts.providerAccountId, input.providerAccountId)))
    .limit(1);

  if (linked[0]) return linked[0].userId;

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let userId = existing[0]?.id;
  if (!userId) {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name: input.name ?? null,
        image: input.image ?? null,
        emailVerified: new Date(),
        consentAt: new Date(),
        role: adminEmails().includes(email) ? "ADMIN" : "USER",
      })
      .returning({ id: users.id });
    userId = created.id;
  }
  await db
    .insert(oauthAccounts)
    .values({ provider: input.provider, providerAccountId: input.providerAccountId, userId })
    .onConflictDoNothing();
  return userId;
}

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Email or phone",
    credentials: { email: { label: "Email or phone", type: "text" }, password: { label: "Password", type: "password" } },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const identifier = parsed.data.identifier.trim();
      const email = identifier.includes("@") ? normalizeEmail(identifier) : "";
      const phone = !identifier.includes("@") ? normalizePhone(identifier) : "";
      const [user] = await db
        .select()
        .from(users)
        .where(email ? eq(users.email, email) : or(eq(users.phone, phone), eq(users.email, normalizeEmail(identifier))))
        .limit(1);
      if (!user?.passwordHash) return null;
      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  secret: AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", newUser: "/onboarding" },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
        if (!user.email || verified === false) return false;
        user.id = await upsertOAuthUser({
          provider: "google",
          providerAccountId: account.providerAccountId,
          email: user.email,
          name: user.name,
          image: user.image,
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      if (token.uid) {
        const [row] = await db
          .select({ role: users.role, plan: users.plan })
          .from(users)
          .where(eq(users.id, token.uid as string))
          .limit(1);
        if (!row) return { ...token, uid: undefined };
        token.role = row.role;
        token.plan = row.plan;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
        session.user.plan = (token.plan as "FREE" | "PREMIUM") ?? "FREE";
      }
      return session;
    },
  },
};

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
