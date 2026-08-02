const PATH_TO_FILE_URL_IMPORT = 'import { fileURLToPath, pathToFileURL } from "node:url";';
const FILE_URL_TO_PATH_IMPORT = 'import { fileURLToPath } from "node:url";';

const IMPORT_CALL = 'const module = await jiti.import(extensionPath, { default: true });';
const PATCHED_IMPORT_CALL = [
	'    const extensionSpecifier = process.platform === "win32" && path.isAbsolute(extensionPath)',
	'        ? pathToFileURL(extensionPath).href',
	'        : extensionPath;',
	'    const module = await jiti.import(extensionSpecifier, { default: true });',
].join("\n");

export function patchPiExtensionLoaderSource(source) {
	let patched = source;

	if (patched.includes(PATH_TO_FILE_URL_IMPORT) || patched.includes(PATCHED_IMPORT_CALL)) {
		return patched;
	}

	if (patched.includes(FILE_URL_TO_PATH_IMPORT)) {
		patched = patched.replace(FILE_URL_TO_PATH_IMPORT, PATH_TO_FILE_URL_IMPORT);
	}

	if (!patched.includes(PATH_TO_FILE_URL_IMPORT)) {
		return source;
	}

	if (!patched.includes(IMPORT_CALL)) {
		return source;
	}

	return patched.replace(IMPORT_CALL, PATCHED_IMPORT_CALL);
}
