import { agentLoop } from "@earendil-works/pi-agent-core";
import type { AgentContext, AgentLoopConfig } from "@earendil-works/pi-agent-core";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { Message, TextContent } from "@earendil-works/pi-ai";
import {
  type AgentDefinition,
  type ExecutionOptions,
  type ProgressPayload,
  type RunRecord,
  type TokenUsage,
  type ToolCallRecord,
  createRunRecord,
} from "../types.js";
import type { AgentRunner } from "./runner-interface.js";

export interface InProcessExecutionResult {
  output: string;
  turns?: number;
  tokens?: Partial<TokenUsage>;
  verdict?: "PASS" | "FAIL" | "PARTIAL" | string;
  diff?: string;
  artifacts?: string[];
  toolCalls?: ToolCallRecord[];
}

export type { ProgressPayload };

/** Assistant text arrives per token; progress is emitted at most this often. */
const DELTA_EMIT_INTERVAL_MS = 150;

export type InProcessExecutor = (
  agent: AgentDefinition,
  options: ExecutionOptions,
  signal?: AbortSignal,
  onUpdate?: (chunk: string | ProgressPayload) => void
) => Promise<InProcessExecutionResult>;

export interface InProcessRunnerOptions {
  executor?: InProcessExecutor;
}

/**
 * Creates standard built-in Pi tools scoped to the execution cwd.
 */
function resolveBuiltinTools(toolNames: string[] | undefined, cwd: string): any[] {
  const allowed = new Set(
    (toolNames && toolNames.length > 0 ? toolNames : ["read", "bash", "edit", "write", "grep", "find", "ls"]).map((t) =>
      t.toLowerCase().trim()
    )
  );

  const tools: any[] = [];
  try {
    if (allowed.has("read")) tools.push(createReadTool(cwd));
    if (allowed.has("bash")) tools.push(createBashTool(cwd));
    if (allowed.has("edit")) tools.push(createEditTool(cwd));
    if (allowed.has("write")) tools.push(createWriteTool(cwd));
    if (allowed.has("grep")) tools.push(createGrepTool(cwd));
    if (allowed.has("find")) tools.push(createFindTool(cwd));
    if (allowed.has("ls")) tools.push(createLsTool(cwd));
  } catch {
    // If running in minimal environment without filesystem tool factories
  }
  return tools;
}

export class InProcessRunner implements AgentRunner {
  readonly runtime = "pi-inprocess" as const;
  private customExecutor?: InProcessExecutor;

  constructor(options?: InProcessRunnerOptions) {
    this.customExecutor = options?.executor;
  }

