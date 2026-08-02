export interface CursorRuntimeConfig {
  apiUrl: string;
  clientVersion: string;
  clientType: string;
}

export const DEFAULT_CURSOR_RUNTIME_CONFIG: CursorRuntimeConfig = {
  apiUrl: "https://api2.cursor.sh",
  clientVersion: "cli-2026.01.17-d239e66",
  clientType: "cli",
};
