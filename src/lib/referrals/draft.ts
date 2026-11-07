/*
 * Rules around a referral request message. Pure and unit tested; the AI writes the words,
 * these functions decide what is true and keep the message within the channel's limits.
 */

export const LIMITS = { linkedinChars: 600, emailWords: 150 } as const;

/**
 * How the user knows this person, stated only from facts we hold. Returns null when we
 * know nothing beyond "connected on LinkedIn" with no date, so the AI must not claim more.
 */
export function relationshipFact(
  conn: { relationship: string | null; connectedOn: Date | string | null; batch?: string | null; source: string },
  userCollege: string | null | undefined,
): string | null {
  switch (conn.relationship) {
    case "alumni":
      return userCollege
        ? `You are both alumni of ${userCollege}${conn.batch ? ` (they graduated in ${conn.batch})` : ""}.`
        : "You are alumni of the same college.";
    case "ex_colleague":
      return "You worked together before.";
    case "friend":
      return "You are friends.";
    case "family":
      return "You are family.";
  }
  if (conn.source === "linkedin_csv" && conn.connectedOn) {
    return `You have been connected on LinkedIn since ${new Date(conn.connectedOn).getUTCFullYear()}.`;
  }
  return null;
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Split into sentences and line breaks, keeping every character (greeting lines included). */
function units(text: string): string[] {
  return text.match(/[^.!?\n]+[.!?]+["')\]]*[ \t]*|[^.!?\n]+|\n+/g) ?? [text];
}

/**
 * Shorten by dropping whole sentences from the middle, so the greeting (first) and the ask
 * (the last sentence with a question mark) always survive.
 */
function trimToFit(text: string, fits: (s: string) => boolean): string {
  if (fits(text)) return text;
  const parts = units(text);
  const isText = (u: string) => u.trim().length > 0;
  const first = parts.findIndex(isText);
  let ask = -1;
  for (let i = parts.length - 1; i > first; i--) if (parts[i].includes("?")) { ask = i; break; }
  const keep = new Set(parts.map((_, i) => i));
  const removable = parts.map((_, i) => i).filter((i) => i !== first && i !== ask && isText(parts[i]) && !parts[i].includes("{LINK}")).reverse();
  const join = () => parts.filter((_, i) => keep.has(i)).join("").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  for (const i of removable) {
    if (fits(join())) break;
    keep.delete(i);
  }
  return join();
}

/**
 * Make sure the message greets the person, includes the job link and fits the channel.
 * The link is kept even when trimming: it is the one thing the referrer needs.
 */
export function enforceDraft(message: string, opts: { channel: "linkedin" | "email"; link: string; firstName: string }): string {
  let m = message.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!new RegExp(`\\b${opts.firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(m.split("\n")[0] ?? "")) {
    m = `Hi ${opts.firstName},\n\n${m}`;
  }
  const hasLink = m.includes(opts.link);
  const body = hasLink ? m.replace(opts.link, "{LINK}") : m;
  const withLink = (s: string) => (s.includes("{LINK}") ? s.replace("{LINK}", opts.link) : `${s}\n\nRole: ${opts.link}`);
  const fits = (s: string) =>
    opts.channel === "linkedin" ? withLink(s.trim()).length <= LIMITS.linkedinChars : wordCount(withLink(s.trim())) <= LIMITS.emailWords;
  return withLink(trimToFit(body, fits)).trim();
}

/** Default follow up: 5 days after sending. */
export function followUpDate(sentAt: Date, days = 5) {
  return new Date(sentAt.getTime() + days * 86_400_000);
}

export function mailtoLink(email: string, subject: string | null | undefined, body: string) {
  const q = new URLSearchParams();
  if (subject) q.set("subject", subject);
  q.set("body", body);
  return `mailto:${email}?${q.toString().replace(/\+/g, "%20")}`;
}
