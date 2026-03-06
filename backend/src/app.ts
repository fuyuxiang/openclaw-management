import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import instanceRoutes from './routes/instances';
import systemRoutes from './routes/system';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(morgan('dev'));
  app.use(express.json());

  app.get('/api/ping', (_req, res) => {
    res.json({ success: true, data: { message: 'pong' } });
  });

  app.use('/api/instances', instanceRoutes);
  app.use('/api/system', systemRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
