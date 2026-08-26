import { describe, it, expect } from "bun:test";
import { parseContinueLine, parseDuration } from "../src/frontmatter.js";

describe("parseDuration", () => {
	it("accepts duration strings and passes through millisecond numbers", () => {
		expect(parseDuration("500ms")).toBe(500);
		expect(parseDuration("90s")).toBe(90_000);
		expect(parseDuration("2m")).toBe(120_000);
		expect(parseDuration("1h")).toBe(3_600_000);
		expect(parseDuration(" 2m ")).toBe(120_000);
		expect(parseDuration(900_000)).toBe(900_000);
	});

	it("rejects zero, negatives, unknown units, and non-values", () => {
		expect(parseDuration(0)).toBeNull();
		expect(parseDuration(-5)).toBeNull();
		expect(parseDuration("2w")).toBeNull();
		expect(parseDuration("soon")).toBeNull();
		expect(parseDuration("")).toBeNull();
		expect(parseDuration(undefined)).toBeNull();
		expect(parseDuration({})).toBeNull();
	});
});

describe("parseContinueLine", () => {
	it("parses the bracketed list form from the last non-empty line", () => {
		const out = "did some work\n\ncontinue: [alert-user,record]\n\n";
		expect(parseContinueLine(out)).toEqual({
			raw: "continue: [alert-user,record]",
			tokens: ["alert-user", "record"],
		});
	});

	it("parses a bare token and an empty list, case-insensitively", () => {
		expect(parseContinueLine("CONTINUE: Alert-User")).toEqual({
			raw: "CONTINUE: Alert-User",
			tokens: ["alert-user"],
		});
		expect(parseContinueLine("continue: []")).toEqual({
			raw: "continue: []",
			tokens: [],
		});
	});

	it("returns null for prose, missing prefix, bad tokens, and over-long lines", () => {
		expect(parseContinueLine("I finished the report [see above]")).toBeNull();
		expect(parseContinueLine("alert-user")).toBeNull();
		expect(parseContinueLine("continue: [ok, BAD TOKEN]")).toBeNull();
		expect(parseContinueLine(`continue: [${"a".repeat(200)}]`)).toBeNull();
		expect(parseContinueLine("")).toBeNull();
	});
});
