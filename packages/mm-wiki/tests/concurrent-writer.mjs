import { WikiStore } from "../src/store.ts";

const store = new WikiStore(process.env.MEMORY_TEST_ROOT);
await store.initialize();
const result = await store.write(
  "/topics/editor.md",
  Buffer.from(process.env.MEMORY_TEST_CONTENT, "base64").toString("utf8"),
  process.env.MEMORY_TEST_VERSION,
);
process.stdout.write(JSON.stringify(result));
