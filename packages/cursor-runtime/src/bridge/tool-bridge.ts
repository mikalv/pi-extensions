export interface CursorToolResultLike {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  isError?: boolean;
  timestamp: number;
}

export function resolveCursorToolResult(_result: CursorToolResultLike): void {
  // placeholder for harvested Cursor→Pi tool result bridge
}