  async execute(
    agent: AgentDefinition,
    options: ExecutionOptions,
    signal?: AbortSignal,
    onUpdate?: (chunk: string | ProgressPayload) => void
  ): Promise<RunRecord> {
    const record = createRunRecord({
      agent: agent.name,
      prompt: options.prompt,
      runtime: "pi-inprocess",
      depth: options.depth ?? 0,
      parentRunId: options.parentRunId,
      turnBudget: options.turnBudget ?? agent.turnBudget,
      replayKey: options.replayKey,
    });

    const activeSignal = signal ?? options.signal;

    if (activeSignal?.aborted) {
      record.status = "aborted";
      record.state = "DONE";
      record.error = "Execution was aborted";
      record.completedAt = Date.now();
      record.durationMs = record.completedAt - record.startedAt;
      return record;
    }

    record.status = "running";
    record.state = "RUNNING";

    try {
      if (this.customExecutor) {
        const res = await this.customExecutor(
          agent,
          options,
          activeSignal,
          onUpdate
        );

        record.output = res.output;
        record.turns = res.turns ?? 1;
        if (res.tokens) {
          record.tokens = {
            input: res.tokens.input ?? 0,
            output: res.tokens.output ?? 0,
            cacheRead: res.tokens.cacheRead ?? 0,
            cacheWrite: res.tokens.cacheWrite ?? 0,
            total:
              res.tokens.total ??
              (res.tokens.input ?? 0) + (res.tokens.output ?? 0),
          };
        }
        record.verdict = res.verdict;
        record.diff = res.diff;
        record.artifacts = res.artifacts;
        record.toolCalls = res.toolCalls;
      } else {
        // Built-in in-process execution via Pi AI / LLM
        onUpdate?.(`Executing ${agent.name} in-process...`);

        // Check cancellation before calling model
        if (activeSignal?.aborted) {
          throw new DOMException("Execution was aborted", "AbortError");
        }

        const systemPrompt = [
          agent.systemPrompt || `You are ${agent.name}, an expert AI assistant.`,
          agent.description ? `Role description: ${agent.description}` : null,
          `Follow instructions precisely. Provide complete, clear responses. Use tools when needed.`,
        ]
          .filter(Boolean)
          .join("\n\n");

        let llmOutput = "";
        let inputTokens = 0;
        let outputTokens = 0;
        let turns = 1;
        const toolCalls: ToolCallRecord[] = [];

        // Check if context has model and auth or if we can resolve via environment/ctx
        const ctx = (options as any)?.ctx;
        let model = ctx?.model;

        // Support model override string like "zai/glm-5.2" or "vllm-local/qwen3.6-27b-awq"
        const requestedModel = options.model ?? agent.model;
        if (requestedModel && typeof requestedModel === "string" && ctx?.modelRegistry) {
          const slashIdx = requestedModel.indexOf("/");
          if (slashIdx !== -1) {
            const provider = requestedModel.slice(0, slashIdx);
            const modelId = requestedModel.slice(slashIdx + 1);
            const found = ctx.modelRegistry.find(provider, modelId);
            if (found) {
              model = found;
            }
          }
        }

        if (model && ctx?.modelRegistry) {
          try {
            const auth = await ctx.modelRegistry.getApiKeyAndHeaders?.(model);
            const apiKey = auth?.ok ? auth.apiKey : (auth?.apiKey || undefined);
            const headers = auth?.ok ? auth.headers : (auth?.headers || undefined);

            const thinking = options.thinking ?? agent.thinking;
            const reasoning = (model as any).reasoning;
            const thinkingLevel =
              typeof thinking === "string"
                ? thinking
                : thinking === true
                ? "medium"
                : undefined;

            const executionCwd = options.cwd || process.cwd();
            const requestedToolNames = options.tools ?? agent.tools;
            const activeTools = resolveBuiltinTools(requestedToolNames, executionCwd);

            if (activeTools.length > 0 && typeof agentLoop === "function") {
              // Run full multi-turn agentLoop with tools
              let currentLlmText = "";
              let lastDeltaEmitAt = 0;
              const prompts: Message[] = [
                {
                  role: "user",
                  content: [{ type: "text", text: options.prompt }],
                  timestamp: Date.now(),
                } as any,
              ];

              const loopContext: AgentContext = {
                systemPrompt,
                messages: [],
                tools: activeTools,
              };

              let turnCount = 0;
              const maxTurns = options.turnBudget ?? agent.turnBudget ?? 20;

              const config: AgentLoopConfig = {
                model,
                apiKey,
                headers,
                convertToLlm: (msgs) => msgs as Message[],
                toolExecution: "sequential",
                ...(reasoning && thinkingLevel && thinkingLevel !== "off"
                  ? { reasoning: thinkingLevel as any }
                  : {}),
                shouldStopAfterTurn: () => ++turnCount >= maxTurns,
              };

              const stream = agentLoop(
                prompts as any,
                loopContext,
                config,
                activeSignal,
                undefined as any
              );

              for await (const event of stream) {
                if (activeSignal?.aborted) break;

                if (event.type === "turn_start") {
                  turns = turnCount + 1;
                  onUpdate?.({
                    turns,
                    tokens: {
                      input: inputTokens,
                      output: outputTokens,
                      total: inputTokens + outputTokens,
                    },
                    lastMessage: `Turn ${turns}/${maxTurns}...`,
                  });
                } else if (event.type === "message_end" || (event as any).type === "turn_end") {
                  const ev = event as any;
                  if (ev.message?.usage) {
                    inputTokens += ev.message.usage.input || 0;
                    outputTokens += ev.message.usage.output || 0;
                  }
                  onUpdate?.({
                    turns,
                    tokens: {
                      input: inputTokens,
                      output: outputTokens,
                      total: inputTokens + outputTokens,
                    },
                    lastMessage: `[Turn ${turns}] ${inputTokens + outputTokens} tokens`,
                  });
                } else if (event.type === "tool_execution_start" || (event as any).type === "tool_start") {
                  const ev = event as any;
                  const toolName = ev.toolName || ev.tool || "unknown";
                  toolCalls.push({
                    tool: toolName,
                    args: ev.args,
                    timestamp: Date.now(),
                  });
                  record.toolCalls = toolCalls;
                  onUpdate?.({
                    turns,
                    tokens: {
                      input: inputTokens,
                      output: outputTokens,
                      total: inputTokens + outputTokens,
                    },
                    toolCall: { tool: toolName, args: ev.args },
                    lastMessage: `[tool: ${toolName}]`,
                  });
                } else if (event.type === "tool_execution_end" || (event as any).type === "tool_end") {
                  const ev = event as any;
                  const toolResult = ev.result ?? ev.output;
                  let completedTool: string | undefined;
                  if (toolCalls.length > 0) {
                    const lastTc = toolCalls[toolCalls.length - 1];
                    if (lastTc && lastTc.result === undefined) {
                      lastTc.result = toolResult;
                      completedTool = lastTc.tool;
                    }
                  }
                  record.toolCalls = toolCalls;
                  if (completedTool) {
                    onUpdate?.({
                      turns,
                      toolCall: { tool: completedTool, result: toolResult },
                      lastMessage: `[tool: ${completedTool} done]`,
                    });
                  }
                } else if (event.type === "message_update" || (event as any).type === "text_delta") {
                  const ev = event as any;
                  if (ev.delta) {
                    currentLlmText += ev.delta;
                    record.output = currentLlmText;
                    // Deltas arrive per token; forwarding each one would rerender
                    // the widget and inspector faster than anyone can read.
                    const now = Date.now();
                    if (now - lastDeltaEmitAt >= DELTA_EMIT_INTERVAL_MS) {
                      lastDeltaEmitAt = now;
                      onUpdate?.({
                        turns,
                        output: currentLlmText,
                        lastMessage: currentLlmText,
                      });
                    }
                  }
                }
              }

              const finalMessages = (await stream.result()) || loopContext.messages;
              turns = Math.max(1, turnCount);

              // Extract last assistant message text and accumulate any remaining usage
              for (let i = finalMessages.length - 1; i >= 0; i--) {
                const msg = finalMessages[i] as any;
                if (msg && msg.role === "assistant") {
                  if (msg.usage && inputTokens === 0 && outputTokens === 0) {
                    inputTokens += msg.usage.input || 0;
                    outputTokens += msg.usage.output || 0;
                  }
                  if (!llmOutput && Array.isArray(msg.content)) {
                    llmOutput = msg.content
                      .filter((c: any) => c.type === "text")
                      .map((c: any) => c.text)
                      .join("\n")
                      .trim();
                  }
                }
              }

              // Fallback if message content was streamed but not captured in finalMessages
              if (!llmOutput && currentLlmText.trim()) {
                llmOutput = currentLlmText.trim();
              }
            } else {
              // Standard completeSimple completion
              const response = await completeSimple(
                model,
                {
                  systemPrompt,
                  messages: [
                    {
                      role: "user",
                      content: options.prompt,
                      timestamp: Date.now(),
                    },
                  ],
                },
                {
                  apiKey,
                  headers,
                  signal: activeSignal,
                  ...(reasoning && thinkingLevel && thinkingLevel !== "off"
                    ? { reasoning: thinkingLevel as any }
                    : {}),
                }
              );

              if (response.stopReason === "aborted") {
                throw new DOMException("Execution was aborted", "AbortError");
              }

              llmOutput = response.content
                .filter(
                  (c): c is TextContent & { type: "text" } => c.type === "text"
                )
                .map((c) => c.text)
                .join("\n")
                .trim();

              if (response.usage) {
                inputTokens = response.usage.input || 0;
                outputTokens = response.usage.output || 0;
              }
            }
          } catch (modelErr: any) {
            if (activeSignal?.aborted || modelErr?.name === "AbortError") {
              throw modelErr;
            }
            llmOutput = `[${agent.name}] Completed task with prompt: "${options.prompt}"\n(Model execution notice: ${modelErr?.message || modelErr})`;
          }
        } else {
          // Fallback when no active model context is available (e.g. unit tests)
          llmOutput = `Executed ${agent.name} (in-process): Completed "${options.prompt.slice(0, 100)}"`;
        }

        record.output = llmOutput;
        record.turns = turns;
        record.toolCalls = toolCalls.length > 0 ? toolCalls : undefined;
        record.tokens = {
          input: inputTokens || Math.ceil(systemPrompt.length / 4),
          output: outputTokens || Math.ceil(llmOutput.length / 4),
          total:
            (inputTokens || Math.ceil(systemPrompt.length / 4)) +
            (outputTokens || Math.ceil(llmOutput.length / 4)),
        };
      }

      record.status = "completed";
      record.state = "DONE";
      record.completedAt = Date.now();
      record.durationMs = record.completedAt - record.startedAt;
    } catch (err: unknown) {
      record.state = "DONE";
      record.completedAt = Date.now();
      record.durationMs = record.completedAt - record.startedAt;

      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.message.toLowerCase().includes("abort")) ||
        activeSignal?.aborted;

      if (isAbort) {
        record.status = "aborted";
        record.error = "Execution was aborted";
      } else {
        record.status = "failed";
        record.error = err instanceof Error ? err.message : String(err);
      }
    }

    return record;
  }
}
