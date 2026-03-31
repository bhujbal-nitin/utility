const { createProxyMiddleware } = require("http-proxy-middleware");

const targetFor = (envVar, fallback) => process.env[envVar] || fallback;

module.exports = function setupProxy(app) {
  // Auth service
  app.use(
    "/api/auth",
    createProxyMiddleware({
      target: targetFor("REACT_APP_AUTH_PROXY_TARGET", "http://localhost:8000"),
      changeOrigin: true,
    })
  );

  // Admin service (part of Auth)
  app.use(
    "/api/admin",
    createProxyMiddleware({
      target: targetFor("REACT_APP_AUTH_PROXY_TARGET", "http://localhost:8000"),
      changeOrigin: true,
    })
  );

  // BRD Studio service
  app.use(
    "/api/brd",
    createProxyMiddleware({
      target: targetFor("REACT_APP_BRD_PROXY_TARGET", "http://localhost:8001"),
      changeOrigin: true,
    })
  );

  // Automation service
  app.use(
    "/api/automation",
    createProxyMiddleware({
      target: targetFor("REACT_APP_AUTOMATION_PROXY_TARGET", "http://localhost:8003"),
      changeOrigin: true,
    })
  );

  // Proposal service
  app.use(
    "/api/proposal",
    createProxyMiddleware({
      target: targetFor("REACT_APP_PROPOSAL_PROXY_TARGET", "http://localhost:8002"),
      changeOrigin: true,
    })
  );

  // Migration service
  app.use(
    "/api/migration",
    createProxyMiddleware({
      target: targetFor("REACT_APP_MIGRATION_PROXY_TARGET", "http://localhost:8004"),
      changeOrigin: true,
    })
  );
};
