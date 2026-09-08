import type { MetadataRoute } from "next";

const SITE_URL = process.env.APP_URL || "https://atrion-2-0.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
