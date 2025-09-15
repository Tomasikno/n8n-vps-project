// scripts/scraper.js
const { chromium } = require('playwright');
const fs = require('fs').promises;
const fss = require('fs');
const path = require('path');
const archiver = require('archiver');

/* =========================
   Config & helpers
   ========================= */
const envInt = (v, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const CONFIG = {
  baseUrl:
    process.env.SCRAPER_URL ||
    'https://www.sreality.cz/hledani/pronajem/byty/praha?velikost=3%2Bkk',
  maxListings: envInt(process.env.SCRAPER_LIMIT, Infinity),
  maxPages: envInt(process.env.SCRAPER_PAGE_LIMIT, Infinity),
  navTimeoutMs: envInt(process.env.NAV_TIMEOUT_MS, 30000),
  itemDelayMs: envInt(process.env.ITEM_DELAY_MS, 500),
  pageWaitMs: envInt(process.env.PAGE_WAIT_MS, 1000),
  concurrency: envInt(process.env.SCRAPER_CONCURRENCY, 3), // NEW
  headless: process.env.HEADLESS === 'false' ? false : true,
  outputDir: __dirname,
  outputJson: 'results.json',
  outputZip: 'results.zip',
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const now = () => new Date().toISOString();
const log = (...args) => console.log(`[${now()}]`, ...args);

/* =========================
   Cookie consent handler
   ========================= */
// Utility to handle cookie consent
async function handleCookieConsent(page) {
  console.log('Checking for consent button...');

  try {
    // First try on the main page
    const consentButton = await page.waitForSelector(
      'button[data-testid="cw-button-agree-with-ads"]',
      { timeout: 7000 }
    );
    if (consentButton) {
      console.log('Clicking consent button on main page.');
      await consentButton.click();
      await page.waitForTimeout(1000);
      return true;
    }
  } catch (e) {
    console.log('Consent button not found on main page, checking iframes...');
  }

  // Fallback: scan iframes
  for (const frame of page.frames()) {
    try {
      if (frame.isDetached()) continue; // ✅ skip if iframe is already gone

      const consentButton = await frame.$(
        'button[data-testid="cw-button-agree-with-ads"]'
      );
      if (consentButton) {
        console.log('Clicking consent button inside iframe.');
        await consentButton.click();
        await page.waitForTimeout(500);
        return true;
      }
    } catch (err) {
      console.log('Iframe check failed (probably detached).');
    }
  }

  console.log('No consent button found.');
  return false;
}

async function saveScreenshot(page, outDir, fileName) {
  const filePath = path.join(outDir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

/* =========================
   Page scraping utilities
   ========================= */
async function goto(page, url, timeout) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
}

async function getListingLinks(page) {
  const anchorSel =
    'a.MuiTypography-root.MuiTypography-inherit.MuiLink-root.MuiLink-underlineAlways.css-1s6ohwi';
  const anchors = await page.$$(anchorSel);
  const hrefs = [];

  for (const a of anchors) {
    const href = await a.getAttribute('href');
    if (!href) continue;

    const full = href.startsWith('/')
      ? `https://www.sreality.cz${href}`
      : href;

    // ✅ Only keep detail pages
    if (full.includes('/detail/') && !hrefs.includes(full)) {
      hrefs.push(full);
    }
  }

  return hrefs;
}


async function scrapeListing(context, url, { navTimeoutMs, pageWaitMs }) {
  const page = await context.newPage();
  log(`🔎 Opening detail page: ${url}`);

  try {
    await goto(page, url, navTimeoutMs);
    await page.waitForTimeout(pageWaitMs);

    // --- Title ---
    const imgEl = await page.$('[data-e2e="detail-gallery-desktop"] img');
    const title = imgEl
      ? ((await imgEl.getAttribute('alt'))?.trim() || 'N/A')
      : 'N/A';
    log(`📌 Title: ${title}`);

    // --- Description ---
    const descEl = await page.$(
      '[data-e2e*="description"], div[class*="description"], p[class*="description"]'
    );
    const description = descEl
      ? ((await descEl.innerText())?.trim() || 'N/A')
      : 'N/A';
    log(
      `📝 Description: ${
        description.length > 80 ? description.slice(0, 80) + '...' : description
      }`
    );

    // --- Images ---
    const images = [];
    const imageEls = await page.$$(
      '[data-e2e="detail-gallery-desktop"] img[loading="lazy"]'
    );

    log(`🖼 Found ${imageEls.length} image elements.`);

    for (const img of imageEls) {
      const src = await img.getAttribute('src');
      const srcset = await img.getAttribute('srcset');

      if (src) {
        const fullSrc = src.startsWith('http') ? src : `https:${src}`;
        if (!images.includes(fullSrc)) {
          images.push(fullSrc);
          log(`   ➕ Added src: ${fullSrc}`);
        }
      }

      if (srcset) {
        const sources = srcset.split(',').map((s) => s.trim().split(' ')[0]);
        const high = sources[sources.length - 1];
        if (high) {
          const fullHigh = high.startsWith('http') ? high : `https:${high}`;
          if (!images.includes(fullHigh)) {
            images.push(fullHigh);
            log(`   ➕ Added srcset high-res: ${fullHigh}`);
          }
        }
      }
    }

    log(`✅ Collected ${images.length} image URLs for listing.`);

    return { url, title, description, images };
  } catch (err) {
    log(`❌ Error scraping listing ${url}: ${err.message || err}`);
    return { url, title: 'ERROR', description: '', images: [] };
  } finally {
    await page.close();
    log(`🔒 Closed page for: ${url}`);
  }
}

/* =========================
   Concurrency helper
   ========================= */
async function processWithConcurrency(items, worker, concurrency, delay = 0) {
  const results = [];
  let index = 0;

  async function next() {
    if (index >= items.length) return;
    const i = index++;
    try {
      const res = await worker(items[i], i);
      if (res) results.push(res);
    } catch (err) {
      console.error(`Error on item ${i}:`, err?.message || err);
    } finally {
      if (delay) await sleep(delay);
      await next();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

/* =========================
   Output helpers
   ========================= */
async function saveResults(results, outDir, jsonName) {
  const file = path.join(outDir, jsonName);
  await fs.writeFile(file, JSON.stringify(results, null, 2), 'utf8');
  return file;
}

async function zipFile(filePath, outDir, zipName) {
  const zipPath = path.join(outDir, zipName);
  const output = fss.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);
  archive.file(filePath, { name: path.basename(filePath) });
  await archive.finalize();
  await new Promise((resolve) => output.on('close', resolve));
  return zipPath;
}

/* =========================
   Previous run helpers
   ========================= */
async function loadPreviousUrls(prevFile) {
  try {
    const raw = await fs.readFile(prevFile, "utf8");
    const oldResults = JSON.parse(raw);
    const urls = new Set(oldResults.map(r => r.url));
    log(`Loaded ${urls.size} previous URLs to skip.`);
    return urls;
  } catch {
    log("No previous results found (first run?). prevFile:", prevFile);
    return new Set();
  }
}

/* =========================
   Runner
   ========================= */
(async function main() {
  log('Starting scraper with config:', CONFIG);
  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext();

  const prevFile = path.join(CONFIG.outputDir, "prev/results.json");
  const oldUrls = await loadPreviousUrls(prevFile);

  const results = [];
  let pageNum = 1;

  try {
    while (pageNum <= CONFIG.maxPages && results.length < CONFIG.maxListings) {
      const url =
        `${CONFIG.baseUrl}${CONFIG.baseUrl.includes('?') ? '&' : '?'}strana=${pageNum}`;
      const page = await context.newPage();

      try {
        await goto(page, url, CONFIG.navTimeoutMs);
        await handleCookieConsent(page);
        log(`Cookie consent handled, on page ${pageNum}.`);
        try {
            log(`Waiting for listings on page ${pageNum}...`);
            await page.waitForSelector('[data-e2e="estates-list"]', { timeout: 10000 });
          } catch {
            // Take screenshot if listings not found (timeout)
            const screenshotPath = await saveScreenshot(page, CONFIG.outputDir, `no-listings-page${pageNum}.png`);
            const zipPath = path.join(CONFIG.outputDir, CONFIG.outputZip);
            const output = fss.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.pipe(output);
            archive.file(screenshotPath, { name: `no-listings-page${pageNum}.png` });
            await archive.finalize();
            await new Promise((resolve) => output.on('close', resolve));
            log(`Archived screenshot for missing listings on page ${pageNum}: ${zipPath}`);
            log(`⚠️ Did not find listings on page ${pageNum}, stopping. Selection timeout. data-e2e="estates-list"`);
          break;
        }

        const links = await getListingLinks(page);

        if (links.length === 0) {
          log(`⚠️ No listings found on page ${pageNum}.`);

          if (pageNum === 1) {
            // Take screenshot of first page if empty
            const screenshotPath = await saveScreenshot(page, CONFIG.outputDir, 'no-listings.png');

            const zipPath = path.join(CONFIG.outputDir, CONFIG.outputZip);
            const output = fss.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.pipe(output);
            archive.file(screenshotPath, { name: 'no-listings.png' });
            await archive.finalize();
            await new Promise((resolve) => output.on('close', resolve));

            log(`Archived screenshot for empty page: ${zipPath}`);
          }

          break; // stop processing further pages
        }

          // Limit links to remaining quota
        const remaining = CONFIG.maxListings - results.length;
        const toProcess = links.slice(0, remaining);

        const pageResults = await processWithConcurrency(
          toProcess,
          async (link, idx) => {
            if (oldUrls.has(link)) {
              log(`🔄 Skipping duplicate: ${link}`);
              return { link, title: "", description: "", images: [] };
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

        // Only push valid, non-null results
        const newItems = pageResults.filter(Boolean);
        results.push(...pageResults);
        log(`Collected ${results.length} so far (added ${newItems.length}, skipped ${toProcess.length - newItems.length}).`);

      } finally {
        await page.close();
      }

      pageNum += 1;
    }

    // Only save results if we actually have them
    if (results.length > 0) {
      const jsonPath = await saveResults(results, CONFIG.outputDir, CONFIG.outputJson);
      const zipPath = await zipFile(jsonPath, CONFIG.outputDir, CONFIG.outputZip);
      log(`Wrote ${results.length} listings.`);
      log(`JSON: ${jsonPath}`);
      log(`ZIP:  ${zipPath}`);
    }
  } catch (err) {
    console.error('Scraper failed:', err?.message || err);
  } finally {
    await browser.close();
    log('Browser closed.');
  }
})();
