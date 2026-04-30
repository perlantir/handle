import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createTasksRouter, type TaskRouteStore } from './tasks';

function createApp(store: TaskRouteStore, runAgent: (taskId: string, goal: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTasksRouter({ getUserId: () => 'user-test', runAgent, store }));
  return app;
}

describe('tasks route', () => {
  it('creates a task and starts the agent', async () => {
    const runAgent = vi.fn<Parameters<(taskId: string, goal: string) => Promise<void>>, Promise<void>>().mockResolvedValue();
    const store: TaskRouteStore = {
      task: {
        async create() {
          return { id: 'task-test' };
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

    const response = await request(createApp(store, runAgent))
      .post('/api/tasks')
      .send({ goal: 'Write a file' })
      .expect(200);

    expect(response.body).toEqual({ taskId: 'task-test' });
    expect(runAgent).toHaveBeenCalledWith('task-test', 'Write a file');
  });

  it('returns a task owned by the current user', async () => {
    const store: TaskRouteStore = {
      task: {
        async create() {
          return { id: 'unused' };
        },
        async findFirst() {
          return { id: 'task-test', goal: 'Goal', messages: [] };
        },
      },
      user: {
        async upsert() {
          return {};
        },
      },
    };

    const response = await request(createApp(store, async () => {})).get('/api/tasks/task-test').expect(200);

    expect(response.body).toMatchObject({ id: 'task-test', goal: 'Goal' });
  });
});
