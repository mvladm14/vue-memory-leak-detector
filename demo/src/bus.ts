// A module-level event bus: whatever subscribes stays reachable until it unsubscribes.
type Handler = (message: string) => void;
const handlers = new Set<Handler>();

export const bus = {
  on(handler: Handler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  },
  emit(message: string): void {
    handlers.forEach((h) => h(message));
  },
};

// Elements kept around "for later": the classic detached-DOM leak.
export const detached: Element[] = [];
