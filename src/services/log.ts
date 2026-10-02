/* Minimal logger: silent in production builds except warnings. */
const dev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
export const log = {
  info: (...a: unknown[]) => {
    if (dev) console.log('[loorush]', ...a);
  },
  warn: (...a: unknown[]) => console.warn('[loorush]', ...a),
};
