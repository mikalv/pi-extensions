import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { atomicDelete, atomicPublish, contentVersion, withDocumentLock } from "./atomic.ts";
import { scanMemoryContent } from "./content-scanner.ts";
import type {
  MemoryDocument,
  MemoryListEntry,
  MemoryListingRecord,
  MemoryMetadata,
  MutationConflict,
  MutationResult,
} from "./types.ts";

export const DEFAULT_MAX_FILE_BYTES = 64 * 1024;
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 200;

const ROOT_FILES = ["/profile.md", "/preferences.md"] as const;
const COLLECTIONS = ["topics", "areas", "people"] as const;
const PATH_PATTERN = /^\/(topics|areas|people)\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\.md$/;
const VERSION_PATTERN = /^[a-f0-9]{12}$/;
// Catalog-wide serialization keeps cross-file name uniqueness enforceable.
// Memory mutations are infrequent, so the simpler global lock is preferable
// to a more complex multi-lock protocol.
const STORE_MUTATION_LOCK = "/.catalog";

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineArray(value: string, field: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`Frontmatter '${field}' must be an inline array, for example [pi]`);
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((part) => unquote(part)).filter(Boolean);
}

export function parseMemoryDocument(content: string): { metadata: MemoryMetadata; body: string } {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    throw new Error("Memory files must start with YAML frontmatter delimited by ---");
  }

  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error("Memory frontmatter is missing its closing --- delimiter");

  const values = new Map<string, string>();
  const allowedFields = new Set(["name", "description", "sources", "aliases"]);
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error(`Invalid frontmatter line: ${line}`);
    const key = line.slice(0, separator).trim();
    if (!allowedFields.has(key)) throw new Error(`Unsupported frontmatter field: ${key}`);
    if (values.has(key)) throw new Error(`Duplicate frontmatter field: ${key}`);
    values.set(key, line.slice(separator + 1).trim());
  }

  const name = unquote(values.get("name") ?? "");
  const description = unquote(values.get("description") ?? "");
  const sources = parseInlineArray(values.get("sources") ?? "", "sources");
  const aliases = values.has("aliases") ? parseInlineArray(values.get("aliases")!, "aliases") : [];
  if (!name) throw new Error("Memory frontmatter requires 'name'");
  if (!description) throw new Error("Memory frontmatter requires 'description'");
  if (!sources.length) throw new Error("Memory frontmatter requires at least one source");

  return {
    metadata: { name, description, sources, aliases },
    body: lines.slice(end + 1).join("\n"),
  };
}

function expectedName(canonicalPath: string): string {
  return path.posix.basename(canonicalPath, ".md");
}

