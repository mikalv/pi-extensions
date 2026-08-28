import { describe, expect, test } from "bun:test";
import {
  installNetworkCrashGuard,
  isTransientTransportFailure,
} from "../src/lib/network-crash-guard.ts";
import { Code, ConnectError } from "@connectrpc/connect";

function deadNetworkRejection(): ConnectError {
  const agg = new AggregateError(
    [
      Object.assign(new Error("connect ETIMEDOUT 1.2.3.4:443"), { code: "ETIMEDOUT" }),
      Object.assign(new Error("connect ETIMEDOUT 1.2.3.4:443"), { code: "ETIMEDOUT" }),
    ],
    "connect ETIMEDOUT",
  );
  (agg as { code?: string }).code = "ETIMEDOUT";
  return new ConnectError("unavailable", Code.Unavailable, undefined, undefined, agg);
}

describe("network-crash-guard", () => {
  test("recognises dead-network ConnectError(Unavailable, ETIMEDOUT)", () => {
    expect(isTransientTransportFailure(deadNetworkRejection())).toBe(true);
  });

  test("does not swallow plain Errors", () => {
    expect(isTransientTransportFailure(new Error("real bug"))).toBe(false);
  });

  test("does not swallow ConnectError without network cause", () => {
    expect(isTransientTransportFailure(new ConnectError("server said no", Code.Unavailable))).toBe(false);
  });

  test("does not swallow non-unavailable ConnectError", () => {
    expect(isTransientTransportFailure(new ConnectError("Internal", Code.Internal))).toBe(false);
  });

  test("handler suppresses transient and re-escalates genuine bugs", async () => {
    const suppressed: unknown[] = [];
    const rethrown: unknown[] = [];
    const off = installNetworkCrashGuard({
      onSuppressed: (e) => suppressed.push(e),
      rethrow: (r) => rethrown.push(r),
    });

    // Dispatch the event directly: a real Promise.reject would trip bun's own
    // test-runner unhandledRejection listener before the guard is exercised.
    const never = Promise.resolve();
    process.emit("unhandledRejection", deadNetworkRejection(), never);
    process.emit("unhandledRejection", new Error("genuine bug"), never);
    await new Promise((r) => setTimeout(r, 5));

    off();

    expect(suppressed.length).toBe(1);
    expect(suppressed[0]).toBeInstanceOf(ConnectError);
    expect(rethrown.length).toBe(1);
    expect(String(rethrown[0])).toContain("genuine bug");
  });
});
