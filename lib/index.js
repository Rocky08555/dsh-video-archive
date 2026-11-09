import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const name = 'video-archive-dsh';
export const PACKAGE_NAME = 'dsh-video-archive';

/** Resolve the packaged Skill root from the DSH profile's module resolution. */
export function resolveSkillRoot(profileBaseUrl) {
  if (!profileBaseUrl) throw new Error('dsh-video-archive: missing DSH profile baseUrl');
  const manifestPath = createRequire(profileBaseUrl).resolve(PACKAGE_NAME + '/package.json');
  return join(dirname(manifestPath), 'skills');
}
