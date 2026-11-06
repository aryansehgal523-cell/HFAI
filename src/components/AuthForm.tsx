"use client";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { FormField, validators } from "./FormField";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

export function AuthForm({ mode, googleEnabled }: { mode: "login" | "signup"; googleEnabled: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") ?? (mode === "signup" ? "/onboarding" : "/dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState(sp.get("error") ? "Sign in failed. Try again or use another method." : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setTried(true);
    const invalid =
      (mode === "signup" && validators.name(name)) ||
      (mode === "signup" ? validators.phone(phone) : validators.emailOrPhone(identifier)) ||
      (mode === "signup" ? validators.email(email) : validators.emailOrPhone(identifier)) ||
      (mode === "signup" ? validators.password(password) : validators.passwordLogin(password));
    if (invalid) return;
    if (mode === "signup" && !consent) return setError("Accept the Terms and Privacy Policy to continue.");
    setBusy(true);
    if (mode === "signup") {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password, consent, marketing }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusy(false);
        return setError(data.error ?? "Could not create your account.");
      }
    }
    const res = await signIn("credentials", { identifier: mode === "login" ? identifier : email, password, redirect: false });
    setBusy(false);
    if (!res || res.error) return setError(mode === "login" ? "That email or phone number and password don't match an account." : "Account created. Log in to continue.");
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-4xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-2 text-slate">
        {mode === "login" ? "Log in to see your saved jobs and tailored resumes." : "Free forever for search. 3 tailored resumes every month."}
      </p>

      {googleEnabled && (
        <>
          <button
            onClick={() => {
              if (mode === "signup" && !consent) return setError("Accept the Terms and Privacy Policy to continue.");
              setBusy(true);
              signIn("google", { callbackUrl });
            }}
            className="btn-ghost mt-8 w-full py-3"
            disabled={busy}
          >
            <GoogleIcon /> Continue with Google
          </button>
          {mode === "login" && (
            <p className="mt-2 text-center text-xs text-slate">
              New here? Continuing with Google means you accept the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </p>
          )}
          <div className="my-6 flex items-center gap-3 text-xs text-slate">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} noValidate className={googleEnabled ? "space-y-4" : "mt-8 space-y-4"}>
        {mode === "signup" && (
          <FormField label="Full name" autoComplete="name" value={name} onChange={setName} validate={validators.name} showErrors={tried} required />
        )}
        {mode === "login" ? (
          <FormField label="Email or phone number" type="text" autoComplete="username" inputMode="email" value={identifier} onChange={setIdentifier} validate={validators.emailOrPhone} showErrors={tried} required />
        ) : (
          <FormField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={setEmail} validate={validators.email} showErrors={tried} required />
        )}
        {mode === "signup" && (
          <FormField label="Phone number" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={setPhone} validate={validators.phone} showErrors={tried} required />
        )}
        <FormField
          label="Password"
          type={show ? "text" : "password"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={setPassword}
          validate={mode === "signup" ? validators.password : validators.passwordLogin}
          showErrors={tried}
          hint={mode === "signup" ? "Strong password: 12+ chars with uppercase, lowercase, a number and a symbol." : undefined}
          required
          trailing={
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-slate" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        {mode === "signup" && (
          <div className="space-y-3 pt-1 text-sm">
            <label className="flex items-start gap-2.5 text-ink">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[#3346F2]" />
              <span>
                I agree to the <Link href="/terms" target="_blank" className="text-cobalt underline">Terms</Link> and consent to my data being processed as described in the{" "}
                <Link href="/privacy" target="_blank" className="text-cobalt underline">Privacy Policy</Link>.
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-slate">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-4 w-4 accent-[#3346F2]" />
              Send me job alerts and product updates (optional).
            </label>
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-lg bg-rose-tint px-3 py-2 text-sm text-rose" role="alert">
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <button className="btn-primary w-full py-3" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate">
        {mode === "login" ? (
          <>New to HireFlow? <Link href={`/signup${sp.toString() ? `?${sp}` : ""}`} className="font-medium text-cobalt">Create an account</Link></>
        ) : (
          <>Already have an account? <Link href={`/login${sp.toString() ? `?${sp}` : ""}`} className="font-medium text-cobalt">Log in</Link></>
        )}
      </p>
    </div>
  );
}
