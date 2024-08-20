# Headless Service

## Description

A service that provides a way to execute the Puppeteer's logic without the need of a browser at the client side.

## Prerequisites

- Node.js: 18 or higher
- pnpm: 8 or higher

## Environment Variables

| Name                        | Description                                                      | Default     |
|-----------------------------|------------------------------------------------------------------|-------------|
| `HOST`                      | The host where the service will be listening                     | `localhost` |
| `PORT`                      | The port where the service will be listening                     | `3000`      |
| `EXTERNAL_ADDRESS`          | The external address that will be used to connect to the service |             |
| `PUPPETEER_SKIP_DOWNLOAD`   | Skip downloading the Puppeteer's browser binaries                | `false`     |
| `PUPPETEER_EXECUTABLE_PATH` | The path to the Puppeteer's browser executable                   |             |

## Usage

1. Install the dependencies:

```bash
pnpm install
```

2. Start the service:

```bash
pnpm dev
```

3. Make a request to the service:

```bash
curl --location "http://localhost:3000/api/function" \
--header "Content-Type: application/javascript" \
--data "
export default async function ({ page }: { page: Page }) {
  await page.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
  });
  const title = await page.title();
  return { title };
};
"
```

or you can connect to the service using a WebSocket client:

```typescript
import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint: 'ws://localhost:3000',
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
  });

  const title = await page.title();
  console.log(title);

  await browser.close();
}

main().catch(console.error);
```

> you can also run the demo script by executing `pnpm ts-node examples/demo.ts`
