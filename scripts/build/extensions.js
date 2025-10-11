import fs from 'fs';
import { join } from 'path';
import { build } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import * as glob from 'glob';

const cwd = process.cwd();

async function buildExtension(extensionDir) {
  const dirName = extensionDir.split('/').pop();

  const entryPoints = glob.sync(join(extensionDir, '**', '*.*'));

  const outdir = join(cwd, 'extensions', dirName);

  await build({
    bundle: true,
    entryPoints,
    metafile: true,
    outdir,
    loader: {
      '.html': 'copy',
      '.json': 'copy',
    },
    plugins: [
      polyfillNode({
        globals: {
          process: true,
        },
      }),
    ],
  });
}

async function main() {
  const extensionsDir = glob.sync(join(cwd, 'src', 'shared', 'extensions', '*'));

  for (const extensionDir of extensionsDir) {
    await buildExtension(extensionDir);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
