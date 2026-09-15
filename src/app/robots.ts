import type { MetadataRoute } from "next";
import { siteUrl } from "@/backend/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/", "/share/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