function byteSize(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

function conflict(
  code: MutationConflict["code"],
  message: string,
  canonicalPath: string,
  current: { content: string; version: string } | null,
  matchCount?: number,
): MutationConflict {
  return {
    ok: false,
    code,
    message,
    path: canonicalPath,
    currentContent: current?.content ?? null,
    currentVersion: current?.version ?? null,
    ...(matchCount === undefined ? {} : { matchCount }),
  };
}

export class WikiStore {
  readonly root: string;
  readonly maxFileBytes: number;

  constructor(root: string, maxFileBytes = DEFAULT_MAX_FILE_BYTES) {
    this.root = root;
    this.maxFileBytes = maxFileBytes;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    for (const collection of COLLECTIONS) {
      await fs.mkdir(path.join(this.root, collection), { recursive: true });
    }
    await fs.mkdir(path.join(this.root, ".locks"), { recursive: true });
    await this.assertNoSymlink(this.root);
    for (const collection of COLLECTIONS) await this.assertNoSymlink(path.join(this.root, collection));
  }

  canonicalize(input: string): string {
    if (!input || input.includes("\0")) throw new Error("Memory path is required");
    if (input.includes("\\")) throw new Error("Memory paths must use forward slashes");
    const withSlash = input.startsWith("/") ? input : `/${input}`;
    if (withSlash.includes("//") || withSlash.split("/").includes("..") || withSlash.split("/").includes(".")) {
      throw new Error("Memory path traversal is not allowed");
    }
    if ((ROOT_FILES as readonly string[]).includes(withSlash)) return withSlash;
    if (!PATH_PATTERN.test(withSlash)) {
      throw new Error("Memory path must be /profile.md, /preferences.md, or /topics|areas|people/<lowercase-slug>.md");
    }
    return withSlash;
  }

  private absolutePath(canonicalPath: string): string {
    return path.join(this.root, ...canonicalPath.slice(1).split("/"));
  }

  private async assertNoSymlink(targetPath: string): Promise<void> {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) throw new Error(`Memory storage may not contain symbolic links: ${targetPath}`);
  }

  private async assertSafeTarget(canonicalPath: string): Promise<void> {
    await this.assertNoSymlink(this.root);
    const absolute = this.absolutePath(canonicalPath);
    await this.assertNoSymlink(path.dirname(absolute));
    try {
      await this.assertNoSymlink(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private async rawCurrent(canonicalPath: string): Promise<{ content: string; version: string; stat: Stats } | null> {
    const absolute = this.absolutePath(canonicalPath);
    try {
      const content = await fs.readFile(absolute, "utf8");
      const stat = await fs.stat(absolute);
      return { content, version: contentVersion(content), stat };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private validateVersion(ifVersion: string): void {
    if (ifVersion !== "new" && !VERSION_PATTERN.test(ifVersion)) {
      throw new Error("if_version must be 'new' or a 12-character version returned by a memory tool");
    }
  }

  private async validateContent(
    canonicalPath: string,
    content: string,
    previousMetadata: MemoryMetadata | null,
  ): Promise<MemoryMetadata> {
    const size = byteSize(content);
    if (size > this.maxFileBytes) {
      throw new Error(`Memory file is ${size} bytes; maximum is ${this.maxFileBytes} bytes`);
    }
    const scanError = scanMemoryContent(content);
    if (scanError) throw new Error(scanError);

    const { metadata, body } = parseMemoryDocument(content);
    if (metadata.name !== expectedName(canonicalPath)) {
      throw new Error(`Frontmatter name '${metadata.name}' must match path stem '${expectedName(canonicalPath)}'`);
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(metadata.name)) {
      throw new Error("Frontmatter name must be a lowercase slug");
    }
    if (metadata.description.includes("\n") || metadata.description.length > 300) {
      throw new Error("Frontmatter description must be one line of at most 300 characters");
    }
    if (metadata.sources.some((source) => !/^[a-z0-9][a-z0-9-]{0,31}$/.test(source))) {
      throw new Error("Frontmatter sources must be lowercase slugs");
    }
    if (!metadata.sources.includes("pi")) {
      throw new Error("Frontmatter sources must include 'pi' for writes made from Pi");
    }
    if (previousMetadata) {
      const removedSource = previousMetadata.sources.find((source) => !metadata.sources.includes(source));
      if (removedSource) throw new Error(`Existing source '${removedSource}' must be preserved`);
    }

    const allowsAliases = canonicalPath.startsWith("/areas/") || canonicalPath.startsWith("/people/");
    if (!allowsAliases && metadata.aliases.length) {
      throw new Error("aliases are only allowed on /areas/ and /people/ files");
    }
    if (metadata.aliases.length >= 8) throw new Error("Frontmatter aliases must contain fewer than 8 values");
    if (metadata.aliases.some((alias) => !alias.trim() || alias.length > 100 || alias.includes("\n"))) {
      throw new Error("Frontmatter aliases must be non-empty single-line values of at most 100 characters");
    }
    if (new Set(metadata.aliases.map((alias) => alias.toLowerCase())).size !== metadata.aliases.length) {
      throw new Error("Frontmatter aliases must be unique");
    }

    for (const line of body.split("\n")) {
      if (/^\s*-\s+/.test(line) && !/^\s*-\s+\[(stated|observed|inferred)\]\s+\S/.test(line)) {
        throw new Error(`Memory fact lines must use [stated], [observed], or [inferred]: ${line}`);
      }
    }
    if (canonicalPath === "/profile.md") {
      const words = body.trim() ? body.trim().split(/\s+/).length : 0;
      if (words > 300) throw new Error(`/profile.md body is ${words} words; maximum is 300`);
    }

    const records = await this.listForPrompt();
    const duplicate = records.find((record) => record.path !== canonicalPath && record.metadata?.name === metadata.name);
    if (duplicate) throw new Error(`Memory name '${metadata.name}' is already used by ${duplicate.path}`);
    return metadata;
  }

  async read(inputPath: string): Promise<MemoryDocument | null> {
    const canonicalPath = this.canonicalize(inputPath);
    await this.assertSafeTarget(canonicalPath);
    const current = await this.rawCurrent(canonicalPath);
    if (!current) return null;
    try {
      const parsed = parseMemoryDocument(current.content);
      return {
        path: canonicalPath,
        content: current.content,
        version: current.version,
        updatedAt: current.stat.mtime.toISOString(),
        size: current.stat.size,
        metadata: parsed.metadata,
      };
    } catch (error) {
      return {
        path: canonicalPath,
        content: current.content,
        version: current.version,
        updatedAt: current.stat.mtime.toISOString(),
        size: current.stat.size,
        metadata: null,
        warning: `Invalid memory format: ${(error as Error).message}`,
      };
    }
  }

  async list(options: {
    pathPrefix?: string | null;
    cursor?: string | null;
    includePreview?: boolean;
    limit?: number;
  } = {}): Promise<{ entries: MemoryListEntry[]; nextCursor: string | null }> {
    const records = await this.listForPrompt();
    const prefix = options.pathPrefix ? this.canonicalizePrefix(options.pathPrefix) : null;
    const cursor = options.cursor ? this.canonicalize(options.cursor) : null;
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    const filtered = records.filter((record) => (!prefix || record.path.startsWith(prefix)) && (!cursor || record.path > cursor));
    const page = filtered.slice(0, limit);
    const entries = page.map((record) => ({
      path: record.path,
      size: record.size,
      updatedAt: record.updatedAt,
      ...(options.includePreview ? { preview: record.metadata?.description ?? this.firstBodyLine(record.path) } : {}),
    }));
    return {
      entries,
      nextCursor: filtered.length > page.length ? page.at(-1)?.path ?? null : null,
    };
  }

  private canonicalizePrefix(input: string): string {
    if (!input.startsWith("/")) input = `/${input}`;
    if (input === "/") return input;
    if (["/topics/", "/areas/", "/people/"].includes(input)) return input;
    return this.canonicalize(input);
  }

  private firstBodyLine(_canonicalPath: string): string {
    return "(invalid or missing frontmatter description)";
  }

  async listForPrompt(): Promise<MemoryListingRecord[]> {
    await this.initialize();
    const candidates: string[] = [...ROOT_FILES];
    for (const collection of COLLECTIONS) {
      const directory = path.join(this.root, collection);
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        if (entry.isFile() && /^[a-z0-9][a-z0-9-]{0,63}\.md$/.test(entry.name)) {
          candidates.push(`/${collection}/${entry.name}`);
        }
      }
    }

    const records: MemoryListingRecord[] = [];
    for (const canonicalPath of candidates.sort()) {
      const current = await this.rawCurrent(canonicalPath);
      if (!current) continue;
      let metadata: MemoryMetadata | null = null;
      try { metadata = parseMemoryDocument(current.content).metadata; } catch { /* surfaced as invalid in listing */ }
      records.push({
        path: canonicalPath,
        size: current.stat.size,
        updatedAt: current.stat.mtime.toISOString(),
        version: current.version,
        metadata,
      });
    }
    return records;
  }

  async write(inputPath: string, content: string, ifVersion: string, signal?: AbortSignal): Promise<MutationResult> {
    const canonicalPath = this.canonicalize(inputPath);
    this.validateVersion(ifVersion);
    await this.assertSafeTarget(canonicalPath);
    return withDocumentLock(this.root, STORE_MUTATION_LOCK, async () => {
      const current = await this.rawCurrent(canonicalPath);
      if (ifVersion === "new" && current) {
        return conflict("already_exists", "Path already exists; read it and retry with its version", canonicalPath, current);
      }
      if (ifVersion !== "new" && !current) {
        return conflict("not_found", "Path no longer exists", canonicalPath, null);
      }
      if (ifVersion !== "new" && current!.version !== ifVersion) {
        return conflict("version_conflict", "Memory changed since it was read", canonicalPath, current);
      }

      let previousMetadata: MemoryMetadata | null = null;
      if (current) {
        try { previousMetadata = parseMemoryDocument(current.content).metadata; } catch { /* permit repair */ }
      }
      await this.validateContent(canonicalPath, content, previousMetadata);
      const result = await atomicPublish(this.absolutePath(canonicalPath), content, current?.version ?? null);
      if (result === "conflict") {
        return conflict("version_conflict", "Memory changed during the write", canonicalPath, await this.rawCurrent(canonicalPath));
      }
      const written = await this.rawCurrent(canonicalPath);
      if (!written) throw new Error("Memory write completed but the file could not be read back");
      return {
        ok: true,
        path: canonicalPath,
        version: written.version,
        updatedAt: written.stat.mtime.toISOString(),
        size: written.stat.size,
      };
    }, signal);
  }

  async patch(
    inputPath: string,
    oldString: string,
    newString: string,
    ifVersion: string,
    signal?: AbortSignal,
  ): Promise<MutationResult> {
    const canonicalPath = this.canonicalize(inputPath);
    if (!oldString) throw new Error("old_str must not be empty");
    this.validateVersion(ifVersion);
    if (ifVersion === "new") throw new Error("wiki_revise requires a version returned by wiki_recall or a prior mutation");
    await this.assertSafeTarget(canonicalPath);

    return withDocumentLock(this.root, STORE_MUTATION_LOCK, async () => {
      const current = await this.rawCurrent(canonicalPath);
      if (!current) return conflict("not_found", "Path no longer exists", canonicalPath, null);
      if (current.version !== ifVersion) return conflict("version_conflict", "Memory changed since it was read", canonicalPath, current);
      const matches = current.content.split(oldString).length - 1;
      if (matches === 0) return conflict("match_not_found", "old_str did not match the current content", canonicalPath, current, 0);
      if (matches > 1) return conflict("match_ambiguous", "old_str matched more than once; include surrounding text", canonicalPath, current, matches);

      const nextContent = current.content.replace(oldString, newString);
      let previousMetadata: MemoryMetadata | null = null;
      try { previousMetadata = parseMemoryDocument(current.content).metadata; } catch { /* permit repair */ }
      await this.validateContent(canonicalPath, nextContent, previousMetadata);
      const result = await atomicPublish(this.absolutePath(canonicalPath), nextContent, current.version);
      if (result === "conflict") return conflict("version_conflict", "Memory changed during the patch", canonicalPath, await this.rawCurrent(canonicalPath));
      const written = await this.rawCurrent(canonicalPath);
      if (!written) throw new Error("Memory patch completed but the file could not be read back");
      return { ok: true, path: canonicalPath, version: written.version, updatedAt: written.stat.mtime.toISOString(), size: written.stat.size };
    }, signal);
  }

  async append(inputPath: string, addition: string, ifVersion: string, signal?: AbortSignal): Promise<MutationResult> {
    if (!addition) throw new Error("content must not be empty");
    const canonicalPath = this.canonicalize(inputPath);
    this.validateVersion(ifVersion);
    const current = await this.read(canonicalPath);
    if (!current) {
      if (ifVersion !== "new") return conflict("not_found", "Path no longer exists", canonicalPath, null);
      return this.write(canonicalPath, addition, "new", signal);
    }
    if (ifVersion === "new") return conflict("already_exists", "Path already exists; read it and retry with its version", canonicalPath, current);
    if (current.version !== ifVersion) return conflict("version_conflict", "Memory changed since it was read", canonicalPath, current);
    const separator = current.content.endsWith("\n") ? "" : "\n";
    return this.patch(canonicalPath, current.content, `${current.content}${separator}${addition}`, current.version, signal);
  }

  async delete(inputPath: string, ifVersion: string, signal?: AbortSignal): Promise<MutationResult> {
    const canonicalPath = this.canonicalize(inputPath);
    this.validateVersion(ifVersion);
    if (ifVersion === "new") throw new Error("wiki_forget requires a version returned by wiki_recall");
    await this.assertSafeTarget(canonicalPath);
    return withDocumentLock(this.root, STORE_MUTATION_LOCK, async () => {
      const current = await this.rawCurrent(canonicalPath);
      if (!current) return conflict("not_found", "Path no longer exists", canonicalPath, null);
      if (current.version !== ifVersion) return conflict("version_conflict", "Memory changed since it was read", canonicalPath, current);
      const result = await atomicDelete(this.absolutePath(canonicalPath), current.version);
      if (result === "conflict") return conflict("version_conflict", "Memory changed during deletion", canonicalPath, await this.rawCurrent(canonicalPath));
      return { ok: true, path: canonicalPath, version: "deleted", updatedAt: new Date().toISOString(), size: 0 };
    }, signal);
  }
}
