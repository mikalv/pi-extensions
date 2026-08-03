import type { CursorRule } from "../../../__generated__/agent/v1/cursor_rules_pb.ts";
import type { McpToolDefinition } from "../../../__generated__/agent/v1/mcp_pb.ts";
import {
  backgroundShellResource,
  computerUseResource,
  deleteResource,
  diagnosticsResource,
  fetchResource,
  grepResource,
  hookExecutorResource,
  listMcpResourcesResource,
  lsResource,
  mcpResource,
  RegistryResourceAccessor,
  readMcpResourceResource,
  readResource,
  recordScreenResource,
  requestContextResource,
  shellResource,
  shellStreamResource,
  writeResource,
  writeShellStdinResource,
} from "../../../vendor/agent-exec/index.ts";
import { LocalDeleteExecutor } from "../executors/delete.ts";
import { LocalGrepExecutor } from "../executors/grep.ts";
import { LocalHookExecutorImpl } from "../executors/hook.ts";
import { LocalLsExecutor } from "../executors/ls.ts";
import { LocalMcpExecutor } from "../executors/mcp.ts";
import { LocalReadExecutor } from "../executors/read.ts";
import { LocalRequestContextExecutor } from "../executors/request-context.ts";
import { LocalShellExecutor } from "../executors/shell.ts";
import { LocalShellStreamExecutor } from "../executors/shell-stream.ts";
import {
  StubBackgroundShellExecutor,
  StubComputerUseExecutor,
  StubDiagnosticsExecutor,
  StubFetchExecutor,
  StubListMcpResourcesExecutor,
  StubReadMcpResourceExecutor,
  StubRecordScreenExecutor,
  StubWriteShellStdinExecutor,
} from "../executors/stubs.ts";
import { LocalWriteExecutor } from "../executors/write.ts";
import type { PiToolContext } from "./types.ts";

interface LocalResourceProviderOptions {
  ctx: PiToolContext;
  requestContextTools?: McpToolDefinition[];
  workspacePaths?: string[];
  cursorRules?: CursorRule[];
}

export class LocalResourceProvider extends RegistryResourceAccessor {
  constructor(options: LocalResourceProviderOptions) {
    super();
    const { ctx, requestContextTools = [], workspacePaths } = options;
    const resolvedWorkspacePaths = workspacePaths ?? [ctx.cwd];

    // hook-executor
    this.register(hookExecutorResource, new LocalHookExecutorImpl());

    // request-context
    this.register(
      requestContextResource,
      new LocalRequestContextExecutor(
        requestContextTools,
        resolvedWorkspacePaths,
        options.cursorRules ?? [],
      ),
    );

    // read, write, delete
    this.register(readResource, new LocalReadExecutor(ctx));
    this.register(writeResource, new LocalWriteExecutor(ctx));
    this.register(deleteResource, new LocalDeleteExecutor(ctx));

    // shell (unary + stream)
    const shellExecutor = new LocalShellExecutor(ctx);
    this.register(shellResource, shellExecutor);
    this.register(shellStreamResource, new LocalShellStreamExecutor(ctx));

    // grep, ls
    this.register(grepResource, new LocalGrepExecutor(ctx));
    this.register(lsResource, new LocalLsExecutor(ctx));

    // stubs (not implemented)
    this.register(backgroundShellResource, new StubBackgroundShellExecutor());
    this.register(writeShellStdinResource, new StubWriteShellStdinExecutor());
    this.register(fetchResource, new StubFetchExecutor());
    this.register(diagnosticsResource, new StubDiagnosticsExecutor());
    this.register(mcpResource, new LocalMcpExecutor(ctx));
    this.register(listMcpResourcesResource, new StubListMcpResourcesExecutor());
    this.register(readMcpResourceResource, new StubReadMcpResourceExecutor());
    this.register(recordScreenResource, new StubRecordScreenExecutor());
    this.register(computerUseResource, new StubComputerUseExecutor());
  }
}
