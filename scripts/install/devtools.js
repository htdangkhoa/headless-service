import { createWriteStream, existsSync, ReadStream, renameSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import extractZip from 'extract-zip';

import { downloadFile } from './utils/download.js';

const tmpdir = os.tmpdir();

const name = 'devtools-frontend';

const zipFileName = `${tmpdir}/${name}.zip`;

const extractedDir = `${tmpdir}/${name}`;

const publicDir = `${process.cwd()}/public`;

const devtoolsPath = join(publicDir, 'devtools');

const devtoolsDownloadUrl =
  'https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Mac%2F848005%2Fdevtools-frontend.zip?alt=media';

async function main() {
  if (existsSync(devtoolsPath)) {
    rmSync(devtoolsPath, { recursive: true, force: true });
  }

  await downloadFile(devtoolsDownloadUrl, zipFileName);

  await extractZip(zipFileName, { dir: tmpdir });

  const deepPath = `${extractedDir}/resources/inspector`;
  renameSync(deepPath, devtoolsPath);

  rmSync(zipFileName, { recursive: true, force: true });
  rmSync(extractedDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
