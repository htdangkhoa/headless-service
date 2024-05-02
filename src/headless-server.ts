import pureHttp, { Handler } from 'pure-http';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import httpProxy from 'http-proxy';

import { PuppeteerProvider } from '@/puppeteer-provider';
import api from '@/apis';

export interface HeadlessServerOptions {
  preBootQuantity?: number;
  port?: number;
  host?: string;
}

export class HeadlessServer {
  private options: HeadlessServerOptions;

  private puppeteerProvider = new PuppeteerProvider();

  private server = createServer();

  private app = pureHttp({ server: this.server });

  private proxy = httpProxy.createProxyServer({});

  constructor(options: HeadlessServerOptions) {
    this.options = options;

    this.app.set('puppeteerProvider', this.puppeteerProvider);

    this.app.use(cors());
    this.app.use(bodyParser.json() as Handler);
    this.app.use(bodyParser.urlencoded({ extended: true }) as Handler);
    this.app.use(bodyParser.raw({ type: '*/*' }) as Handler);
    this.app.use('/api', api);
  }

  async start() {
    await Promise.all(
      Array.from({ length: this.options.preBootQuantity ?? 1 }).map(() =>
        this.puppeteerProvider.launchBrowser()
      )
    );

    this.server.on('upgrade', async (req, socket, head) => {
      const browser = await this.puppeteerProvider.getBrowser();

      const browserWSEndpoint = browser.wsEndpoint();

      socket.once('close', async () => {
        await this.puppeteerProvider.launchBrowser();
      });

      return this.proxy.ws(req, socket, head, {
        target: browserWSEndpoint,
        changeOrigin: true,
      });
    });

    this.server.timeout = 0;
    this.server.keepAliveTimeout = 0;

    const { host, port } = this.options;

    this.server.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}`);
    });
  }

  async close() {
    process.removeAllListeners();
    this.proxy.removeAllListeners();

    await Promise.all(
      this.puppeteerProvider.swarms.map((browser) => this.puppeteerProvider.cleanup(browser, true))
    );

    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      return process.exit(1);
    }, 5000);

    return this.server.close((err) => {
      if (err) {
        console.error(err);
        return process.exit(1);
      }

      console.log('Server closed');
      return process.exit(0);
    });
  }
}
