import { Code, ConnectError } from "@connectrpc/connect";

/**
 * Pi registers only an `uncaughtException` listener and exits the process from
 * it unconditionally. Node escalates an unhandled rejection to that listener
 * exactly when no `unhandledRejection` listener exists, so registering one here
 * is the only point where a transport failure can be intercepted before it
 * kills the session.
 *
 * The connect-node http/2 session manager rejects its connection promise from a
 * socket event handler, outside any call site we can wrap, so losing the network
 * mid-session took Pi down with it.
 */

const MAX_CAUSE_DEPTH = 8;

function causeChain(reason: unknown): unknown[] {
  const seen = new Set<unknown>();
  const chain: unknown[] = [];
  let current: unknown = reason;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current === null || current === undefined || seen.has(current)) break;
    seen.add(current);
    chain.push(current);

    if (current instanceof AggregateError) {
      chain.push(...current.errors);
    }

    current =
      current instanceof Error
        ? (current as { cause?: unknown }).cause
        : undefined;
  }

  return chain;
}

/**
 * True when a rejection is a Connect transport failure caused by an unreachable
 * network, rather than a defect that should still crash.
 */
export function isTransientTransportFailure(reason: unknown): boolean {
  if (!(reason instanceof ConnectError)) return false;
  if (ConnectError.from(reason).code !== Code.Unavailable) return false;

  // `unavailable` also covers a server refusing the call, which is not
  // something to swallow silently. Require evidence of a dead connection.
  return causeChain(reason).some((entry) => {
    if (entry instanceof AggregateError) return true;
    const code = (entry as { code?: unknown } | null)?.code;
    return typeof code === "string" && code.startsWith("E");
  });
}

let installed = false;

export interface NetworkCrashGuardOptions {
  /** Invoked instead of crashing when a transport failure is suppressed. */
  onSuppressed?: (error: ConnectError) => void;
  /** Re-escalation channel; overridable for tests. */
  rethrow?: (reason: unknown) => void;
}

/**
 * Intercept unhandled Connect transport failures so a dropped network does not
 * terminate Pi. Every other rejection is re-thrown on the next tick, which is
 * the escalation Node would have performed on its own.
 */
export function installNetworkCrashGuard(
  options: NetworkCrashGuardOptions = {},
): () => void {
  if (installed) return () => {};
  installed = true;

  const rethrow = options.rethrow ?? ((reason: unknown) => {
    process.nextTick(() => {
      throw reason;
    });
  });

  const handler = (reason: unknown) => {
    if (isTransientTransportFailure(reason)) {
      options.onSuppressed?.(reason as ConnectError);
      return;
    }

    rethrow(reason);
  };

  process.on("unhandledRejection", handler);

  return () => {
    process.off("unhandledRejection", handler);
    installed = false;
  };
}
