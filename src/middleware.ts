import { withAuth } from "next-auth/middleware";
import { AUTH_SECRET } from "@/lib/secret";

// Pages that need a signed in user. API routes check auth themselves.
export default withAuth({ pages: { signIn: "/login" }, secret: AUTH_SECRET });

export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/tailor/:path*", "/settings/:path*", "/admin/:path*", "/print/:path*", "/onboarding"],
};
