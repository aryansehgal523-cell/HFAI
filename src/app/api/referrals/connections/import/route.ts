import { apiUser, error, json, rateLimit } from "@/lib/api";
import { parseAlumniCsv, parseLinkedInConnections } from "@/lib/referrals/connectionsCsv";
import { importConnections } from "@/lib/referrals/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // 30,000 LinkedIn rows is about 3 MB

/**
 * Upload LinkedIn's Connections.csv (kind=linkedin) or an alumni sheet (kind=alumni).
 * Importing your own network is free; matching it to jobs and drafting requests is Premium.
 */
export async function POST(req: Request) {
  const { user, res } = await apiUser();
  if (!user) return res;
  if (!rateLimit(`conn-import:${user.id}`, 10, 60 * 60 * 1000)) return error("Too many uploads. Try again in an hour.", 429);

  let form: FormData;
  try { form = await req.formData(); } catch { return error("Choose a CSV file and try again."); }
  const file = form.get("file");
  const kind = form.get("kind") === "alumni" ? "alumni" : "linkedin";
  if (!(file instanceof File) || file.size === 0) return error("Choose a CSV file and try again.");
  if (file.size > MAX_BYTES) return error("That file is over 4 MB. LinkedIn's Connections.csv is usually much smaller; check you picked the right file.", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  // CSVs are text. Reject zips (people often upload the whole LinkedIn archive) and binaries.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return error("That is the zip archive. Open it and upload Connections.csv from inside.", 415);
  if (bytes.subarray(0, 2048).includes(0)) return error("That does not look like a CSV file.", 415);
  const text = new TextDecoder("utf-8").decode(bytes);

  const parsed = kind === "alumni" ? parseAlumniCsv(text) : parseLinkedInConnections(text);
  if (parsed.error) return error(parsed.error, 422);
  if (parsed.rows.length === 0) return error("We found no people with a company in that file.", 422);

  const result = await importConnections(user.id, parsed.rows, kind === "alumni" ? "alumni_csv" : "linkedin_csv", kind === "alumni" ? "alumni" : null);
  return json({ ...result, skipped: parsed.skipped, truncated: parsed.truncated });
}
