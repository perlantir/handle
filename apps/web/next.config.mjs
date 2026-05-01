/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep middleware redirects relative to the incoming 127.0.0.1 dev origin.
  // Without this, Next dev normalizes middleware URLs through localhost and can
  // route same-app redirects through its proxy path.
  skipMiddlewareUrlNormalize: true,
  transpilePackages: ['@handle/shared', '@handle/design-tokens', '@handle/design-refs'],
};

export default nextConfig;
