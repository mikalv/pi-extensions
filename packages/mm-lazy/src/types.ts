/**
 * LazyVim-style extension load specs for Pi.
 */

export type LazyMode = false | true | "after-start";

export type SpecState = "eager" | "pending" | "loading" | "loaded" | "error";

export interface LazySpec {
	/** Stable id used by /lazy load <name> */
	name: string;
	/** Package source as in settings.packages (npm:..., git:..., or local path) */
	source: string;
	/**
	 * false      — always load with Pi (not managed)
	 * true       — load on demand (cmd / tools / event / keywords / manual)
	 * "after-start" — load shortly after session_start (VeryLazy)
	 */
	lazy?: LazyMode;
	/** Load priority for after-start (lower = earlier). Default 100. */
	priority?: number;
	/** Slash-command names that should stub-load this package on first use */
	cmd?: string[];
	/** Tool names to register as load-on-call stubs */
	tools?: string[];
	/** Keyboard shortcuts that load this package then run optional action */
	keys?: string[];
	/** Pi events that trigger load (e.g. "before_agent_start") */
	event?: string[];
	/** Case-insensitive prompt keywords that trigger load */
	keywords?: string[];
	/** Other spec names that must load first */
	dependencies?: string[];
	/** Optional human description */
	description?: string;
}

export interface LazyConfig {
	version: 1;
	defaults?: {
		lazy?: LazyMode;
	};
	/** When true, keyword/event auto-load is enabled (default true) */
	auto?: boolean;
	/** Maximum packages auto-loaded before one agent turn (default 1). */
	autoLoadLimit?: number;
	/** Number of after-start packages loaded in one event-loop slice (default 1). */
	afterStartBatchSize?: number;
	/** Delay between after-start slices in milliseconds (default 0). */
	afterStartDelayMs?: number;
	specs: LazySpec[];
}

export interface ResolvedEntry {
	spec: LazySpec;
	/** Resolved only when the package is first requested. */
	packageRoot: string;
	extensionPaths: string[];
	resolveMs?: number;
	/** True when settings filter keeps extensions[] empty so Pi won't eager-load */
	moduleLazyReady: boolean;
	state: SpecState;
	error?: string;
	loadedAt?: number;
	loadMs?: number;
	loadedTools?: string[];
	loadedCommands?: string[];
	/** Real command handlers captured while loading, keyed by command name. */
	loadedCommandHandlers?: Map<string, (args: string, ctx: any) => Promise<void>>;
}

export interface LoadResult {
	ok: boolean;
	name: string;
	alreadyLoaded?: boolean;
	loadMs?: number;
	tools?: string[];
	commands?: string[];
	/** Real command handlers captured while loading, keyed by command name. */
	commandHandlers?: Map<string, (args: string, ctx: any) => Promise<void>>;
	error?: string;
}
