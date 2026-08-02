import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/ai-agent',
  'packages/shared',
  'packages/canvas-engine',
  'packages/templates',
  'packages/server',
  'packages/editor',
]);
