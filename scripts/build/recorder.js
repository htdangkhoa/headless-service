import fs from 'fs';
import { join } from 'path';
import { build } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';

const cwd = process.cwd();

const entryDir = join(cwd, 'src', 'shared', 'recorder');

const entryPoints = fs
  .readdirSync(entryDir)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => join(cwd, 'src', 'shared', 'recorder', file));

const outdir = join(cwd, 'extensions', 'recorder');

const manifestContent = fs.readFileSync(join(entryDir, 'manifest.json'), 'utf-8');

async function main() {
  await build({
    bundle: true,
    entryPoints,
    metafile: true,
    outdir,
    plugins: [
      polyfillNode({
        globals: {
          process: true,
        },
      }),
    ],
  });

  fs.writeFileSync(join(outdir, 'manifest.json'), manifestContent);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
