import * as fs from 'fs/promises';
import * as fss from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { log } from './logger';

export async function saveResults(results: any[], outDir: string, jsonName: string): Promise<string> {
  const file = path.join(outDir, jsonName);
  await fs.writeFile(file, JSON.stringify(results, null, 2), 'utf8');
  return file;
}

export async function zipFile(filePath: string, outDir: string, zipName: string): Promise<string> {
  const zipPath = path.join(outDir, zipName);
  const output = fss.createWriteStream(zipPath);
  const archiveObj = archiver('zip', { zlib: { level: 9 } });
  archiveObj.pipe(output);
  archiveObj.file(filePath, { name: path.basename(filePath) });
  await archiveObj.finalize();
  await new Promise((resolve) => output.on('close', () => resolve(undefined)));
  return zipPath;
}

export async function loadPreviousUrls(prevFile: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(prevFile, 'utf8');
    const data = JSON.parse(raw);
    const urls = Array.isArray(data)
      ? new Set<string>(data)
      : new Set<string>(data.map((r: any) => r.url));
    log(`Loaded ${urls.size} previous URLs to skip.`);
    return urls;
  } catch {
    log('No previous results found (first run?). prevFile:', prevFile);
    return new Set<string>();
  }
}
