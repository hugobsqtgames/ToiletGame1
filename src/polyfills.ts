/**
 * Runtime shims that must load before anything else (imported first by index.ts).
 * Some npm packages assume Node's `process.emitWarning`, which React Native lacks.
 */
const proc = (globalThis as { process?: { emitWarning?: (...args: unknown[]) => void } }).process;
if (proc && typeof proc.emitWarning !== 'function') {
  proc.emitWarning = () => {};
}
