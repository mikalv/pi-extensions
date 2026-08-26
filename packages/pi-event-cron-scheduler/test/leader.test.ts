import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LeaderLock, STALE_MS } from "../src/leader.js";

let dir: string;
let now = Date.parse("2026-08-26T04:00:00.000Z");
const clock = () => now;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "eventcron-leader-"));
	now = Date.parse("2026-08-26T04:00:00.000Z");
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("LeaderLock", () => {
	it("acquires an unheld lock and records the pid", async () => {
		const lock = new LeaderLock({ stateDir: dir, pid: 100, clock });
		expect(await lock.tryAcquire()).toBe(true);
		expect(lock.held).toBe(true);
		expect((await lock.read())?.pid).toBe(100);
	});

	it("refuses a second holder while the heartbeat is fresh", async () => {
		const first = new LeaderLock({ stateDir: dir, pid: 100, clock });
		expect(await first.tryAcquire()).toBe(true);

		now += 30_000;
		const second = new LeaderLock({ stateDir: dir, pid: 200, clock });
		expect(await second.tryAcquire()).toBe(false);
		expect(second.held).toBe(false);
		expect((await second.read())?.pid).toBe(100);
	});

	it("takes over once the heartbeat is stale", async () => {
		const dead = new LeaderLock({ stateDir: dir, pid: 100, clock });
		expect(await dead.tryAcquire()).toBe(true);

		now += STALE_MS + 1_000;
		const fresh = new LeaderLock({ stateDir: dir, pid: 200, clock });
		expect(await fresh.tryAcquire()).toBe(true);
		expect((await fresh.read())?.pid).toBe(200);
	});

	it("renews its own heartbeat and stays acquirable by itself", async () => {
		const lock = new LeaderLock({ stateDir: dir, pid: 100, clock });
		await lock.tryAcquire();
		const before = (await lock.read())?.heartbeat;

		now += 20_000;
		await lock.heartbeat();
		const after = await lock.read();
		expect(after?.heartbeat).not.toBe(before);
		expect(after?.acquiredAt).toBe(new Date(Date.parse("2026-08-26T04:00:00.000Z")).toISOString());
		expect(await lock.tryAcquire()).toBe(true);
	});

	it("releases so another pid can take over immediately", async () => {
		const first = new LeaderLock({ stateDir: dir, pid: 100, clock });
		await first.tryAcquire();
		await first.release();
		expect(first.held).toBe(false);
		expect(await first.read()).toBeNull();

		const second = new LeaderLock({ stateDir: dir, pid: 200, clock });
		expect(await second.tryAcquire()).toBe(true);
	});

	it("does nothing on heartbeat or release when the lock is not held", async () => {
		const lock = new LeaderLock({ stateDir: dir, pid: 100, clock });
		await lock.heartbeat();
		await lock.release();
		expect(await lock.read()).toBeNull();
	});
});
