import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { initBuildInfo } from '../lib/buildInfo';
import { createServer } from '../server';

describe('health route', () => {
  beforeAll(async () => {
    await initBuildInfo();
  });

  it('returns build info without requiring authentication', async () => {
    const app = await createServer();
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toMatchObject({
      service: 'handle-api',
      status: 'ok',
    });
    expect(response.body.build.gitCommit).toEqual(expect.any(String));
    expect(response.body.build.builtAt).toEqual(expect.any(String));
    expect(response.body.timestamp).toEqual(expect.any(String));
  });
});
