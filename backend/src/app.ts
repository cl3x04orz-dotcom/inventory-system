import fastify from 'fastify';
import cors from '@fastify/cors';
import { apiRoutes } from './routes/api.js';

export function buildApp() {
  const app = fastify({
    logger: true,
  });

  // Enable CORS
  app.register(cors, {
    origin: '*', // Adjust this to match your frontend origin in production
    methods: ['POST', 'GET', 'OPTIONS'],
  });

  // Support text/plain content type containing stringified JSON (GAS compatibility)
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Register API Routes
  app.register(apiRoutes);

  // Health check
  app.get('/health', async () => {
    return { status: 'OK' };
  });

  // Root welcome route
  app.get('/', async () => {
    return {
      name: 'Inventory System API',
      version: '1.0.0-node',
      status: 'running',
      timestamp: new Date()
    };
  });

  return app;
}
