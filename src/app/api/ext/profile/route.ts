import { extError, extJson, extOptions, extUser } from "@/lib/ext-auth";
import { extProfile } from "@/lib/ext-data";
import { takeQuota } from "@/lib/usage";

export const OPTIONS = extOptions;

/**
 * Data to fill a form, fetched when the user presses Autofill. Premium gets everything;
 * free users get contact details on 3 applications a month.
 */
export async function GET(req: Request) {
  const auth = await extUser(req);
  if (!auth) return extError(req, "Connect the extension again from HireFlow Settings.", 401);
  const premium = auth.user.plan === "PREMIUM";
  if (!premium) {
    const blocked = await takeQuota(auth.user.id, "ext_autofill_free");
    if (blocked) return extError(req, blocked, 402);
  }
  return extJson(req, await extProfile(auth.user, premium));
}
