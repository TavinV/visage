// Mesma política de segurança que o backend já envia via helmet() — o
// Next.js não usa helmet (é middleware de Express, não se aplica ao App
// Router), então os cabeçalhos precisam ser replicados aqui via headers().
// Sem isso a página de login/painel podia ser embutida num <iframe> de
// terceiros (clickjacking) e não havia segunda camada de defesa contra XSS.
const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=15552000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    // O totem captura frames de câmera (getUserMedia, sem tag <script> extra)
    // e chama só a própria origem (proxy /api/*) — connect-src/img-src 'self'
    // cobre isso. unsafe-inline em style-src porque o Next injeta estilo
    // inline para CSS-in-JS/critical CSS. 'unsafe-eval' só em dev: o HMR do
    // Next (webpack eval-source-map) executa string como JS — o build de
    // produção não usa eval, então fica de fora do bundle publicado.
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      `connect-src 'self'${isDev ? " ws:" : ""}`,
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.3.46"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
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
