import type { MetadataRoute } from "next";

const SITE = process.env.APP_URL || "https://slidemaker.ru";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/success"] },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
