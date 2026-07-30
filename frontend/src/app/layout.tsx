import type { Metadata } from "next";
import { Poppins, JetBrains_Mono, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

// IBM Plex Mono — fonte de dados do design system Flauzino, usada apenas
// na aplicação autenticada (font-mono-ds). O --font-mono da landing não muda.
const monoDs = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-ds",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://visage.app"),
  title: "Visage — A primeira chamada com reconhecimento facial do Brasil",
  description:
    "A Visage identifica automaticamente quem está presente em sala utilizando reconhecimento facial, registrando a frequência em segundos. Detecção de fraude, criptografia em nível militar e conformidade total com a LGPD.",
  keywords: [
    "chamada escolar",
    "reconhecimento facial",
    "frequência escolar",
    "presença automática",
    "LGPD",
    "antifraude",
  ],
  openGraph: {
    title: "Visage — A primeira chamada com reconhecimento facial do Brasil",
    description:
      "Reconhecimento facial para chamada escolar automática. Presença registrada em segundos, com detecção de fraude e criptografia em nível militar.",
    type: "website",
    locale: "pt_BR",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} ${mono.variable} ${monoDs.variable}`}>
      <body className="bg-white font-sans antialiased">{children}</body>
    </html>
  );
}
