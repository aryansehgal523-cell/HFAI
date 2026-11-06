import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { themeScript } from "@/components/ThemeToggle";
import { CookieConsent } from "@/components/CookieConsent";
import { ServiceWorker } from "@/components/ServiceWorker";

const url = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const description =
  "Search fresh jobs straight from company career pages, with ghost listings filtered out. Then get a resume in Google's XYZ format and a cover letter written for every job you apply to.";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: "HireFlow AI: real jobs and a tailored resume for each one", template: "%s | HireFlow AI" },
  description,
  applicationName: "HireFlow AI",
  keywords: ["jobs in India", "AI resume builder", "XYZ resume", "cover letter generator", "ATS resume", "fresher jobs", "remote jobs"],
  alternates: { canonical: "/" },
  openGraph: {
    title: "HireFlow AI",
    description: "Real jobs from company career pages, and a tailored XYZ resume for each one.",
    url,
    siteName: "HireFlow AI",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HireFlow AI",
    description: "Real jobs from company career pages, and a tailored XYZ resume for each one.",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "HireFlow", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7FB" },
    { media: "(prefers-color-scheme: dark)", color: "#0B111E" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-onink">
          Skip to main content
        </a>
        <Providers>
          {children}
          <CookieConsent />
        </Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
