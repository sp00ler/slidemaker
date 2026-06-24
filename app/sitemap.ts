import type { MetadataRoute } from "next";

const SITE = process.env.APP_URL || "https://slidemaker.ru";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
