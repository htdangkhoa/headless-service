# Headless Service

## Description

A service that provides a way to execute the Puppeteer's logic without the need of a browser at the client side.

## Prerequisites

- Node.js: 22 or higher
- pnpm: 8 or higher

## Environment Variables

| Name                        | Description                                                      | Required           | Default                         |
|-----------------------------|------------------------------------------------------------------|:------------------:|---------------------------------|
| `SERVICE_NAME`              | The name of the service                                          | :white_check_mark: | `headless-service`              |
| `HOST`                      | The host where the service will be listening                     |                    | `localhost`                     |
| `PORT`                      | The port where the service will be listening                     |                    | `3000`                          |
| `SECRET`                    | The secret to authenticate the internal requests                 | :white_check_mark: |                                 |
| `EXTERNAL_ADDRESS`          | The external address that will be used to connect to the service | :white_check_mark: |                                 |
| `PUPPETEER_SKIP_DOWNLOAD`   | Skip downloading the Puppeteer's browser binaries                |                    | `false`                         |
| `PUPPETEER_EXECUTABLE_PATH` | The path to the Puppeteer's browser executable                   | :white_check_mark: |                                 |
| `DEBUG`                     | Enable the debug mode                                            |                    | `headless-service*,-**:verbose` |
| `DOWNLOAD_RECORDER_DIR`     | The directory where the downloaded recordings will be stored     |                    | None (`os.tmpdir()`)            |
| `INITIALIZE_GHOSTERY`       | Initialize Ghostery                                              |                    | `false`                         |
| `HEADLESS_SERVICE_TOKEN`    | The token to authenticate the requests                           |                    |                                 |

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

## Docker

### Supported Browsers

| Browser | Dockerfile                                    |
|---------|-----------------------------------------------|
| Chrome  | [Dockerfile.chrome](./docker/Dockerfile.chrome)      |
| Brave   | [Dockerfile.brave](./docker/Dockerfile.brave) |

### Usage

1. Build the Docker image:

    ```bash
    docker build -t headless-service/<browser> . -f ./docker/Dockerfile.<browser>
    ```

2. Run the Docker container:

    ```bash
    docker run \
      -e HOST='0.0.0.0' \
      -e PORT='3000' \
      -e EXTERNAL_ADDRESS='http://localhost:3000' \
      -e SERVICE_NAME='headless-service' \
      -e DEBUG='headless-service*,-**:verbose' \
      -p 3000:3000 \
      headless-service/<browser>
    ```