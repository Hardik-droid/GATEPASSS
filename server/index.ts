import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { config } from "./config";
import { MemoryAppStateStore, PostgresAppStateStore } from "./store";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = path.join(rootDir, "dist");

let store;
try {
  store = new PostgresAppStateStore();
  await store.ensureReady();
} catch (error) {
  if (config.NODE_ENV === "production") {
    throw error;
  }
  console.warn("PostgreSQL is unavailable; using in-memory app state for this dev session.", error);
  store = new MemoryAppStateStore();
}

const app = createApp({ store, staticDir });
app.listen(config.PORT, () => {
  console.log(`GatePass backend listening on http://localhost:${config.PORT}`);
});
