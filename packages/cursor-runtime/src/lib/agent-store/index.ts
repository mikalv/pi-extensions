import { AgentStore, getDefaultAgentMetadata } from "../../vendor/agent-kv/index.ts";
import {
  loadBlobsFromDisk,
  loadMetaFromDisk,
  saveBlobsToDisk,
  saveMetaToDisk,
} from "./disk.ts";
import { JsonBlobStoreWithMetadata } from "./json-blob-store.ts";

interface StoreEntry {
  store: AgentStore;
  jsonStore: JsonBlobStoreWithMetadata;
}

let sessionStores = new Map<string, StoreEntry>();

export const ensureAgentStore = async (
  baseDir: string,
  sessionId: string,
): Promise<StoreEntry> => {
  const existing = sessionStores.get(sessionId);
  if (existing) {
    return existing;
  }

  const [blobs, meta] = await Promise.all([
    loadBlobsFromDisk(baseDir, sessionId),
    loadMetaFromDisk(baseDir, sessionId),
  ]);

  const metadata = meta ?? getDefaultAgentMetadata();
  const jsonStore = new JsonBlobStoreWithMetadata(blobs, metadata);
  const store = new AgentStore(jsonStore, jsonStore);

  if (metadata.latestRootBlobId.length > 0) {
    await store.resetFromDb(null);
  }

  const entry: StoreEntry = { store, jsonStore };
  sessionStores.set(sessionId, entry);
  return entry;
};

export const persistAgentStore = async (
  baseDir: string,
  sessionId: string,
): Promise<StoreEntry | null> => {
  const entry = sessionStores.get(sessionId);
  if (!entry) {
    return null;
  }

  await Promise.all([
    saveBlobsToDisk(baseDir, sessionId, entry.jsonStore.blobs),
    saveMetaToDisk(baseDir, sessionId, entry.jsonStore.metadata),
  ]);

  return entry;
};

export const applySnapshotToStore = async (
  entry: StoreEntry,
  agentId: string,
  latestRootBlobId: Uint8Array,
): Promise<void> => {
  entry.jsonStore.metadata.agentId = agentId;
  entry.jsonStore.metadata.latestRootBlobId = latestRootBlobId;

  if (latestRootBlobId.length > 0) {
    await entry.store.resetFromDb(null);
  }
};

export const deleteAgentStore = (sessionId: string): boolean => {
  return sessionStores.delete(sessionId);
};

export const hasAgentStore = (sessionId: string): boolean => {
  return sessionStores.has(sessionId);
};

export const retainOnlyAgentStore = (sessionId: string | null): void => {
  const entry = sessionId ? sessionStores.get(sessionId) : undefined;
  sessionStores =
    sessionId && entry ? new Map([[sessionId, entry]]) : new Map();
};
