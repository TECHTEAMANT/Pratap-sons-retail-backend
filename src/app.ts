import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import logger from './utils/logger';

const app = express();
app.set('trust proxy', true);

// ===== Global Request Logging (Top-level for 100% visibility) =====
app.use((req, res, next) => {
  const start = Date.now();
  const { method, path, query, body } = req;
  
  // Sanitize body to avoid logging sensitive passwords
  let sanitizedBody = body;
  if (body && typeof body === 'object') {
    sanitizedBody = { ...body };
    if (sanitizedBody.password) sanitizedBody.password = '***REDACTED***';
  }

  // Log request
  logger.info(`[API Request] ${method} ${path}`, {
    query,
    body: method !== 'GET' ? sanitizedBody : undefined,
    ip: req.ip,
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`[API Response] ${method} ${path} ${res.statusCode} (${duration}ms)`);
  });

  next();
});

// ===== Compression & Performance =====
app.use(compression());

// ===== Security & CORS Middleware =====
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins when configured as '*' or in development, while respecting credentials
    if (!origin || config.cors.origin === '*' || config.cors.origin.split(',').includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ===== Body Parsing =====
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

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
