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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== Request Logging =====
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip,
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
