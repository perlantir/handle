import cors from 'cors';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { corsAllowedHeaders, corsMethods, corsOptions, corsOrigins } from './lib/cors';
import { createTasksRouter, type TaskRouteStore } from './routes/tasks';

const canonicalOrigin = corsOrigins[0];

function createStore(): TaskRouteStore {
  return {
    task: {
      async create() {
        return { id: 'task-cors-test' };
      },
      async findFirst() {
        return null;
      },
    },
    user: {
      async upsert() {
        return {};
      },
    },
  };
}

function createCorsApp(runAgent: (taskId: string, goal: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(cors(corsOptions));
  app.use('/api/tasks', createTasksRouter({ getUserId: () => 'user-test', runAgent, store: createStore() }));
  return app;
}

function expectCorsHeaders(response: request.Response) {
  expect(response.headers['access-control-allow-origin']).toBe(canonicalOrigin);
  expect(response.headers['access-control-allow-credentials']).toBe('true');
}

describe('API CORS configuration', () => {
  it('allows canonical cross-origin task POST requests', async () => {
    const runAgent = vi.fn<Parameters<(taskId: string, goal: string) => Promise<void>>, Promise<void>>().mockResolvedValue();
    const app = createCorsApp(runAgent);

    const preflight = await request(app)
      .options('/api/tasks')
      .set('Origin', canonicalOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization')
      .expect(204);

    expectCorsHeaders(preflight);
    for (const method of corsMethods) {
      expect(preflight.headers['access-control-allow-methods']).toContain(method);
    }
    for (const header of corsAllowedHeaders) {
      expect(preflight.headers['access-control-allow-headers']).toContain(header);
    }

    const post = await request(app)
      .post('/api/tasks')
      .set('Origin', canonicalOrigin)
      .set('Authorization', 'Bearer test-key-not-real')
      .set('Content-Type', 'application/json')
      .send({ goal: 'Verify CORS headers' })
      .expect(200);

    expectCorsHeaders(post);
    expect(post.body).toEqual({ taskId: 'task-cors-test' });
    expect(runAgent).toHaveBeenCalledWith('task-cors-test', 'Verify CORS headers', {
      backend: 'e2b',
    });
  });
});
