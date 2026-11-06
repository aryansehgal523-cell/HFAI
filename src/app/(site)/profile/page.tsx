import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { aiEnabled } from "@/lib/ai";
import { ProfileEditor } from "@/components/ProfileEditor";

export const metadata: Metadata = { title: "Master resume" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string; next?: string }> }) {
  const user = await requireUser("/profile");
  const sp = await searchParams;
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const next = sp.next?.startsWith("/") ? sp.next : undefined;

  return (
    <div className="container-x max-w-4xl py-12">
      {sp.welcome && !profile?.data ? (
        <>
          <h1 className="text-4xl font-semibold sm:text-5xl">Welcome, {user.name?.split(" ")[0] ?? "there"}</h1>
          <p className="mt-3 max-w-2xl text-lg text-slate">
            Start with your master resume. Add everything you&apos;ve done here, even the small stuff; HireFlow picks the most relevant parts for each job.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-4xl font-semibold">Master resume</h1>
          <p className="mt-2 max-w-2xl text-slate">This is the source every tailored resume is built from. HireFlow never adds facts that aren&apos;t here.</p>
        </>
      )}
      <div className="mt-10">
        <ProfileEditor initial={profile?.data ?? null} aiReady={aiEnabled()} next={next} />
      </div>
    </div>
  );
}
