/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.3.46"],
  // Proxy /api/* para o backend real, server-side. O browser nunca vê o
  // domínio do backend — só chamadas de mesma origem a /api/*.
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL ?? "http://localhost:3000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
