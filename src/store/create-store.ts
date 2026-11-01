import AsyncStorage from "@react-native-async-storage/async-storage";

import { AsyncStorageStore } from "@/store/async-storage-store";
import { MemoryStore } from "@/store/memory-store";
import type { LocalStore } from "@/store/port";

/**
 * Picks a persistence adapter for the current platform.
 *
 * AsyncStorage is probed defensively: on a device it is a native
 * module (imported statically, because a lazy chunk fails to load when the web
 * build is served from a sub-path), and the one thing worse than an app that forgets its data is an app
 * that refuses to start. If it is unavailable for any reason the app falls
 * back to the in-memory store and keeps working for the session — degraded,
 * but usable, and the Sync screen says so.
 */
export async function createStore(): Promise<{
  store: LocalStore;
  persistent: boolean;
}> {
  try {
    const backend = AsyncStorage;
    if (!backend?.getItem) throw new Error("AsyncStorage is unavailable");
    // Prove it actually works before committing to it.
    await backend.getItem("fieldkit.probe");
    return { store: new AsyncStorageStore(backend), persistent: true };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}
