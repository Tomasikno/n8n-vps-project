
import { ScraperConfig } from './types';

export const envInt = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const CONFIG: ScraperConfig = {
  baseUrl:
    process.env.SCRAPER_URL ||
    'https://www.sreality.cz/hledani/pronajem/byty/praha?velikost=3%2Bkk',
  maxListings: envInt(process.env.SCRAPER_LIMIT, Infinity),
  maxPages: envInt(process.env.SCRAPER_PAGE_LIMIT, Infinity),
  navTimeoutMs: envInt(process.env.NAV_TIMEOUT_MS, 30000),
  itemDelayMs: envInt(process.env.ITEM_DELAY_MS, 500),
  pageWaitMs: envInt(process.env.PAGE_WAIT_MS, 1000),
  concurrency: envInt(process.env.SCRAPER_CONCURRENCY, 3),
  headless: process.env.HEADLESS === 'false' ? false : true,
  outputDir: __dirname,
  outputJson: 'results.json',
  outputZip: 'results.zip',
};
