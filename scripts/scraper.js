const { chromium } = require('playwright');
const fs = require('fs').promises;

async function scrapeSreality() {
  const browser = await chromium.launch({ headless: true }); // Headless for CI
  const page = await browser.newPage();
  
  // Get URL from environment variable or use default
  const url = process.env.SCRAPER_URL || 'https://www.sreality.cz/hledani/pronajem/byty/praha?velikost=3%2Bkk';
  await page.goto(url);
  
  // Wait for listings to load
  await page.waitForSelector('ul.MuiGrid2-root');
  
  // Find all listing links
  const listings = await page.$$('a.MuiTypography-root.MuiTypography-inherit.MuiLink-root.MuiLink-underlineAlways.css-1s6ohwi');
  
  const results = [];
  
  for (const listing of listings) {
    const href = await listing.getAttribute('href');
    const fullUrl = href.startsWith('/') ? `https://www.sreality.cz${href}` : href;
    
    // Open detail page in new tab
    const detailPage = await browser.newPage();
    await detailPage.goto(fullUrl);
    
    // Wait for detail page to load
    await detailPage.waitForLoadState('networkidle');
    
    // Extract title
    const titleElement = await detailPage.$('h1');
    const title = titleElement ? await titleElement.innerText() : 'N/A';
    
    // Extract description (adjust selector as needed)
    const descriptionElement = await detailPage.$('div.description, div[class*="description"], p[class*="description"]');
    const description = descriptionElement ? await descriptionElement.innerText() : 'N/A';
    
    // Extract image URLs
    const images = [];
    const imageElements = await detailPage.$$('img[class*="css-f5kes"], img[data-testid="gallery-image"]');
    for (const img of imageElements) {
      const src = await img.getAttribute('src');
      if (src) {
        const fullSrc = src.replace('res,800,600,3|shr,,20|webp,60', 'orig');
        images.push(fullSrc);
      }
    }
    
    results.push({
      title: title.trim(),
      description: description.trim(),
      images: images
    });
    
    await detailPage.close();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Avoid rate limiting
  }
  
  await browser.close();
  
  // Save results to a file
  await fs.writeFile('results.json', JSON.stringify(results, null, 2));
  
  // Log results for debugging
  results.forEach(result => {
    console.log(`Title: ${result.title}`);
    console.log(`Description: ${result.description}`);
    console.log(`Images: ${result.images.join(', ')}`);
    console.log('\n---\n');
  });
}

scrapeSreality().catch(console.error);