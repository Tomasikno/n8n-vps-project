import { chromium } from 'playwright';
import { CONFIG } from './config';
import { log } from './logger';
import { sleep } from './utils';
import { handleCookieConsent } from './consent';
import { getListingLinks, scrapeListing } from './scraper';
import { processWithConcurrency } from './concurrency';
import { saveResults, zipFile, loadPreviousUrls } from './storage';

(async function main() {
  log('Starting scraper with config:', CONFIG);
  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext();
  const prevFile = `/dist/notion/prev/results-notion.json`;
  const oldUrls = await loadPreviousUrls(prevFile);
  const results: any[] = [];
  let pageNum = 1;
  try {
    while (pageNum <= CONFIG.maxPages && results.length < CONFIG.maxListings) {
      const url =
        `${CONFIG.baseUrl}${CONFIG.baseUrl.includes('?') ? '&' : '?'}strana=${pageNum}`;
      const page = await context.newPage();
      try {
        await sleep(100);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navTimeoutMs });
        await handleCookieConsent(page);
        log(`Cookie consent handled, on page ${pageNum}.`);
        try {
          log(`Waiting for listings on page ${pageNum}...`);
          await page.waitForSelector('[data-e2e="estates-list"]', { timeout: 10000 });
        } catch {
          log(`⚠️ Did not find listings on page ${pageNum}, stopping.`);
          break;
        }
        const links = await getListingLinks(page);
        if (links.length === 0) {
          log(`⚠️ No listings found on page ${pageNum}.`);
          break;
        }
        const remaining = CONFIG.maxListings - results.length;
        const toProcess = links.slice(0, remaining);
        const pageResults = await processWithConcurrency(
          toProcess,
          async (link: string, idx: number) => {
            if (oldUrls.has(link)) {
              log(`🔄 Skipping duplicate: ${link}`);
              return { link, title: '', description: '', images: [] };
            }
            log(`(${idx + 1}/${toProcess.length}) Fetching ${link}`);
            return await scrapeListing(context, link, {
              navTimeoutMs: CONFIG.navTimeoutMs,
              pageWaitMs: CONFIG.pageWaitMs,
            });
          },
          CONFIG.concurrency,
          CONFIG.itemDelayMs
        );
        const newItems = pageResults.filter(Boolean);
        results.push(...pageResults);
        log(`Collected ${results.length} so far (added ${newItems.length}, skipped ${toProcess.length - newItems.length}).`);
      } finally {
        await page.close();
      }
      pageNum += 1;
    }
    if (results.length > 0) {
      const jsonPath = await saveResults(results, CONFIG.outputDir, CONFIG.outputJson);
      const zipPath = await zipFile(jsonPath, CONFIG.outputDir, CONFIG.outputZip);
      log(`Wrote ${results.length} listings.`);
      log(`JSON: ${jsonPath}`);
      log(`ZIP:  ${zipPath}`);
    }
  } catch (err: any) {
    console.error('Scraper failed:', err?.message || err);
  } finally {
    await browser.close();
    log('Browser closed.');
  }
})();
