import { spawn } from "node:child_process";

export type CliResult = {
	stdout: string;
	stderr: string;
	code: number | null;
};

export async function runCli(binary: string, args: string[], options: { input?: string; timeoutMs?: number } = {}): Promise<CliResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let timer: NodeJS.Timeout | undefined;

		if (options.timeoutMs) {
			timer = setTimeout(() => {
				child.kill("SIGTERM");
				reject(new Error(`${binary} timed out after ${options.timeoutMs}ms`));
			}, options.timeoutMs);
		}

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (err) => {
			if (timer) clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			if (timer) clearTimeout(timer);
			resolve({ stdout, stderr, code });
		});

		if (options.input) {
			child.stdin.write(options.input);
		}
		child.stdin.end();
	});
}

export function formatCliResult(result: CliResult): string {
	const trimmed = result.stdout.trim();
	if (result.code === 0) return trimmed || "(no output)";
	const err = result.stderr.trim() || `${result.code}`;
	return `Exit ${result.code}: ${err}${trimmed ? `\n---\nstdout:\n${trimmed}` : ""}`;
}

export function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
