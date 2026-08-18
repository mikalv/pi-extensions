/**
 * Bundled Telegram skill discovery regressions
 * Covers source/runtime path contribution and package publication metadata
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  registerTelegramSkillDiscovery,
  TELEGRAM_SKILLS_PATH,
} from "../lib/skills.ts";

test("Telegram extension contributes both bundled skills", async () => {
  let resourceHook: (() => { skillPaths: string[] }) | undefined;
  registerTelegramSkillDiscovery({
    on(name: string, hook: unknown) {
      assert.equal(name, "resources_discover");
      resourceHook = hook as () => { skillPaths: string[] };
    },
  } as never);

  assert.deepEqual(resourceHook?.(), { skillPaths: [TELEGRAM_SKILLS_PATH] });
  const skillNames = ["telegram-bridge", "generated-control-surface"];
  const sources = new Map<string, string>();
  for (const name of skillNames) {
    const source = await readFile(join(TELEGRAM_SKILLS_PATH, name, "SKILL.md"), "utf8");
    sources.set(name, source);
    assert.match(source, new RegExp(`^name: ${name}$`, "m"));
    assert.match(source, /^description: .+$/m);
  }
  const bridge = sources.get("telegram-bridge") ?? "";
  assert.match(bridge, /`generated-control-surface`/u);
  assert.match(bridge, /Compact Matrix Literal \(CML\)/u);
  assert.match(bridge, /without a parser-level width cap/u);
  assert.match(bridge, /six through eight.*short position-bearing labels/u);
  const generatedSurface = sources.get("generated-control-surface") ?? "";
  assert.match(generatedSurface, /without requiring an explicit user request/u);
  assert.match(generatedSurface, /Compact Matrix Literal \(CML\)/u);
  assert.match(generatedSurface, /one or more controls.*parser-level width cap/u);
  assert.match(
    generatedSurface,
    /ordered ragged sequence.*not as a rectangular matrix/su,
  );
  assert.match(
    generatedSurface,
    /Rectangular grids are one specialization.*genuinely spatial/su,
  );
  assert.match(generatedSurface, /genuine peers.*coherent toolbar/su);
  assert.match(generatedSurface, /1 → 2 → 4 → 1 → 2/u);
  assert.match(generatedSurface, /never pad a row.*no-op controls/su);
  assert.match(
    generatedSurface,
    /at most two columns.*words, phrases.*more semantic rows/su,
  );
  assert.match(
    generatedSurface,
    /Three through five columns.*short symbols.*Six through eight/su,
  );
  assert.match(generatedSurface, /Eight is the phone-width UX maximum/u);
  assert.match(generatedSurface, /never generate a row of nine or more controls/u);
  assert.match(generatedSurface, /Never shorten necessary wording/u);
  assert.match(
    generatedSurface,
    /vertical extent independently.*`8×16` field.*do not paginate/su,
  );
  assert.match(
    generatedSurface,
    /non-spatial collections.*semantic grouping, progressive disclosure, or pagination/su,
  );
  assert.match(
    generatedSurface,
    /symmetry as an evidence claim.*non-spatial task should be ragged by default/su,
  );
  assert.match(generatedSurface, /### Layout Catalog/u);
  assert.match(generatedSurface, /`1 → 2 → N×1`/u);
  assert.match(generatedSurface, /Repeated `2`.*Text-bearing choices/u);
  assert.match(generatedSurface, /`R×C`.*`C ≤ 8`.*`R` may be substantially larger/u);
  assert.match(
    generatedSurface,
    /Do not select a catalog shape first and force the task into it/u,
  );
  assert.match(
    generatedSurface,
    /smallest sufficient action delta.*do not duplicate/su,
  );
  assert.match(generatedSurface, /human-auditable Markdown state artifact/u);
  assert.match(generatedSurface, /current state \+ admitted action → next state/u);
  assert.match(generatedSurface, /repeated clicks against current state/u);
});

test("Generated filesystem surfaces declare structural navigation around paginated entries", async () => {
  const source = await readFile(
    join(TELEGRAM_SKILLS_PATH, "generated-control-surface", "SKILL.md"),
    "utf8",
  );
  const lfSource = source.replaceAll("\r\n", "\n");
  for (const candidate of [lfSource, lfSource.replaceAll("\n", "\r\n")]) {
    const section = candidate.match(/### Filesystem\r?\n([\s\S]*?)(?=\r?\n### )/u)?.[1] ?? "";
    const rules = section.match(/^\d+\. .+$/gmu) ?? [];
    assert.equal(rules.length, 4);
    assert.match(rules[0] ?? "", /⬆️ Up.*`\/`/u);
    assert.match(rules[1] ?? "", /⬅️ Previous.*➡️ Next/u);
    assert.match(
      rules[2] ?? "",
      /visible directories.*hidden directories.*visible files.*hidden files/u,
    );
    assert.match(rules[2] ?? "", /\b10\b/u);
    assert.match(rules[3] ?? "", /\*\*Path:\*\*.*\*\*Entries:\*\*/u);
    assert.match(rules[3] ?? "", /monospaced.*Refresh/u);
    assert.doesNotMatch(rules[3] ?? "", /·/u);
    assert.match(section, /one `telegram_button` JSON matrix/u);
    assert.match(section, /numbered text fallback/u);
    assert.match(section, /user explicitly requests it or durable user Knowledge/u);
  }
});

test("Package metadata publishes the bundled skill root", async () => {
  const packageRoot = dirname(TELEGRAM_SKILLS_PATH);
  const manifest = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  ) as { files?: string[]; pi?: { skills?: string[] } };

  assert.ok(manifest.files?.includes("skills/"));
  assert.deepEqual(manifest.pi?.skills, ["./skills"]);
});
