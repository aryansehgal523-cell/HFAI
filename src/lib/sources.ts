/** Attribution shown on job cards and job pages for jobs from job search APIs, as each source's terms require. */
export const SOURCE_ATTRIBUTION: Record<string, { label: string; name: string; href: string }> = {
  adzuna: { label: "Jobs by Adzuna", name: "Adzuna", href: "https://www.adzuna.in" },
  jooble: { label: "Jobs by Jooble", name: "Jooble", href: "https://jooble.org" },
};

export const attributionFor = (source: string | null | undefined) => (source ? SOURCE_ATTRIBUTION[source] : undefined);
