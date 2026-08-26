import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type InvalidJob, type JobDefinition, parseJobFile } from "./frontmatter.js";

export interface DiscoveryResult {
	jobs: JobDefinition[];
	invalid: InvalidJob[];
}

export function scheduledDir(workspace: string): string {
	return join(workspace, "scheduled");
}

export async function discoverJobs(workspace: string): Promise<DiscoveryResult> {
	const dir = scheduledDir(workspace);

	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch (error: any) {
		if (error?.code === "ENOENT") return { jobs: [], invalid: [] };
		throw error;
	}

	const parsed: JobDefinition[] = [];
	const invalid: InvalidJob[] = [];

	for (const entry of entries.filter((name) => name.endsWith(".md")).sort()) {
		const path = join(dir, entry);
		const content = await readFile(path, "utf8");
		const result = parseJobFile({ path, workspace, content });
		if (result.ok) parsed.push(result.job);
		else invalid.push(result.invalid);
	}

	const byId = new Map<string, JobDefinition[]>();
	for (const job of parsed) {
		const bucket = byId.get(job.id);
		if (bucket) bucket.push(job);
		else byId.set(job.id, [job]);
	}

	const jobs: JobDefinition[] = [];
	for (const [id, bucket] of byId) {
		if (bucket.length === 1) {
			jobs.push(bucket[0]);
			continue;
		}
		const paths = bucket.map((job) => job.path).join(", ");
		for (const job of bucket) {
			invalid.push({ path: job.path, id, errors: [`duplicate id "${id}" also declared in ${paths}`] });
		}
	}

	jobs.sort((a, b) => a.id.localeCompare(b.id));
	invalid.sort((a, b) => a.path.localeCompare(b.path));
	return { jobs, invalid };
}
