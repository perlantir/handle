import { execFileSync } from 'node:child_process';

export interface BuildInfo {
  gitCommit: string;
  builtAt: string;
}

let buildInfo: BuildInfo | null = null;

export async function initBuildInfo() {
  let gitCommit = 'unknown';

  try {
    gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    gitCommit = 'unknown-not-a-git-repo';
  }

  buildInfo = {
    gitCommit,
    builtAt: new Date().toISOString(),
  };
}

export function getBuildInfo() {
  if (!buildInfo) {
    throw new Error('buildInfo not initialized');
  }

  return buildInfo;
}
