// Vercel entrypoint for dedicated /api/event-images REST API.
import { createApp } from "../server/app.js";
import { PostgresAppStateStore } from "../server/store.js";

const store = new PostgresAppStateStore();
const app = createApp({ store });

export default app;
