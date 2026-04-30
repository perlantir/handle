import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApprovalsRouter, type ApprovalRouteStore } from './approvals';

function createApp(store: ApprovalRouteStore) {
  const app = express();
  app.use(express.json());
  app.use('/api/approvals', createApprovalsRouter({ getUserId: () => 'user-test', store }));
  return app;
}

describe('approvals route', () => {
  it('lists pending and timed-out approvals for the current user tasks', async () => {
    const store: ApprovalRouteStore = {
      approvalRequest: {
        async findFirst() {
          return null;
        },
        async findMany() {
          return [
            {
              id: 'approval-test',
              payload: { reason: 'Review command', type: 'shell_exec' },
              status: 'pending',
              taskId: 'task-test',
              type: 'shell_exec',
            },
            {
              id: 'approval-timeout',
              payload: { reason: 'Timed out', type: 'shell_exec' },
              status: 'timeout',
              taskId: 'task-test',
              type: 'shell_exec',
            },
          ];
        },
        async update() {
          return { id: 'unused', status: 'approved', taskId: 'task-test' };
        },
      },
      task: {
        async findFirst() {
          return { id: 'task-test' };
        },
        async findMany() {
          return [{ id: 'task-test' }];
        },
        async update() {
          return {};
        },
      },
    };

    const response = await request(createApp(store)).get('/api/approvals/pending').expect(200);

    expect(response.body.approvals).toHaveLength(2);
    expect(response.body.approvals[1]).toMatchObject({ approvalId: 'approval-timeout', status: 'timeout' });
  });

  it('responds only when the approval task belongs to the current user', async () => {
    const store: ApprovalRouteStore = {
      approvalRequest: {
        async findFirst() {
          return {
            id: 'approval-test',
            payload: { reason: 'Review command', type: 'shell_exec' },
            status: 'pending',
            taskId: 'task-test',
            type: 'shell_exec',
          };
        },
        async findMany() {
          return [];
        },
        async update() {
          return { id: 'approval-test', status: 'approved', taskId: 'task-test' };
        },
      },
      task: {
        async findFirst() {
          return { id: 'task-test' };
        },
        async findMany() {
          return [];
        },
        async update() {
          return {};
        },
      },
    };

    const response = await request(createApp(store))
      .post('/api/approvals/respond')
      .send({ approvalId: 'approval-test', decision: 'approved' })
      .expect(200);

    expect(response.body).toEqual({ approvalId: 'approval-test', status: 'approved' });
  });
});
