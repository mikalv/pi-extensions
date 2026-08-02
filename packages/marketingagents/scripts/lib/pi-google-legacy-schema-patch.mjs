const HELPER = [
	"function normalizeLegacyToolSchema(schema) {",
	"    if (Array.isArray(schema)) return schema.map((item) => normalizeLegacyToolSchema(item));",
	'    if (!schema || typeof schema !== "object") return schema;',
	"    const normalized = {};",
	"    for (const [key, value] of Object.entries(schema)) {",
	'        if (key === "const") {',
	"            normalized.enum = [value];",
	"            continue;",
	"        }",
	"        normalized[key] = normalizeLegacyToolSchema(value);",
	"    }",
	"    return normalized;",
	"}",
].join("\n");

const ORIGINAL =
	'                ...(useParameters ? { parameters: tool.parameters } : { parametersJsonSchema: tool.parameters }),';
const PATCHED = [
	"                ...(useParameters",
	"                    ? { parameters: normalizeLegacyToolSchema(tool.parameters) }",
	"                    : { parametersJsonSchema: tool.parameters }),",
].join("\n");

export function patchPiGoogleLegacySchemaSource(source) {
	let patched = source;

	if (patched.includes("function normalizeLegacyToolSchema(schema) {")) {
		return patched;
	}

	if (!patched.includes(ORIGINAL)) {
		return source;
	}

	patched = patched.replace(ORIGINAL, PATCHED);
	const marker = "export function convertTools(tools, useParameters = false) {";
	const markerIndex = patched.indexOf(marker);
	if (markerIndex === -1) {
		return source;
	}

	return `${patched.slice(0, markerIndex)}${HELPER}\n\n${patched.slice(markerIndex)}`;
}
