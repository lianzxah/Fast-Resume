import './env';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { templateRoutes } from './routes/templates';
import { importRoutes } from './routes/import';
import { exportRoutes } from './routes/export';
import { authRoutes } from './routes/auth';
import { resumeRoutes } from './routes/resumes';
import { aiRoutes } from './routes/ai';
import { adminRoutes } from './routes/admin';
import './db';

const app = new Hono();

// ============================================================
// 中间件
// ============================================================
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// ============================================================
// 错误处理
// ============================================================
app.onError((err, c) => {
  console.error(`[Server Error] ${err.message}`, err.stack);
  return c.json(
    {
      success: false,
      error: err.message || 'Internal Server Error',
    },
    500
  );
});

// ============================================================
// 路由
// ============================================================
app.get('/', (c) => {
  return c.json({
    name: 'Fast Resume API',
    version: '0.1.0',
    status: 'running',
  });
});

// API 路由
app.route('/api/templates', templateRoutes);
app.route('/api/import', importRoutes);
app.route('/api/export', exportRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/resumes', resumeRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/admin', adminRoutes);

// ============================================================
// 启动服务
// ============================================================
const port = parseInt(process.env.PORT || '3001');

console.log(`🚀 Server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
