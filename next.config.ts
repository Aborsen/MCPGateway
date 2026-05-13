import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // oidc-provider holds internal state in a WeakMap keyed by the Provider
  // instance. If Next.js's bundler duplicates the module across route
  // chunks, each copy has its own WeakMap and `instance(provider)` returns
  // undefined from the wrong chunk — causing
  // "(0 , ig(...).dynamic[this.constructor.name]) is not a function"
  // at AccessToken.save -> generateTokenId. Marking it external forces
  // a single require() at runtime.
  serverExternalPackages: ["oidc-provider"],

  async redirects() {
    return [
      // Legacy /teams paths — moved to /workspaces in the MCP Gateway rebrand.
      { source: "/teams", destination: "/workspaces", permanent: true },
      { source: "/teams/:path*", destination: "/workspaces/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
