import { ControlPlane } from "./control/index.js";
import type { ExecutionOptions, RunRecord } from "./types.js";

export interface SuperpowersBridgeOptions {
  controlPlane: ControlPlane;
}

export class SuperpowersBridge {
  private controlPlane: ControlPlane;

  constructor(options: SuperpowersBridgeOptions) {
    this.controlPlane = options.controlPlane;
  }

  /**
   * Dispatch a brainstorming subagent run with Superpowers methodology prompt.
   */
  public async dispatchBrainstorm(
    topic: string,
    options?: Partial<ExecutionOptions>
  ): Promise<RunRecord> {
    const prompt = [
      `You are an expert software architect conducting a brainstorming session.`,
      `Topic/Goal: ${topic}`,
      ``,
      `Superpowers Brainstorming Discipline:`,
      `1. Understand the core problem and constraints.`,
      `2. Explore 2-3 distinct approaches with trade-offs.`,
      `3. Identify potential risks, edge cases, and failure modes.`,
      `4. Recommend a clear design path with next steps.`,
    ].join("\n");

    return this.controlPlane.dispatch({
      agent: options?.agent ?? "sp-brainstorm",
      prompt,
      runtime: options?.runtime ?? "pi-inprocess",
      model: options?.model,
      thinking: options?.thinking ?? "high",
      turnBudget: options?.turnBudget ?? 15,
      cwd: options?.cwd,
      ...options,
    });
  }

  /**
   * Dispatch an implementation planning subagent run with bite-sized TDD plan structure.
   */
  public async dispatchPlan(
    feature: string,
    options?: Partial<ExecutionOptions>
  ): Promise<RunRecord> {
    const prompt = [
      `You are a senior software architect creating an implementation plan.`,
      `Feature/Task: ${feature}`,
      ``,
      `Superpowers Writing Plans Discipline:`,
      `1. Break the task down into Bite-sized 2-5 minute tasks.`,
      `2. Structure each task with:`,
      `   - Files: exact paths to create/modify/test`,
      `   - Interfaces: consumes & produces`,
      `   - Step 1: Write failing test`,
      `   - Step 2: Run test to verify it fails`,
      `   - Step 3: Implement minimal code to pass`,
      `   - Step 4: Run test to verify pass`,
      `   - Step 5: Commit`,
      `3. Strict TDD, DRY, and YAGNI.`,
    ].join("\n");

    return this.controlPlane.dispatch({
      agent: options?.agent ?? "sp-plan",
      prompt,
      runtime: options?.runtime ?? "pi-inprocess",
      model: options?.model,
      thinking: options?.thinking ?? "high",
      turnBudget: options?.turnBudget ?? 20,
      cwd: options?.cwd,
      ...options,
    });
  }

  /**
   * Dispatch an implementation subagent with strict TDD execution discipline.
   */
  public async dispatchImplement(
    task: string,
    options?: Partial<ExecutionOptions>
  ): Promise<RunRecord> {
    const prompt = [
      `You are an implementer subagent executing an approved plan.`,
      `Task: ${task}`,
      ``,
      `Superpowers Implementation Discipline:`,
      `1. Follow TDD: Write/update tests first.`,
      `2. Verify failure before writing implementation.`,
      `3. Write minimal correct code to satisfy the test.`,
      `4. Run all test suites to guarantee 0 regressions.`,
      `5. Perform self-review before marking complete.`,
    ].join("\n");

    return this.controlPlane.dispatch({
      agent: options?.agent ?? "sp-implement",
      prompt,
      runtime: options?.runtime ?? "pi-inprocess",
      model: options?.model,
      thinking: options?.thinking ?? "medium",
      turnBudget: options?.turnBudget ?? 25,
      cwd: options?.cwd,
      ...options,
    });
  }

  /**
   * Dispatch a code reviewer subagent run.
   */
  public async dispatchReview(
    target: string,
    options?: Partial<ExecutionOptions>
  ): Promise<RunRecord> {
    const prompt = [
      `You are a strict, adversarial code reviewer.`,
      `Target/Diff to review: ${target}`,
      ``,
      `Superpowers Code Review Discipline:`,
      `1. Verify spec compliance and completeness.`,
      `2. Inspect test coverage and quality.`,
      `3. Check edge cases, error handling, and security.`,
      `4. Output clear VERDICT: PASS, FAIL, or PARTIAL with bulleted findings.`,
    ].join("\n");

    return this.controlPlane.dispatch({
      agent: options?.agent ?? "reviewer",
      prompt,
      runtime: options?.runtime ?? "pi-inprocess",
      model: options?.model,
      thinking: options?.thinking ?? "high",
      turnBudget: options?.turnBudget ?? 15,
      cwd: options?.cwd,
      ...options,
    });
  }
}
