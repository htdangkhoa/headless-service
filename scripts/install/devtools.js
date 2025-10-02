import { createWriteStream, existsSync, ReadStream, renameSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import extractZip from 'extract-zip';
import { rimrafSync } from 'rimraf';

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
    rimrafSync(devtoolsPath);
  }

  await downloadFile(devtoolsDownloadUrl, zipFileName);

  await extractZip(zipFileName, { dir: tmpdir });

  const deepPath = `${extractedDir}/resources/inspector`;
  renameSync(deepPath, devtoolsPath);

  rimrafSync(zipFileName);
  rimrafSync(extractedDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
