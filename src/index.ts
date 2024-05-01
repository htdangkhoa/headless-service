import { HeadlessServer } from '@/headless-server';
import { env } from '@/utils';

async function bootstrap() {
  const host = env<string>('HOST', '0.0.0.0');
  const port = env<number>('PORT', 3000);
  const preBootQuantity = env<number>('PRE_BOOT_QUANTITY', 3);

  const headlessServer = new HeadlessServer({
    preBootQuantity,
    port,
    host,
  });
  await headlessServer.start();

  process.on('SIGTERM', headlessServer.close.bind(headlessServer));
  process.on('SIGINT', headlessServer.close.bind(headlessServer));
}

bootstrap();
