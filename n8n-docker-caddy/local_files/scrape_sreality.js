const { chromium } = require('playwright'); // or 'firefox', 'webkit'

async function scrapeSreality(searchUrl) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

    const listings = [];

    let hasNextPage = true;
    while (hasNextPage) {
        // Wait for listings to load
        await page.waitForSelector('div.property');

        // Extract listings on current page
        const pageListings = await page.$$eval('div.property', nodes =>
            nodes.map(node => {
                const title = node.querySelector('h2 a')?.innerText?.trim() || '';
                const url = node.querySelector('h2 a')?.href || '';
                const price = node.querySelector('.price')?.innerText?.trim() || '';
                const image = node.querySelector('img')?.src || '';
                return { title, url, price, image };
            })
        );

        listings.push(...pageListings);

        // Check for next page button
        const nextButton = await page.$('a.next');
        if (nextButton) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
                nextButton.click(),
            ]);
        } else {
            hasNextPage = false;
        }
    }

    await browser.close();
    return listings;
}

// Example usage
(async () => {
    const url = process.argv[2] || 'https://www.sreality.cz/hledani/pronajem/byty/praha-3';
    const data = await scrapeSreality(url);
    console.log(JSON.stringify(data, null, 2));
})();