/* Ingången för Cloudflare. wrangler.toml låter bara adresser under /api gå hit (run_worker_first), allt annat är statiska filer. */
import { hantera } from "./api.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) return hantera(request, env, ctx);
    return env.ASSETS.fetch(request);
  }
};
