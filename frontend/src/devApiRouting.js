import axios from "axios";

const isDev = process.env.NODE_ENV === "development";

const ROUTES = [
  { prefix: "/api/auth", target: process.env.REACT_APP_AUTH_PROXY_TARGET || "http://localhost:8000" },
  { prefix: "/api/brd", target: process.env.REACT_APP_BRD_PROXY_TARGET || "http://localhost:8001" },
  { prefix: "/api/proposal", target: process.env.REACT_APP_PROPOSAL_PROXY_TARGET || "http://localhost:8002" },
  { prefix: "/api/automation", target: process.env.REACT_APP_AUTOMATION_PROXY_TARGET || "http://localhost:8003" },
  { prefix: "/api/migration", target: process.env.REACT_APP_MIGRATION_PROXY_TARGET || "http://localhost:8004" },
  { prefix: "/api/admin", target: process.env.REACT_APP_AUTH_PROXY_TARGET || "http://localhost:8000" },
];

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(url);
}

function rewriteUrl(url) {
  if (!isDev || !url || isAbsoluteUrl(url)) return url;
  const match = ROUTES.find((r) => url.startsWith(r.prefix));
  return match ? `${match.target}${url}` : url;
}

export function installDevApiRouting() {
  if (!isDev) return;
  if (window.__EDGE_DEV_API_ROUTING_INSTALLED__) return;
  window.__EDGE_DEV_API_ROUTING_INSTALLED__ = true;

  // Patch window.fetch so relative /api/* requests resolve to backend service ports in dev.
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string") {
      return originalFetch(rewriteUrl(input), init);
    }
    if (input instanceof Request) {
      const rewritten = rewriteUrl(input.url);
      if (rewritten !== input.url) {
        return originalFetch(new Request(rewritten, input), init);
      }
    }
    return originalFetch(input, init);
  };

  // Patch axios requests globally.
  axios.interceptors.request.use((config) => {
    if (typeof config.url === "string") {
      config.url = rewriteUrl(config.url);
    }
    return config;
  });
}
