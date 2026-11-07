import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { FileUp } from "lucide-react";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { aiEnabled } from "@/lib/ai";
import { ProfileEditor } from "@/components/ProfileEditor";
import { PreferencesForm } from "@/components/PreferencesForm";

export const metadata: Metadata = { title: "Master resume" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string; next?: string }> }) {
  const user = await requireUser("/profile");
  const sp = await searchParams;
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const next = sp.next?.startsWith("/") ? sp.next : undefined;

  // First visit with no resume yet: the guided upload is the better start.
  if (sp.welcome && !profile?.data) redirect("/onboarding");

  return (
    <div className="container-x max-w-4xl py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Master resume</h1>
          <p className="mt-2 max-w-2xl text-slate">This is the source every tailored resume is built from. HireFlow never adds facts that aren&apos;t here.</p>
        </div>
        <Link href="/onboarding?replace=1" className="btn-ghost btn-sm">
          <FileUp className="h-4 w-4" aria-hidden />Replace with a new resume
        </Link>
      </div>
      <div className="mt-10">
        <ProfileEditor initial={profile?.data ?? null} initialDetails={profile?.applicationDetails ?? null} aiReady={aiEnabled()} next={next} />
      </div>
      <section id="preferences" className="panel mt-10 p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Job preferences</h2>
        <p className="mt-1 text-sm text-slate">Used to rank jobs for you and to score your resume when you are not looking at a specific job.</p>
        <div className="mt-6">
          <PreferencesForm initial={profile?.preferences ?? null} suggestedYears={profile?.applicationDetails?.totalExperienceYears} />
        </div>
      </section>
    </div>
  );
}
