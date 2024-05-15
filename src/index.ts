import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
extendZodWithOpenApi(z);

async function bootstrap() {
  const { env } = await import('@/utils');
  const { HeadlessServer } = await import('@/headless-server');

  const host = env<string>('HOST', '0.0.0.0');
  const port = env<number>('PORT', 3000);

  const headlessServer = new HeadlessServer({
    port,
    host,
  });
  await headlessServer.start();

  process.on('SIGTERM', headlessServer.close.bind(headlessServer));
  process.on('SIGINT', headlessServer.close.bind(headlessServer));
}

bootstrap();
