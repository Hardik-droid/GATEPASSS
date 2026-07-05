import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { config } from "./config";
import { PostgresAppStateStore } from "./store";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = path.join(rootDir, "dist");

const store = new PostgresAppStateStore();
await store.ensureReady();

const app = createApp({ store, staticDir });
app.listen(config.PORT, () => {
  console.log(`GatePass backend listening on http://localhost:${config.PORT}`);
});

