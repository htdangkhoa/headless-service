import _ from 'lodash-es';
import fs from 'fs';
import path from 'path';

const name = process.argv[2];

const lowerCaseName = name.toLowerCase();

const startCaseName = _.startCase(lowerCaseName).replace(/\s/g, ``);

const index_ts = `
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';

export class PuppeteerExtraPlugin${startCaseName} extends PuppeteerExtraPlugin {
  constructor() {
    super();
  }

  get name(): string {
    return '${lowerCaseName}';
  }
}

const ${startCaseName}Plugin = () => new PuppeteerExtraPlugin${startCaseName}();

export default ${startCaseName}Plugin;
`;

const index_d_ts = `
import {} from 'puppeteer';
`;

function main() {
  const cwd = process.cwd();

  const pluginDir = path.join(cwd, `src`, `plugins`, `puppeteer-extra-plugin-${lowerCaseName}`);

  if (fs.existsSync(pluginDir)) {
    console.error(`Plugin already exists: ${pluginDir}`);
    process.exit(1);
  }

  fs.mkdirSync(pluginDir);

  fs.writeFileSync(path.join(pluginDir, `index.ts`), index_ts);

  fs.writeFileSync(path.join(pluginDir, `index.d.ts`), index_d_ts);
}

main();
