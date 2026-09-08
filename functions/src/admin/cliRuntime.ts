/**
 * Shared Admin CLI runtime path resolution (security-critical).
 *
 * npm executes package scripts with cwd = `functions`, but the runbook paths
 * are repository-root-relative. This resolver validates the invocation root
 * from `process.env.INIT_CWD` (the directory the user ran `npm --prefix functions`
 * from) and refuses anything that escapes it. External paths are separate,
 * narrowly-scoped closed cases (tmpdir, github-env) that never pass through the
 * generic repository-relative resolution.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface ResolveInvocationPathInput {
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /** A repository-root-relative path (mutually exclusive with externalPath). */
  relativePath?: string;
  /** An external absolute path validated only under a specific scope. */
  externalPath?: string;
  scope?: 'tmpdir' | 'github-env';
  mustExist: boolean;
}

/** Validates that `root` is the repository root (has .firebaserc, package.json, functions/package.json). */
const assertRepositoryRoot = (root: string): string => {
  let real: string;
  try {
    real = fs.realpathSync(root);
  } catch {
    throw new Error('INIT_CWD does not resolve to an existing directory');
  }
  const markers = [
    path.join(real, '.firebaserc'),
    path.join(real, 'package.json'),
    path.join(real, 'functions', 'package.json'),
  ];
  for (const marker of markers) {
    if (!fs.existsSync(marker)) {
      throw new Error(`INIT_CWD is not a valid repository root (missing ${path.basename(marker)})`);
    }
  }
  return real;
};

/** True when `child` is `parent` or strictly beneath it (after realpath normalization). */
const isWithin = (parent: string, child: string): boolean => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Resolves the real path of a target that must not escape `base`. If the target
 * (or, when it exists, its realpath) leaves `base`, this throws — this closes
 * both `..` traversal and symlink-escape.
 */
const resolveWithin = (base: string, target: string, mustExist: boolean): string => {
  const joined = path.resolve(base, target);
  // Pre-realpath containment: rejects literal `..` traversal.
  if (!isWithin(base, joined)) {
    throw new Error('Path escapes the permitted root');
  }
  if (fs.existsSync(joined)) {
    const real = fs.realpathSync(joined);
    // Post-realpath containment: rejects symlink escape.
    if (!isWithin(base, real)) {
      throw new Error('Path escapes the permitted root via symlink');
    }
    return real;
  }
  if (mustExist) {
    throw new Error(`Required path does not exist: ${target}`);
  }
  return joined;
};

export const resolveInvocationPath = (input: ResolveInvocationPathInput): string => {
  const initCwd = input.env.INIT_CWD;
  if (typeof initCwd !== 'string' || initCwd.length === 0) {
    throw new Error('INIT_CWD is required to resolve invocation paths');
  }
  const root = assertRepositoryRoot(initCwd);

  // ── External closed cases ────────────────────────────────────────────────
  if (input.externalPath !== undefined) {
    if (input.relativePath !== undefined) {
      throw new Error('relativePath and externalPath are mutually exclusive');
    }
    if (input.scope === 'tmpdir') {
      const tmp = fs.realpathSync(os.tmpdir());
      const resolved = path.resolve(input.externalPath);
      // A private output must be a DIRECT child of os.tmpdir(), not nested in a
      // deeper subtree (which could be a repo dir that merely lives under tmp).
      if (path.dirname(resolved) !== tmp) {
        throw new Error('Private output must resolve directly beneath os.tmpdir()');
      }
      if (fs.existsSync(resolved)) {
        const real = fs.realpathSync(resolved);
        if (path.dirname(real) !== tmp) {
          throw new Error('Private output escapes os.tmpdir() via symlink');
        }
        return real;
      }
      if (input.mustExist) {
        throw new Error('Required private output does not exist');
      }
      return resolved;
    }
    if (input.scope === 'github-env') {
      if (input.env.GITHUB_ACTIONS !== 'true') {
        throw new Error('--github-env is only accepted under GITHUB_ACTIONS=true');
      }
      const githubEnv = input.env.GITHUB_ENV;
      if (typeof githubEnv !== 'string' || githubEnv.length === 0) {
        throw new Error('GITHUB_ENV is not set');
      }
      // Exact resolved equality with GITHUB_ENV.
      const resolvedTarget = path.resolve(input.externalPath);
      const resolvedEnv = path.resolve(githubEnv);
      const equalRaw = resolvedTarget === resolvedEnv;
      let equalReal = false;
      if (fs.existsSync(resolvedTarget) && fs.existsSync(resolvedEnv)) {
        equalReal = fs.realpathSync(resolvedTarget) === fs.realpathSync(resolvedEnv);
      }
      if (!equalRaw && !equalReal) {
        throw new Error('--github-env must exactly equal GITHUB_ENV');
      }
      if (input.mustExist && !fs.existsSync(resolvedTarget)) {
        throw new Error('--github-env path does not exist');
      }
      return fs.existsSync(resolvedTarget) ? fs.realpathSync(resolvedTarget) : resolvedTarget;
    }
    throw new Error('externalPath requires an explicit scope');
  }

  // ── Repository-root-relative case ────────────────────────────────────────
  if (input.relativePath === undefined) {
    throw new Error('relativePath or externalPath is required');
  }
  // An absolute path can never be a repo-relative flag.
  if (path.isAbsolute(input.relativePath)) {
    throw new Error('Repository-relative path must not be absolute');
  }
  return resolveWithin(root, input.relativePath, input.mustExist);
};
