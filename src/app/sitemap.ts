import type { MetadataRoute } from "next";

const SITE_URL = process.env.APP_URL || "https://atrion-2-0.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/pricing", "/legal", "/login", "/register"];
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
  }));
}
