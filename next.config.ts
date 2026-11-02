import type { NextConfig } from "next";

// Runs as a Node server (`next start`, or the standalone bundle in .next/standalone).
// The catalog is read from Postgres on the server; the estimator runs in the browser.
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
};

export default nextConfig;
