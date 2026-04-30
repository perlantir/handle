/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@handle/shared', '@handle/design-tokens', '@handle/design-refs'],
};

export default nextConfig;
