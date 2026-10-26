import { createWorker } from './worker.js';

// Only actual Worker entrypoints may be exported from the deployment module.
export default createWorker();
