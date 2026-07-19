import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared',
  'packages/canvas-engine',
  'packages/templates',
  'packages/server',
]);
