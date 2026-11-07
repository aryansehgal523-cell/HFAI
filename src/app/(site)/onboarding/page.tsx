import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { aiEnabled } from "@/lib/ai";
import { OnboardingFlow, type OnboardingStep } from "@/components/OnboardingFlow";

export const metadata: Metadata = { title: "Get started" };

/**
 * New users land here after sign up (email and first Google sign in). Returning users
 * reach the uploader with ?replace=1 from the profile page.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ replace?: string; step?: string }> }) {
  const user = await requireUser("/onboarding");
  const sp = await searchParams;
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const replacing = sp.replace === "1";
  const hasResume = Boolean(profile?.data && (profile.data.experience.length || profile.data.projects.length || profile.data.education.length));
  const hasPrefs = Boolean(profile?.preferences?.targetRoles?.length);

  let start: OnboardingStep = "upload";
  if (!replacing) {
    if (sp.step === "prefs" || (hasResume && !hasPrefs)) start = "prefs";
    else if (hasResume && hasPrefs) redirect("/dashboard");
  }

  return (
    <div className="container-x max-w-4xl py-12">
      <OnboardingFlow
        firstName={user.name?.split(" ")[0] ?? "there"}
        start={start}
        initialData={profile?.data ?? null}
        initialDetails={profile?.applicationDetails ?? null}
        initialPreferences={profile?.preferences ?? null}
        aiReady={aiEnabled()}
        replacing={replacing}
      />
    </div>
  );
}
