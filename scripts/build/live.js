import fs from 'fs';
import { join } from 'path';
import dedent from 'dedent';
import { build } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import * as glob from 'glob';

const cwd = process.cwd();

const entryPoints = glob.sync(join(cwd, 'src', 'shared', 'live', '**', '*.*'));

const outdir = join(cwd, 'public', 'live');

const htmlLocation = join(process.cwd(), 'public', 'live', 'index.html');

const JS_REGEX = /\.js$/,
  CSS_REGEX = /\.css$/;

const DISABLE_DEVTOOL_SCRIPT = `<script disable-devtool-auto src='https://cdn.jsdelivr.net/npm/disable-devtool'></script>`;

const isProduction = process.env.NODE_ENV === 'production';

const html = (styles, scripts) => dedent`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>Headless Live</title>
    ${styles}
    ${isProduction ? DISABLE_DEVTOOL_SCRIPT : ''}
  </head>
  <body oncontextmenu="return false;">
    <main id="app"></main>
    ${scripts}
  </body>
</html>
`;

async function main() {
  const r = await build({
    bundle: true,
    entryPoints,
    metafile: true,
    outdir,
    loader: {
      // convert all image files
      '.png': 'copy',
      '.jpg': 'copy',
      '.jpeg': 'copy',
      '.gif': 'copy',
      '.svg': 'file',
      '.webp': 'copy',
      '.ico': 'copy',
    },
    plugins: [
      polyfillNode({
        globals: {
          process: false,
        },
      }),
    ],
  });

  const outputFiles = Object.keys(r.metafile.outputs);

  const bundles = outputFiles.reduce(
    (acc, key) => {
      if (JS_REGEX.test(key)) {
        acc.js.push(key);
      } else if (CSS_REGEX.test(key)) {
        acc.css.push(key);
      }

      return acc;
    },
    {
      js: [],
      css: [],
    }
  );

  const styles = bundles.css
    .map((cssPath) => {
      const filename = cssPath.split('/').pop();
      return `<link rel="stylesheet" href="./${filename}" />`;
    })
    .join('\n');

  const scripts = bundles.js
    .map((jsPath) => {
      const filename = jsPath.split('/').pop();
      return `<script src="./${filename}"></script>`;
    })
    .join('\n');

  const finalHtml = html(styles, scripts);

  fs.writeFileSync(htmlLocation, finalHtml);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
