import fs from 'fs';
import { join } from 'path';
import { build } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import * as glob from 'glob';

const cwd = process.cwd();

// const extensionsDir = join(cwd, 'src', 'shared', 'extensions');

// const entryDir = join(cwd, 'src', 'shared', 'extensions');

// const entryPoints = fs
//   .readdirSync(entryDir)
//   .filter((file) => file.endsWith('.ts'))
//   .map((file) => join(cwd, 'src', 'shared', 'recorder', file));

// const outdir = join(cwd, 'extensions', 'recorder');

// const manifestContent = fs.readFileSync(join(entryDir, 'manifest.json'), 'utf-8');

// async function main() {
//   await build({
//     bundle: true,
//     entryPoints,
//     metafile: true,
//     outdir,
//     plugins: [
//       polyfillNode({
//         globals: {
//           process: true,
//         },
//       }),
//     ],
//   });

//   fs.writeFileSync(join(outdir, 'manifest.json'), manifestContent);
// }

// main().catch((e) => {
//   console.error(e);
//   process.exit(1);
// });

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
    },
    plugins: [
      polyfillNode({
        globals: {
          process: true,
        },
      }),
    ],
  });

  const manifestContent = fs.readFileSync(join(extensionDir, 'manifest.json'), 'utf-8');
  fs.writeFileSync(join(outdir, 'manifest.json'), manifestContent);
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
