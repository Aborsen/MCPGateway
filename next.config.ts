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
};

export default nextConfig;
