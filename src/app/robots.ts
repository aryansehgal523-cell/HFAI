import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";
import { sitemapFilesInUse } from "./sitemap";

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  // One sitemap file per 45,000 open jobs (see sitemap.ts).
  const files = Array.from({ length: await sitemapFilesInUse() }, (_, id) => ({ id }));
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/profile", "/tailor", "/settings", "/admin", "/print"] }],
    sitemap: files.map(({ id }) => absoluteUrl(`/sitemap/${id}.xml`)),
  };
}
