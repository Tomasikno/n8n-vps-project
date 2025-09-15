// scripts/types.ts

export type ListingResult = {
  url: string;
  title: string;
  description: string;
  images: string[];
};

export type ScraperConfig = {
  baseUrl: string;
  maxListings: number;
  maxPages: number;
  navTimeoutMs: number;
  itemDelayMs: number;
  pageWaitMs: number;
  concurrency: number;
  headless: boolean;
  outputDir: string;
  outputJson: string;
  outputZip: string;
};
