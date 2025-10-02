import fs from 'fs';
import { join } from 'path';
import { build } from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import { rimrafSync } from 'rimraf';

const html = (contents) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>Headless Function Runner</title>
    <script type="module">
    ${contents}
    </script>
  </head>
  <body>
  </body>
</html>
`;

const cwd = process.cwd();

const entryPoints = [join(cwd, 'src', 'shared', 'function-runner', 'index.ts')];
const outfile = join(cwd, 'public', 'function', 'client.js');
const htmlLocation = join(process.cwd(), 'public', 'function', 'index.html');

async function main() {
  await build({
    bundle: true,
    entryPoints,
    outfile,
    plugins: [
      polyfillNode({
        globals: {
          process: false,
        },
      }),
    ],
  });

  const contents = fs.readFileSync(outfile, 'utf-8');
  const finalHtml = html(contents);

  fs.writeFileSync(htmlLocation, finalHtml);
  rimrafSync(outfile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
