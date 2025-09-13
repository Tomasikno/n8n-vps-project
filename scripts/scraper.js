const { chromium } = require('playwright');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const https = require('https');
const archiver = require('archiver');

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      if (resp.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${resp.statusCode})`));
        return;
      }
      const file = fs.createWriteStream(filepath);
      resp.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', reject);
  });
}

async function scrapeSreality() {
  console.log('Starting scraper...');
  const browser = await chromium.launch({ headless: true }); // Headless true for CI
  const page = await browser.newPage();
  
  // Get URL from environment variable or use default
  const url = process.env.SCRAPER_URL || 'https://www.sreality.cz/hledani/pronajem/byty/praha?velikost=3%2Bkk';
  console.log('Navigating to:', url);

  await page.goto(url);

  // Accept cookies if the consent button is present (robust: wait, handle iframe)
  console.log('Checking for consent button on main page...');
  let consentButton;
  try {
    await page.waitForSelector('button[data-testid="cw-button-agree-with-ads"]', { timeout: 5000 });
    consentButton = await page.$('button[data-testid="cw-button-agree-with-ads"]');
    if (consentButton) {
      await consentButton.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    // Try to find the button in iframes if not found on main page
    for (const frame of page.frames()) {
      consentButton = await frame.$('button[data-testid="cw-button-agree-with-ads"]');
      if (consentButton) {
        await consentButton.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  }
  
  // Wait for listings to load
  await page.waitForSelector('ul.MuiGrid2-root');
  
  // Find all listing links
  const listings = await page.$$('a.MuiTypography-root.MuiTypography-inherit.MuiLink-root.MuiLink-underlineAlways.css-1s6ohwi');
  
  const results = [];
  const filesToZip = [];
  
  let idx = 0;
  for (const listing of listings.slice(0, 5)) {
    idx++;
    console.log(`Processing listing #${idx}`);
    const href = await listing.getAttribute('href');
    const fullUrl = href.startsWith('/') ? `https://www.sreality.cz${href}` : href;

    // Open detail page in new tab
    const detailPage = await browser.newPage();
    console.log('Opening detail page:', fullUrl);
    await detailPage.goto(fullUrl);

    // Accept cookies if the consent button is present (robust: wait, handle iframe)
    console.log('Checking for consent button on detail page...');
    let consentButton;
    try {
      await detailPage.waitForSelector('button[data-testid="cw-button-agree-with-ads"]', { timeout: 5000 });
      consentButton = await detailPage.$('button[data-testid="cw-button-agree-with-ads"]');
      if (consentButton) {
        await consentButton.click();
        await detailPage.waitForTimeout(500);
      }
    } catch (e) {
      for (const frame of detailPage.frames()) {
        consentButton = await frame.$('button[data-testid="cw-button-agree-with-ads"]');
        if (consentButton) {
          await consentButton.click();
          await detailPage.waitForTimeout(500);
          break;
        }
      }
    }

    // Wait for detail page to load
    await detailPage.waitForLoadState('networkidle');
    await detailPage.waitForTimeout(500); // Wait extra 0.5s for page to fully load
    console.log('Detail page loaded. Extracting data...');

    // Take screenshot of the full detail page
    const screenshotPath = `listing_${idx}.png`;
    await detailPage.screenshot({ path: screenshotPath, fullPage: true });
    filesToZip.push(screenshotPath);

    // Extract title from alt attribute of first gallery image (using data-e2e)
    const titleElement = await detailPage.$('[data-e2e="detail-gallery-desktop"] img');
    const title = titleElement ? await titleElement.getAttribute('alt') : 'N/A';

    // Extract description (broad selector; inspect page for exact data-e2e like "detail-description")
    const descriptionElement = await detailPage.$('div[class*="description"], [data-e2e*="description"], p[class*="description"], div.property-description');
    const description = descriptionElement ? await descriptionElement.innerText() : 'N/A';

    // Extract image URLs using data-e2e for gallery, focusing on main lazy-loaded images
    const images = [];
    const imageElements = await detailPage.$$('[data-e2e="detail-gallery-desktop"] img[loading="lazy"]');
    for (const img of imageElements) {
      const src = await img.getAttribute('src');
      if (src) {
        let fullSrc = src.startsWith('http') ? src : `https:${src}`;
        images.push(fullSrc);
      }
      const srcset = await img.getAttribute('srcset');
      if (srcset) {
        const sources = srcset.split(', ').map(s => s.split(' ')[0]);
        const highRes = sources[sources.length - 1];
        if (highRes && !images.includes(highRes)) {
          let fullHighRes = highRes.startsWith('http') ? highRes : `https:${highRes}`;
          images.push(fullHighRes);
        }
      }
    }

    results.push({
      title: title ? title.trim() : 'N/A',
      description: description.trim(),
      images: images
    });

    console.log(`Finished listing #${idx}:`, title);
    await detailPage.close();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Avoid rate limiting
  }
  
  console.log('All listings processed. Closing browser...');
  await browser.close();
  
  // Save results to a file (includes titles, descriptions, image URLs)
  console.log('Saving results to results.json...');
  await fsp.writeFile('results.json', JSON.stringify(results, null, 2));
  filesToZip.push('results.json'); // Include JSON in zip
  
  // Compress all files into a zip
  console.log('Compressing files into results.zip...');
  const output = fs.createWriteStream('results.zip');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);

  for (const file of filesToZip) {
    archive.file(file, { name: path.basename(file) });
  }

  await archive.finalize();
  await new Promise((resolve) => output.on('close', resolve));

  // Log results for debugging
  results.forEach(result => {
    console.log(`Title: ${result.title}`);
    console.log(`Description: ${result.description}`);
    console.log(`Images: ${result.images.join(', ')}`);
    console.log('\n---\n');
  });
}

scrapeSreality().catch(console.error);