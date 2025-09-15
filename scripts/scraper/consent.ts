import { Page } from 'playwright';
import { log } from './logger';

export async function handleCookieConsent(page: Page): Promise<boolean> {
  log('Checking for consent button...');
  try {
    const consentButton = await page.waitForSelector(
      'button[data-testid="cw-button-agree-with-ads"]',
      { timeout: 7000 }
    );
    if (consentButton) {
      log('Clicking consent button on main page.');
      await consentButton.click();
      await page.waitForTimeout(1000);
      return true;
    }
  } catch (e) {
    log('Consent button not found on main page, checking iframes...');
  }
  for (const frame of page.frames()) {
    try {
      if ((frame as any).isDetached && frame.isDetached()) continue;
      const consentButton = await frame.$(
        'button[data-testid="cw-button-agree-with-ads"]'
      );
      if (consentButton) {
        log('Clicking consent button inside iframe.');
        await consentButton.click();
        await page.waitForTimeout(500);
        return true;
      }
    } catch (err) {
      log('Iframe check failed (probably detached).');
    }
  }
  log('No consent button found.');
  return false;
}
