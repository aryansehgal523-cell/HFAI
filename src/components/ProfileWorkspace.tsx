"use client";
import { useCallback, useMemo, useState } from "react";
import type { ResumeData } from "@/db/schema";
import type { ApplicationDetails, JobPreferences } from "@/lib/profile-fields";
import { masterScoreOptions, scoreResume, topTips, type ResumeScore } from "@/lib/resumeScore";
import { ProfileEditor } from "./ProfileEditor";
import { ScoreBars, ScoreRing, ScoreTrend, TipList, useDebounced } from "./ResumeScoreUI";

const EMPTY: ResumeData = { experience: [], projects: [], education: [], skills: [], achievements: [] };

/** Master resume editor with a live score: "Before" is the last save, "Now" updates as you type. */
export function ProfileWorkspace({
  initial, initialDetails, preferences, savedScore, history, aiReady, next,
}: {
  initial: ResumeData | null;
  initialDetails: ApplicationDetails | null;
  preferences: JobPreferences | null;
  savedScore: ResumeScore | null;
  history: { total: number; at: string }[];
  aiReady: boolean;
  next?: string;
}) {
  const opts = useMemo(() => masterScoreOptions(preferences, initialDetails), [preferences, initialDetails]);
  const [live, setLive] = useState<ResumeData>(initial ?? EMPTY);
  const [saved, setSaved] = useState<ResumeScore | null>(savedScore ?? (initial ? scoreResume(initial, opts) : null));
  const [trend, setTrend] = useState(history);
  const debounced = useDebounced(live, 250);
  const now = useMemo(() => scoreResume(debounced, opts), [debounced, opts]);
  const onDataChange = useCallback((d: ResumeData) => setLive(d), []);
  const onSavedScore = useCallback((s: ResumeScore) => {
    setSaved(s);
    setTrend((t) => (t.at(-1)?.total === s.total ? t : [...t, { total: s.total, at: new Date().toISOString() }].slice(-20)));
  }, []);
  const changed = saved && saved.total !== now.total;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="order-2 lg:order-1">
        <ProfileEditor
          initial={initial}
          initialDetails={initialDetails}
          aiReady={aiReady}
          next={next}
          onDataChange={onDataChange}
          onSavedScore={onSavedScore}
        />
      </div>

      <aside aria-label="Resume score" className="order-1 lg:order-2 lg:sticky lg:top-24 lg:self-start">
        <div className="panel space-y-6 p-6">
          <div className="flex items-start justify-around gap-2">
            {saved && changed && <ScoreRing value={saved.total} size={96} label="Last saved" animateIn={false} />}
            <ScoreRing value={now.total} from={saved?.total ?? 0} size={changed ? 96 : 120} label={changed ? "Now" : "Resume score"} />
          </div>
          <p className="sr-only" aria-live="polite">Resume score {now.total} out of 100.</p>
          {changed && (
            <p className="text-center text-sm text-slate">
              {now.total > saved!.total ? `Up ${now.total - saved!.total} since your last save. Save to keep it.` : `Down ${saved!.total - now.total} since your last save.`}
            </p>
          )}
          <ScoreBars score={now} before={changed ? saved : null} compact />
          <TipList tips={topTips(now)} />
          {!preferences?.targetRoles?.length && (
            <p className="rounded-lg bg-cobalt-tint px-3 py-2 text-xs text-ink">
              Add target roles under <a href="#preferences" className="font-medium text-cobalt underline underline-offset-2">Job preferences</a> to check keywords for the jobs you want.
            </p>
          )}
          <div className="border-t border-line pt-4">
            <p className="mb-1 text-sm font-semibold text-ink">Your progress</p>
            <ScoreTrend points={trend} />
          </div>
        </div>
      </aside>
    </div>
  );
}
