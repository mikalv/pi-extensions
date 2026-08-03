export type MarkdownTaskStatus = "pending" | "done";
export type TaskScope = "session" | "project";

export interface MarkdownTask {
  id: string;
  text: string;
  status: MarkdownTaskStatus;
  scope: TaskScope;
  line: number;
}
