// In production NEXTAUTH_SECRET must be set. For `npm run local` on a laptop we fall back
// to a fixed development secret so the site works with no configuration at all.
export const AUTH_SECRET =
  process.env.NEXTAUTH_SECRET ?? (process.env.NODE_ENV !== "production" ? "hireflow-local-development-secret" : undefined);
