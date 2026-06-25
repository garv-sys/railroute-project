import type { MetadataRoute } from "next";

const siteUrl = "https://hehe-phi-eosin.vercel.app";

const routes = [
  ["", 1],
  ["/trains", 0.95],
  ["/train-search", 0.85],
  ["/pnr", 0.85],
  ["/fare", 0.8],
  ["/route", 0.8],
  ["/coach", 0.75],
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-06-05T00:00:00.000Z");

  return routes.map(([path, priority]) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    changeFrequency: "weekly",
    priority,
  }));
}
