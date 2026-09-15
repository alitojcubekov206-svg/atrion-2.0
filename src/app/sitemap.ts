import type { MetadataRoute } from "next";
import { siteUrl } from "@/backend/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const routes = ["", "/pricing", "/legal", "/login", "/register", "/forgot-password"];
  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
  }));
}
