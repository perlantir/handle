import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalPill, PlanStep, StatusDot } from './design-system';
import { HomeScreen } from './home/HomeScreen';
import { WorkspaceScreen } from './workspace/WorkspaceScreen';

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: async () => 'test-token-not-real',
    isLoaded: true,
  }),
  useUser: () => ({
    user: {
      firstName: 'Perlantir',
      fullName: 'Perlantir',
      username: 'perlantir',
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('authenticated screens', () => {
  it('renders the Home greeting from the Clerk user', () => {
    const html = renderToStaticMarkup(<HomeScreen />);

    expect(html).toContain('Good morning, Perlantir.');
  });

  it('renders the Workspace screen shell with initial task data', () => {
    const html = renderToStaticMarkup(
      <WorkspaceScreen
        initialTask={{
          goal: 'Write and run hello.py',
          id: 'task-test',
          messages: [{ content: 'Write and run hello.py', id: 'message-test', role: 'USER' }],
          status: 'RUNNING',
        }}
        taskId="task-test"
      />,
    );

    expect(html).toContain('Write and run hello.py');
    expect(html).toContain('Inspector');
    expect(html).toContain('Terminal');
  });
});

describe('design system token classes', () => {
  it('renders core primitives with tokenized classes', () => {
    const html = renderToStaticMarkup(
      <>
        <StatusDot pulsing size="lg" status="running" />
        <ApprovalPill />
        <PlanStep state="active" title="Run command" />
      </>,
    );

    expect(html).toContain('bg-status-running');
    expect(html).toContain('text-status-waiting');
    expect(html).toContain('bg-accent');
  });
});
