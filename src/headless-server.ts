import path from 'node:path';
import { IncomingMessage, createServer } from 'node:http';
import { Socket } from 'node:net';
import pureHttp, { Handler } from 'pure-http';
import consolidate from 'consolidate';
import cors from 'cors';
import bodyParser from 'body-parser';
import httpProxy from 'http-proxy';

import { PuppeteerProvider } from '@/puppeteer-provider';
import { FunctionPostRoute } from '@/routes';
import { makeExternalUrl } from './utils';
import { GroupRouter } from './router';
import { OpenAPI } from './openapi';

export interface HeadlessServerOptions {
  port?: number;
  host?: string;
}

export class HeadlessServer {
  private options: HeadlessServerOptions;

  private server = createServer();

  private app = pureHttp({
    server: this.server,
    views: {
      dir: path.resolve(process.cwd(), 'public'),
      ext: 'html',
      engine: consolidate.mustache,
    },
  });

  private proxy = httpProxy.createProxyServer({});

  private puppeteerProvider = new PuppeteerProvider();

  private apiGroupRouter: GroupRouter = new GroupRouter('/api');

  private openApi = new OpenAPI([this.apiGroupRouter]);

  constructor(options: HeadlessServerOptions) {
    this.options = options;

    // Add puppeteer provider as a variable into the app settings
    this.app.set('puppeteerProvider', this.puppeteerProvider);

    // Middleware
    this.app.use(cors());
    this.app.use(bodyParser.json() as Handler);
    this.app.use(bodyParser.urlencoded({ extended: true }) as Handler);
    this.app.use(bodyParser.raw({ type: 'application/javascript' }) as Handler);

    // Serving static files
    this.app.all('/function/index.html', async (_, res) => {
      return res.render('function/index');
    });
    this.app.all('/docs/*', async (req, res) => {
      const filename = req.params?.wild!;
      const filepath = path.resolve(process.cwd(), 'public', 'docs', filename);
      return res.sendFile(filepath);
    });
    this.app.all('/docs', async (req, res) => {
      return res.render('docs/index', {
        url: makeExternalUrl('docs', 'openapi.json'),
      });
    });

    // API Routes
    this.apiGroupRouter.registerRoute(FunctionPostRoute);
    this.app.use(this.apiGroupRouter.getRouter());
  }

  async onUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    const browser = await this.puppeteerProvider.launchBrowser(req);

    const browserWSEndpoint = browser.wsEndpoint();

    return new Promise<void>((resolve, reject) => {
      function close() {
        browser.off('close', close);
        browser.process()?.off('close', close);
        socket.off('close', close);
        return resolve();
      }

      browser?.once('close', close);
      browser?.process()?.once('close', close);
      socket.once('close', close);

      req.url = '';

      // Delete headers known to cause issues
      delete req.headers.origin;

      this.proxy.ws(
        req,
        socket,
        head,
        {
          target: browserWSEndpoint,
          changeOrigin: true,
        },
        (error) => {
          this.puppeteerProvider.closeBrowser(browser);
          return reject(error);
        }
      );
    });
  }

  async start() {
    // Generate OpenAPI documentation
    this.openApi.generateDocument({
      jsonFileName: path.resolve(process.cwd(), 'public', 'docs', 'openapi.json'),
      title: 'Headless Server',
      version: '1.0.0',
      servers: [{ url: makeExternalUrl() }],
    });

    this.server.on('upgrade', this.onUpgrade.bind(this));

    this.server.timeout = 0;
    this.server.keepAliveTimeout = 0;

    const { host, port } = this.options;

    this.server.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}`);
      console.log(`WS Proxy running at ws://${host}:${port}`);
    });
  }

  async close() {
    process.removeAllListeners();
    this.proxy.removeAllListeners();

    await this.puppeteerProvider.close();

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
