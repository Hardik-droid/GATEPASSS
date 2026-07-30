// Vercel entrypoint for the app-state API (organizer events, tickets, orders, ...).
//
// Previously this was served by a separately-deployed Node service that was
// never actually deployed, so `/api/state` 404'd in production, the frontend
// silently fell back to local-only mock data, and nothing an organizer created
// ever reached `public.events` — which is why the scanner reported
// "Event not found" for every newly created event. Serving it from this same
// Vercel deployment removes the separate-deploy step entirely.
import { createApp } from "../server/app";
import { PostgresAppStateStore } from "../server/store";

const store = new PostgresAppStateStore();
const app = createApp({ store });

export default app;
