import { APP_CONFIG } from './config';
import { createApp } from './app';
import { initInstanceStore } from './services/instanceStore';

async function bootstrap() {
  await initInstanceStore();

  const app = createApp();
  app.listen(APP_CONFIG.port, () => {
    // eslint-disable-next-line no-console
    console.log(`OpenClaw manager backend is listening on port ${APP_CONFIG.port}`);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start backend:', err);
  process.exit(1);
});
