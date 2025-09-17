import { BrowserContext, Page } from 'playwright';
import { log } from './logger';
import { ListingResult } from './types';

export const getListingLinks = async (page: Page): Promise<string[]> => {
  const anchorSel =
	'a.MuiTypography-root.MuiTypography-inherit.MuiLink-root.MuiLink-underlineAlways.css-1s6ohwi';
  const anchors = await page.$$(anchorSel);
  const hrefs: string[] = [];
	for (const a of anchors) {
		const href = await a.getAttribute('href');
		if (!href) continue;
		const full = href.startsWith('/') ? `https://www.sreality.cz${href}` : href;
		if (full.startsWith('https://a.seznam.cz/')) continue;
		if (full.includes('/detail/') && !hrefs.includes(full)) {
			hrefs.push(full);
		}
	}
  return hrefs;
};

export const scrapeListing = async (
  context: BrowserContext,
  url: string,
  opts: { navTimeoutMs: number; pageWaitMs: number }
): Promise<ListingResult> => {
  const page = await context.newPage();
  log(`🔎 Opening detail page: ${url}`);
  try {
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.navTimeoutMs });
	await page.waitForTimeout(opts.pageWaitMs);
	const imgEl = await page.$('[data-e2e="detail-gallery-desktop"] img');
	const title = imgEl
	  ? ((await imgEl.getAttribute('alt'))?.trim() || 'N/A')
	  : 'N/A';
	log(`📌 Title: ${title}`);
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
	const images: string[] = [];
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
  } catch (err: any) {
	log(`❌ Error scraping listing ${url}: ${err.message || err}`);
	return { url, title: 'ERROR', description: '', images: [] };
  } finally {
	await page.close();
	log(`🔒 Closed page for: ${url}`);
  }
};
