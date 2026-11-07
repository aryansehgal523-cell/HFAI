import { extError, extJson, extOptions, extUser } from "@/lib/ext-auth";
import { QUOTAS, usageSince } from "@/lib/usage";

export const OPTIONS = extOptions;

export async function GET(req: Request) {
  const auth = await extUser(req);
  if (!auth) return extError(req, "Connect the extension again from HireFlow Settings.", 401);
  const u = auth.user;
  const freeLeft = u.plan === "PREMIUM" ? null
    : Math.max(0, QUOTAS.ext_autofill_free.limit - (await usageSince(u.id, "ext_autofill_free", new Date(Date.now() - QUOTAS.ext_autofill_free.windowMs))));
  return extJson(req, { name: u.name, plan: u.plan, credits: u.credits, freeAutofillsLeft: freeLeft });
}
