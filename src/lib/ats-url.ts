/*
 * Recognise job application URLs on the ATS sites HireFlow crawls, so the extension can
 * tell us which job a form belongs to. Pure and unit tested.
 */
export type AtsRef = { ats: "greenhouse" | "lever" | "ashby" | "workday" | "smartrecruiters" | "darwinbox" | "other"; company?: string; jobId?: string };

export function parseAtsUrl(raw: string): AtsRef {
  let u: URL;
  try { u = new URL(raw); } catch { return { ats: "other" }; }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  // boards.greenhouse.io/acme/jobs/123, job-boards.greenhouse.io/acme/jobs/123, or ?gh_jid=123 on a company site
  if (host.endsWith("greenhouse.io")) {
    const i = parts.indexOf("jobs");
    return { ats: "greenhouse", company: parts[0], jobId: i >= 0 ? parts[i + 1]?.match(/^\d+/)?.[0] : u.searchParams.get("token") ?? undefined };
  }
  if (u.searchParams.get("gh_jid")) return { ats: "greenhouse", jobId: u.searchParams.get("gh_jid")! };

  // jobs.lever.co/acme/<uuid>[/apply]
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return { ats: "lever", company: parts[0], jobId: parts[1] };

  // jobs.ashbyhq.com/acme/<uuid>[/application]
  if (host === "jobs.ashbyhq.com") return { ats: "ashby", company: parts[0], jobId: parts[1] };

  // acme.wd5.myworkdayjobs.com/en-US/External/job/Bengaluru/Engineer_R12345[/apply]
  if (host.endsWith("myworkdayjobs.com")) {
    const jobPart = parts[parts.indexOf("job") + 2] ?? parts.at(-1) ?? "";
    return { ats: "workday", company: host.split(".")[0], jobId: jobPart.match(/_([A-Z]*-?\d[\w-]*)$/i)?.[1] };
  }
  // jobs.smartrecruiters.com/Acme/743999...
  if (host.endsWith("smartrecruiters.com")) return { ats: "smartrecruiters", company: parts[0], jobId: parts[1]?.match(/^\d+/)?.[0] };
  // acme.darwinbox.in/ms/candidate/careers/<id>
  if (host.endsWith("darwinbox.in") || host.endsWith("darwinbox.com")) return { ats: "darwinbox", company: host.split(".")[0], jobId: parts.at(-1) };
  return { ats: "other" };
}

/** Host and path without the trailing /apply or /application, for comparing apply URLs. */
export function canonicalJobUrl(raw: string) {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/(apply|application)\/?$/i, "").replace(/\/+$/, "");
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path.toLowerCase()}`;
  } catch {
    return raw.toLowerCase();
  }
}
