import { z } from 'zod/v4';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { Logger } from './logger';

extendZodWithOpenApi(z);

async function bootstrap() {
  const logger = new Logger();

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
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    })
    .once('uncaughtException', async (err, origin) => {
      logger.error('Unhandled exception at:', origin, 'error:', err);
      await headlessServer.stop();
      process.exit(1);
    })
    .once('SIGTERM', async () => {
      logger.info(`SIGTERM received, saving and closing down`);
      await headlessServer.stop();
      process.exit(0);
    })
    .once('SIGINT', async () => {
      logger.info(`SIGINT received, saving and closing down`);
      await headlessServer.stop();
      process.exit(0);
    })
    .once('SIGHUP', async () => {
      logger.info(`SIGHUP received, saving and closing down`);
      await headlessServer.stop();
      process.exit(0);
    })
    .once('SIGUSR2', async () => {
      logger.info(`SIGUSR2 received, saving and closing down`);
      await headlessServer.stop();
      process.exit(0);
    })
    .once('exit', () => {
      logger.info(`Process is finished, exiting`);
      process.exit(0);
    });
}

bootstrap();
