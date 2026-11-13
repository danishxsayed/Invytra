import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/pricing", "/compare", "/privacy", "/terms", "/refund-policy", "/delivery-policy", "/data-deletion", "/contact"].map((p) => ({
    url: `${SITE.url}${p}`,
    changeFrequency: "monthly",
    priority: p === "" ? 1 : 0.6,
  }));
}
