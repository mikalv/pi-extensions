import type {
  ShellArgs,
  ShellStream,
} from "../../../__generated__/agent/v1/shell_exec_pb.ts";
import {
  ShellRejected,
  ShellStream as ShellStreamClass,
  ShellStreamExit,
  ShellStreamStdout,
} from "../../../__generated__/agent/v1/shell_exec_pb.ts";
import type { StreamExecutor } from "../../../vendor/agent-exec/index.ts";
import { toolResultToText } from "../../shared/tool-result.ts";
import {
  decodeToolCallId,
  type PiToolContext,
} from "../local-resource-provider/types.ts";
import { requestToolExecution } from "../tool-bridge.ts";
import { confirmIfDangerous } from "./shell.ts";

export class LocalShellStreamExecutor
  implements StreamExecutor<ShellArgs, ShellStream>
{
  private readonly ctx: PiToolContext;

  constructor(ctx: PiToolContext) {
    this.ctx = ctx;
  }

  async *execute(_ctx: unknown, args: ShellArgs): AsyncIterable<ShellStream> {
    const toolCallId = decodeToolCallId(args.toolCallId);
    const workingDirectory = args.workingDirectory || this.ctx.cwd;

    if (!this.ctx.getActiveTools().has("bash")) {
      yield new ShellStreamClass({
        event: {
          case: "rejected",
          value: new ShellRejected({
            command: args.command,
            workingDirectory,
            reason: "Tool not available",
            isReadonly: false,
          }),
        },
      });
      yield new ShellStreamClass({
        event: {
          case: "exit",
          value: new ShellStreamExit({
            code: 1,
            cwd: workingDirectory,
            aborted: false,
          }),
        },
      });
      return;
    }

    const approved = await confirmIfDangerous(this.ctx.getCtx, args.command);
    if (!approved) {
      yield new ShellStreamClass({
        event: {
          case: "rejected",
          value: new ShellRejected({
            command: args.command,
            workingDirectory,
            reason: "Command rejected",
            isReadonly: false,
          }),
        },
      });
      yield new ShellStreamClass({
        event: {
          case: "exit",
          value: new ShellStreamExit({
            code: 1,
            cwd: workingDirectory,
            aborted: false,
          }),
        },
      });
      return;
    }

    const timeoutSeconds =
      args.timeout && args.timeout > 0 ? args.timeout : undefined;

    const piResult = await requestToolExecution(
      this.ctx.getChannel?.() ?? null,
      {
        toolCallId,
        cursorExecType: "shell-stream",
        piToolName: "bash",
        piToolArgs: {
          command: args.command,
          ...(timeoutSeconds != null ? { timeout: timeoutSeconds } : {}),
        },
      },
    );

    const text = toolResultToText(piResult);
    if (text) {
      yield new ShellStreamClass({
        event: {
          case: "stdout",
          value: new ShellStreamStdout({ data: text }),
        },
      });
    }

    yield new ShellStreamClass({
      event: {
        case: "exit",
        value: new ShellStreamExit({
          code: piResult.isError ? 1 : 0,
        }),
      },
    });
  }
}
