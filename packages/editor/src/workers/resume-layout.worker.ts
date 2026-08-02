/// <reference lib="webworker" />

import {
  createIncrementalResumeLayout,
  createResumeLayoutEngine,
  type IncrementalLayoutRequest,
} from '@resume-editor/canvas-engine';

const incremental = createIncrementalResumeLayout(createResumeLayoutEngine());

self.onmessage = (event: MessageEvent<IncrementalLayoutRequest>) => {
  const result = incremental.reflow(event.data);
  self.postMessage(result);
};

export {};
