"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

const strongPasswordText = "Use 12+ characters, at least 1 uppercase, 1 lowercase, 1 number and 1 symbol.";

export const validators = {
  name: (v: string) => (v.trim().length < 2 ? "Enter your full name" : null),
  email: (v: string) =>
    !v.trim() ? "Enter your email address" : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? (v.includes("@") ? "Check the part after @, e.g. name@gmail.com" : "An email needs an @, e.g. name@gmail.com") : null,
  phone: (v: string) => {
    const digits = v.replace(/\D/g, "");
    if (!digits) return "Enter your phone number";
    if (digits.length < 10 || digits.length > 12) return "Enter a valid phone number";
    return null;
  },
  emailOrPhone: (v: string) => {
    if (!v.trim()) return "Enter your email or phone number";
    const trimmed = v.trim();
    if (trimmed.includes("@")) return validators.email(trimmed);
    return validators.phone(trimmed);
  },
  password: (v: string) => {
    const hasLength = v.length >= 12;
    const hasUpper = /[A-Z]/.test(v);
    const hasLower = /[a-z]/.test(v);
    const hasNumber = /\d/.test(v);
    const hasSymbol = /[^A-Za-z0-9]/.test(v);
    return hasLength && hasUpper && hasLower && hasNumber && hasSymbol ? null : strongPasswordText;
  },
  passwordLogin: (v: string) => (!v ? "Enter your password" : null),
  message: (v: string) => (v.trim().length < 10 ? "Tell us a little more (at least 10 characters)" : null),
};

/**
 * Text field with instant validation: the message appears once the person leaves
 * the field (or submits), then updates live as they type.
 */
export function FormField({
  label,
  value,
  onChange,
  validate,
  showErrors,
  hint,
  multiline,
  className,
  trailing,
  required,
  ...input
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  validate?: (v: string) => string | null;
  showErrors?: boolean;
  hint?: string;
  multiline?: boolean;
  className?: string;
  trailing?: React.ReactNode;
  required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const error = validate ? validate(value) : null;
  const visible = (touched || showErrors) && error;
  const ok = touched && !error && value.length > 0;
  const describedBy = visible ? `${id}-err` : hint ? `${id}-hint` : undefined;

  const common = {
    id,
    value,
    required,
    "aria-invalid": Boolean(visible) || undefined,
    "aria-describedby": describedBy,
    onBlur: () => setTouched(true),
    className: cn("field", trailing && "pr-11", visible && "border-rose focus:border-rose focus:ring-rose/15"),
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="ml-1 text-rose">*</span>}
      </label>
      <div className="relative">
        {multiline ? (
          <textarea {...common} rows={6} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input {...input} {...common} onChange={(e) => onChange(e.target.value)} />
        )}
        {trailing ?? (ok && !multiline && <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mint" aria-hidden />)}
      </div>
      <AnimatePresence initial={false} mode="wait">
        {visible ? (
          <motion.p key="err" id={`${id}-err`} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-1.5 flex items-center gap-1.5 text-xs text-rose">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />{error}
          </motion.p>
        ) : hint ? (
          <motion.p key="hint" id={`${id}-hint`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1.5 text-xs text-slate">{hint}</motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
