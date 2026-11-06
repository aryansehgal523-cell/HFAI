import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { googleEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
