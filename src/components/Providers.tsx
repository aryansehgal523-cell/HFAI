"use client";
import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "framer-motion";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <MotionConfig reducedMotion="user">
        <ToastProvider>{children}</ToastProvider>
      </MotionConfig>
    </SessionProvider>
  );
}
