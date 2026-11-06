import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { googleEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <Suspense>
      <AuthForm mode="signup" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
