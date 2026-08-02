const HELPER = `
function normalizeMarketingAgentsSearchToolArguments(args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
        return args;
    }
    const normalized = { ...args };
    if (Array.isArray(normalized.queries) || typeof normalized.query === "string") {
        return normalized;
    }
    if (Array.isArray(normalized.q)) {
        normalized.queries = normalized.q;
        delete normalized.q;
        return normalized;
    }
    if (typeof normalized.q === "string") {
        normalized.query = normalized.q;
        delete normalized.q;
    }
    return normalized;
}

function normalizeMarketingAgentsToolAlias(toolCall, tools) {
    const aliases = new Map([
        ["google:search", "web_search"],
        ["google_search", "web_search"],
        ["google.search", "web_search"],
        ["search_google", "web_search"],
    ]);
    const targetName = aliases.get(toolCall.name);
    if (!targetName || !tools?.some((tool) => tool.name === targetName)) {
        return toolCall;
    }
    return {
        ...toolCall,
        name: targetName,
        arguments: normalizeMarketingAgentsSearchToolArguments(toolCall.arguments),
    };
}
`;

export function patchPiAgentCoreSource(source) {
	const normalizedSource = source
		.replaceAll("normalizeAdsAgentsSearchToolArguments", "normalizeMarketingAgentsSearchToolArguments")
		.replaceAll("normalizeAdsAgentsToolAlias", "normalizeMarketingAgentsToolAlias");
	if (normalizedSource.includes("function normalizeMarketingAgentsToolAlias(")) {
		return normalizedSource;
	}

	const prepareStart = "async function prepareToolCall(currentContext, assistantMessage, toolCall, config, signal) {\n";
	if (!normalizedSource.includes(prepareStart)) {
		return normalizedSource;
	}

	let patched = normalizedSource.replace(prepareStart, `${HELPER}\n${prepareStart}`);
	patched = patched.replace(
		"async function prepareToolCall(currentContext, assistantMessage, toolCall, config, signal) {\n    const tool = currentContext.tools?.find((t) => t.name === toolCall.name);",
		"async function prepareToolCall(currentContext, assistantMessage, toolCall, config, signal) {\n    const effectiveToolCall = normalizeMarketingAgentsToolAlias(toolCall, currentContext.tools);\n    const tool = currentContext.tools?.find((t) => t.name === effectiveToolCall.name);",
	);
	patched = patched.replace(
		"        const preparedToolCall = prepareToolCallArguments(tool, toolCall);",
		"        const preparedToolCall = prepareToolCallArguments(tool, effectiveToolCall);",
	);
	patched = patched.replace(
		"                toolCall,\n                args: validatedArgs,",
		"                toolCall: preparedToolCall,\n                args: validatedArgs,",
	);
	patched = patched.replace(
		"            toolCall,\n            tool,",
		"            toolCall: preparedToolCall,\n            tool,",
	);
	return patched;
}
