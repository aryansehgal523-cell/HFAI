import type { ResumeData } from "@/db/schema";
import { cn } from "@/lib/utils";

/** Single column, ATS safe resume layout used on screen, in print, and mirrored in the Word export. */
export function ResumeSheet({ data, className }: { data: ResumeData; className?: string }) {
  const contact = [data.contact?.email, data.contact?.phone, data.contact?.location, ...(data.contact?.links ?? [])].filter(Boolean);
  return (
    <div className={cn("resume-sheet mx-auto max-w-[800px] bg-[#ffffff] px-10 py-10 text-[13px] leading-[1.5] text-[#111]", className)}>
      <header className="text-center">
        <h1 className="font-sans text-[24px] font-semibold tracking-normal text-[#111]">{data.name || "Your name"}</h1>
        {data.headline && <p className="mt-0.5 text-[13.5px] text-[#333]">{data.headline}</p>}
        {contact.length > 0 && <p className="mt-1 text-[12px] text-[#444]">{contact.join("  |  ")}</p>}
      </header>

      {data.summary && (
        <Block title="Summary">
          <p>{data.summary}</p>
        </Block>
      )}

      {data.experience.length > 0 && (
        <Block title="Experience">
          {data.experience.map((e, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <div className="flex flex-wrap justify-between gap-x-4">
                <p><span className="font-semibold">{e.title}</span>{e.company ? `, ${e.company}` : ""}{e.location ? `, ${e.location}` : ""}</p>
                <p className="text-[#444]">{[e.start, e.end].filter(Boolean).join(" to ")}</p>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {e.bullets.map((b, n) => <li key={n}>{b}</li>)}
              </ul>
            </div>
          ))}
        </Block>
      )}

      {data.projects.length > 0 && (
        <Block title="Projects">
          {data.projects.map((p, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <p>
                <span className="font-semibold">{p.name}</span>
                {p.tech?.length ? <span className="text-[#444]">{`  |  ${p.tech.join(", ")}`}</span> : null}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {p.bullets.map((b, n) => <li key={n}>{b}</li>)}
              </ul>
            </div>
          ))}
        </Block>
      )}

      {data.education.length > 0 && (
        <Block title="Education">
          {data.education.map((ed, i) => (
            <div key={i} className="flex flex-wrap justify-between gap-x-4">
              <p><span className="font-semibold">{ed.degree}</span>, {ed.school}{ed.score ? `, ${ed.score}` : ""}</p>
              <p className="text-[#444]">{[ed.start, ed.end].filter(Boolean).join(" to ")}</p>
            </div>
          ))}
        </Block>
      )}

      {data.skills.length > 0 && (
        <Block title="Skills">
          {data.skills.map((s, i) => (
            <p key={i}><span className="font-semibold">{s.group}:</span> {s.items.join(", ")}</p>
          ))}
        </Block>
      )}

      {data.achievements.length > 0 && (
        <Block title="Achievements">
          <ul className="list-disc space-y-0.5 pl-5">
            {data.achievements.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 border-b border-[#222] pb-0.5 font-sans text-[13px] font-semibold uppercase tracking-[0.06em] text-[#111]">{title}</h2>
      {children}
    </section>
  );
}
