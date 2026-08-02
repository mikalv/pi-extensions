export interface CursorBackoffConfig {
  retries: number;
  delay: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function cursorBackoff<T>(
  fn: () => Promise<T>,
  { retries, delay, shouldRetry }: CursorBackoffConfig,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (shouldRetry && !shouldRetry(error, attempt)) throw error;
      await sleep(delay);
    }
  }
  throw lastError;
}
