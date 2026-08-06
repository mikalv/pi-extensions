# mm-wiki

**Purpose:** Compiled topical wiki layer for Pi — local markdown filesystem that sits between observational memory (STM) and Prism LTM.

## Tools, Commands, and Hooks

**Tools:**
- `wiki_index`: List persistent memory documents by path. Returns metadata only.
- `wiki_recall`: Read one persistent memory document. Returns full content and its 12-character version for guarded updates.
- `wiki_inscribe`: Write a completely new persistent memory document with frontmatter. Requires version `'new'`.
- `wiki_revise`: Edit an existing persistent memory document via targeted string replacement (requires version check).
- `wiki_extend`: Append new text on a new line without resending the existing document (requires version check).
- `wiki_forget`: Permanently delete an entire memory document.

**Commands:**
- `/wiki-status`: Shows Wiki storage status (number of files, total bytes, and directory path).

**Hooks:**
- `session_start`: Initializes the store directory structure and clears version caches.
- `before_agent_start`: Injects a wiki listing context block into the system prompt, including updates since last context, and directly injects the contents of `/profile.md` and `/preferences.md`.

## Key Files

- `src/index.ts`: Main entry point. Registers the hooks, tools, and commands, and constructs the context block injected into the system prompt.
- `src/store.ts`: Implements `WikiStore` handling atomic file operations, concurrent-safe reads/writes/deletes, validation constraints (path traversal, size, name format), and YAML frontmatter parsing.
- `src/atomic.ts`: Provides utility functions for atomic file publishing and deletion, along with a lock mechanism (`withDocumentLock`).
- `src/content-scanner.ts`: Scans content for unsafe patterns before allowing writes.
- `src/types.ts`: Defines types for memory metadata, documents, lists, and mutation results.

## How it works

The `mm-wiki` package provides a file-based Wiki store for Pi to organize persistent information in curated topical pages, acting as a middle layer between short-term observations and semantic long-term memory (Prism).

**Architecture & Storage:** The Wiki consists of Markdown files stored in a designated directory. Supported root files include `/profile.md` and `/preferences.md`, while other documents must reside in `/topics`, `/areas`, or `/people`. Every standard document requires YAML frontmatter with specific fields (`name`, `description`, `sources`). 

**Concurrency Control:** To prevent data loss from concurrent writes or stalled contexts, modifications (`wiki_inscribe`, `wiki_revise`, `wiki_extend`, `wiki_forget`) require a 12-character version hash (obtained from `wiki_recall`). The store uses atomic rename operations and file-based locking (`.locks/.catalog`) to guarantee consistency.

**Agent Integration:** On every `before_agent_start` event, the extension injects a summary of available memory files (using frontmatter descriptions) into the agent's system prompt, alongside the full content of `profile` and `preferences`. It also tracks which files have been modified outside the current conversation to alert the agent if a re-read is necessary.

## Configuration

- **Environment Variables:**
  - `MM_WIKI_DIR`: Directory to store the wiki. Defaults to `~/.pi/agent/wiki` if not set.

The store intrinsically limits file sizes (default `64KB`) and limits listings to a maximum of 200 items per page (default 100).

## Dependencies

- **Peer Dependencies:** 
  - `@earendil-works/pi-coding-agent`: Used for `ExtensionAPI` and text processing utilities (`truncateHead`, `formatSize`).
  - `typebox`: Used for validating tool parameters.
- **Node.js Built-ins:** Heavy reliance on `node:fs/promises`, `node:path`, `node:os`, and `node:crypto`.
