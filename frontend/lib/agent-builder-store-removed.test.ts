// Phase 3B requirement 8 (documentation/agent-model-implementation-plan.md):
// stores/agent-builder-store.ts must no longer exist, and nothing may import it — Agent
// configuration authority lives entirely on the canonical AgentRepository now. A grep-
// based static check, matching this repo's existing "no legacy fixture import" testing
// convention (agent-model-implementation-plan.md §12's definition of done).
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // lib/../ -> frontend/
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'stores'];
const SKIP_DIRS = new Set(['node_modules', '.next']);
// Matches an actual import/require of the module, not prose that merely names the file
// (several Phase 3B comments reference it for historical context — that's documentation,
// not an authoritative dependency).
const IMPORT_PATTERN =
  /from\s+['"][^'"]*agent-builder-store['"]|require\(['"][^'"]*agent-builder-store['"]\)/;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('stores/agent-builder-store.ts removal', () => {
  it('the compatibility adapter file no longer exists', () => {
    expect(existsSync(join(ROOT, 'stores', 'agent-builder-store.ts'))).toBe(false);
  });

  it('no source file imports the removed store', () => {
    const files = SCAN_DIRS.flatMap((dir) => collectSourceFiles(join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(0); // sanity: the scan actually found files
    const offenders = files.filter((file) => IMPORT_PATTERN.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
