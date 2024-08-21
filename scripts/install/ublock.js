import os from 'node:os';
import { createWriteStream, ReadStream, renameSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import extractZip from 'extract-zip';
import { downloadFile } from './utils/download.js';

const API_RELEASE_URL = 'https://api.github.com/repos/gorhill/uBlock/releases/latest';

const tmpdir = os.tmpdir();

const browser = 'chromium';

const extensionName = ['uBlock0', browser].join('.');

const zipFileName = `${tmpdir}/${extensionName}.zip`;

const extractedDir = `${tmpdir}/${extensionName}`;

const extensionDir = `${process.cwd()}/extensions`;

const extensionPath = join(extensionDir, extensionName);

async function main() {
  if (existsSync(extensionPath)) {
    rmSync(extensionPath, { recursive: true, force: true });
  }

  const { assets } = await fetch(API_RELEASE_URL).then((response) => response.json());

  const chromiumAsset = assets.find((asset) => asset.name.includes('chromium'));

  if (!chromiumAsset) {
    throw new Error('Chromium asset not found');
  }

  const downloadUrl = chromiumAsset.browser_download_url;

  await downloadFile(downloadUrl, zipFileName);

  await extractZip(zipFileName, { dir: tmpdir });

  renameSync(extractedDir, extensionPath);

  rmSync(zipFileName, { recursive: true, force: true });
  rmSync(extractedDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
