type Listener = (payload: unknown) => void;

const globalForBus = globalThis as unknown as {
  __overlaySessionBus?: Map<string, Set<Listener>>;
};

const channels =
  globalForBus.__overlaySessionBus ?? new Map<string, Set<Listener>>();

if (!globalForBus.__overlaySessionBus) {
  globalForBus.__overlaySessionBus = channels;
}

export function publishSession(id: string, payload: unknown): void {
  const listeners = channels.get(id);
  if (!listeners) {
    return;
  }

  for (const listener of [...listeners]) {
    try {
      listener(payload);
    } catch {
      // best-effort delivery
    }
  }
}

export function subscribeSession(id: string, listener: Listener): () => void {
  let set = channels.get(id);
  if (!set) {
    set = new Set();
    channels.set(id, set);
  }
  set.add(listener);

  return () => {
    const current = channels.get(id);
    if (!current) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      channels.delete(id);
    }
  };
}
