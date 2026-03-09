import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import logger from './utils/logger';

const app = express();

// ===== Security Middleware =====
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// app.use(generalLimiter);

// ===== Body Parsing =====
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ===== Request Logging =====
app.use((req, res, next) => {
  const start = Date.now();
  const { method, path, query, body } = req;
  
  // Log request
  logger.info(`[API Request] ${method} ${path}`, {
    query,
    body: method !== 'GET' ? body : undefined,
    ip: req.ip,
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`[API Response] ${method} ${path} ${res.statusCode} (${duration}ms)`);
  });

  next();
});

// ===== API Routes =====
app.use('/api', routes);

// ===== Root endpoint =====
app.get('/', (_req, res) => {
  res.json({
    name: 'INVENTO ERP Backend API',
    version: '1.0.0',
    description: 'Pratap Sons Heritage - Ladies Garment Showroom ERP',
    docs: '/api/health',
  });
});

// ===== 404 Handler =====
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ===== Global Error Handler =====
app.use(errorHandler);

export default app;
