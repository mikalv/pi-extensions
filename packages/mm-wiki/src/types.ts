export type MemoryMetadata = {
  name: string;
  description: string;
  sources: string[];
  aliases: string[];
};

export type MemoryDocument = {
  path: string;
  content: string;
  version: string;
  updatedAt: string;
  size: number;
  metadata: MemoryMetadata | null;
  warning?: string;
};

export type MemoryListEntry = {
  path: string;
  size: number;
  updatedAt: string;
  preview?: string;
};

export type MemoryListingRecord = MemoryListEntry & {
  version: string;
  metadata: MemoryMetadata | null;
};

export type MutationSuccess = {
  ok: true;
  path: string;
  version: string;
  updatedAt: string;
  size: number;
};

export type MutationConflict = {
  ok: false;
  code: "version_conflict" | "already_exists" | "not_found" | "match_not_found" | "match_ambiguous";
  message: string;
  path: string;
  currentContent: string | null;
  currentVersion: string | null;
  matchCount?: number;
};

export type MutationResult = MutationSuccess | MutationConflict;
