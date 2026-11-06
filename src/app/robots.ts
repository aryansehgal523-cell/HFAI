import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/profile", "/tailor", "/settings", "/admin", "/print"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
