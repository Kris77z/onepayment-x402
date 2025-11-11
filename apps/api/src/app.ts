import cors from 'cors';
import express, { json, type Request, type Response, type NextFunction } from 'express';
import createHttpError, { isHttpError } from 'http-errors';
import morgan from 'morgan';
import routes from './routes/index.js';

const app = express();

app.use(cors());
app.use(json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.use('/api', routes);

app.use((_req, _res, next) => {
  next(createHttpError(404, 'Resource not found'));
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const error = isHttpError(err)
    ? err
    : createHttpError(500, err instanceof Error ? err.message : 'Internal server error');
  const status = error.status || 500;
  res.status(status).json({
    success: false,
    data: null,
    error: {
      code: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    }
  });
});

export default app;

