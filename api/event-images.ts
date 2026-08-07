import { createApp } from "../server/app.js";
import { PostgresAppStateStore } from "../server/store.js";

export default createApp({ store: new PostgresAppStateStore() });
