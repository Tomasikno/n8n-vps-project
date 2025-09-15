import { Page } from 'playwright';
import * as path from 'path';

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function goto(page: Page, url: string, timeout: number): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
}

export async function saveScreenshot(page: Page, outDir: string, fileName: string): Promise<string> {
  const filePath = path.join(outDir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}
