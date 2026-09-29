// Tiny global event emitter shared by every module.
const handlers = new Map();

export const bus = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(fn);
    return () => bus.off(name, fn);
  },
  off(name, fn) {
    handlers.get(name)?.delete(fn);
  },
  emit(name, payload) {
    handlers.get(name)?.forEach((fn) => fn(payload));
  },
};
