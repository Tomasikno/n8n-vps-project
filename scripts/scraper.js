const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

// Utility to handle cookie consent
async function handleCookieConsent(page) {
  console.log('Checking for consent button...');
  try {
    await page.waitForSelector('button[data-testid="cw-button-agree-with-ads"]', { timeout: 5000 });
    const consentButton = await page.$('button[data-testid="cw-button-agree-with-ads"]');
    if (consentButton) {
      await consentButton.click();
      await page.waitForTimeout(500);
      return;
    }
  } catch (e) {
    console.log('Consent button not found on main page, checking iframes...');
    for (const frame of page.frames()) {
      const consentButton = await frame.$('button[data-testid="cw-button-agree-with-ads"]');
      if (consentButton) {
        await consentButton.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  }
}

async function scrapeSreality() {
  console.log('Starting scraper...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const results = [];
  const imageFiles = [];

  try {
    // Navigate to the main listings page
    const url = process.env.SCRAPER_URL || 'https://www.sreality.cz/hledani/pronajem/byty/praha?velikost=3%2Bkk';
    console.log('Navigating to:', url);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    // Handle cookie consent
    await handleCookieConsent(page);

    // Wait for listings to load
    await page.waitForSelector('ul.MuiGrid2-root', { timeout: 10000 });

    // Get listing links
    const listings = await page.$$('a.MuiTypography-root.MuiTypography-inherit.MuiLink-root.MuiLink-underlineAlways.css-1s6ohwi');
    console.log(`Found ${listings.length} listings.`);

    // Process up to 5 listings
    let idx = 0;
    for (const listing of listings.slice(0, 5)) {
      idx++;
      console.log(`Processing listing #${idx}`);
      const href = await listing.getAttribute('href');
      const fullUrl = href.startsWith('/') ? `https://www.sreality.cz${href}` : href;

      // Open detail page
      const detailPage = await context.newPage();
      try {
        console.log('Opening detail page:', fullUrl);

        await detailPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await detailPage.waitForTimeout(1000); // Wait 1s for dynamic content

        // Handle cookie consent on detail page
        //await handleCookieConsent(detailPage);

        // Extract title from the first gallery image's alt attribute
        const titleElement = await detailPage.$('[data-e2e="detail-gallery-desktop"] img');
        const title = titleElement ? (await titleElement.getAttribute('alt'))?.trim() || 'N/A' : 'N/A';

        // Extract description
        const descriptionElement = await detailPage.$('[data-e2e*="description"], div[class*="description"], p[class*="description"]');
        const description = descriptionElement ? (await descriptionElement.innerText())?.trim() || 'N/A' : 'N/A';

        // Take screenshot
        const screenshotPath = path.join(__dirname, `listing_${idx}.png`);
        await detailPage.screenshot({ path: screenshotPath, fullPage: true });
        imageFiles.push(screenshotPath);

        // Extract image URLs
        const images = [];
        const imageElements = await detailPage.$$('[data-e2e="detail-gallery-desktop"] img[loading="lazy"]');
        for (const img of imageElements) {
          const src = await img.getAttribute('src');
          const srcset = await img.getAttribute('srcset');
          if (src) {
            const fullSrc = src.startsWith('http') ? src : `https:${src}`;
            if (!images.includes(fullSrc)) images.push(fullSrc);
          }
          if (srcset) {
            const sources = srcset.split(', ').map(s => s.split(' ')[0]);
            const highRes = sources[sources.length - 1];
            if (highRes && !images.includes(highRes)) images.push(highRes);
          }
        }

        // Store results
        results.push({
          title,
          description,
          images,
          screenshotPath,
        });

        console.log(`Finished listing #${idx}: ${title}`);
      } catch (err) {
        console.error(`Error processing listing #${idx}:`, err.message);
      } finally {
        await detailPage.close();
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // Save results to JSON
    console.log('Saving results to results.json...');
    await fs.writeFile(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));

    // Compress results.json and screenshots into results.zip
    console.log('Compressing results.json and screenshots into results.zip...');
    const resultsOutput = require('fs').createWriteStream(path.join(__dirname, 'results.zip'));
    const resultsArchive = archiver('zip', { zlib: { level: 9 } });
    resultsArchive.pipe(resultsOutput);
    resultsArchive.file(path.join(__dirname, 'results.json'), { name: 'results.json' });
    for (const file of imageFiles) {
      resultsArchive.file(file, { name: path.basename(file) });
    }
    await resultsArchive.finalize();
    await new Promise(resolve => resultsOutput.on('close', resolve));

    // Log results for debugging
    results.forEach((result, i) => {
      console.log(`Listing ${i + 1}:`);
      console.log(`Title: ${result.title}`);
      console.log(`Description: ${result.description}`);
      console.log(`Images: ${result.images.join(', ')}`);
      console.log('\n---\n');
    });

  } catch (err) {
    console.error('Scraper failed:', err.message);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

scrapeSreality().catch(console.error);