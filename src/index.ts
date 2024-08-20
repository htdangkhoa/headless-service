import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

async function bootstrap() {
  const { env } = await import('@/utils');
  const { HeadlessServer } = await import('@/headless-server');

  const host = env<string>('HOST', 'localhost');
  const port = env<number>('PORT', 3000);

  const headlessServer = new HeadlessServer({
    port,
    host,
  });
  await headlessServer.start();

  process
    .on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    })
    .once('uncaughtException', async (err, origin) => {
      console.error('Unhandled exception at:', origin, 'error:', err);
      await headlessServer.stop();
      process.exit(1);
    })
    .once('SIGTERM', async () => {
      console.log(`SIGTERM received, saving and closing down`);
      await headlessServer.stop();
      process.exit(0);
    })
    .once('SIGINT', async () => {
      console.log(`SIGINT received, saving and closing down`);
      await headlessServer.stop();
      process.exit(0);
    })
    .once('SIGHUP', async () => {
      console.log(`SIGHUP received, saving and closing down`);
      await headlessServer.stop();
      process.exit(0);
    })
    .once('SIGUSR2', async () => {
      console.log(`SIGUSR2 received, saving and closing down`);
      await headlessServer.stop();
      process.exit(0);
    })
    .once('exit', () => {
      console.log(`Process is finished, exiting`);
      process.exit(0);
    });
}

bootstrap();
