import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Totem — Visage",
  description: "Totem de registro de presença por reconhecimento facial.",
};

// Tablet fixado na parede: sem zoom por gesto, UI estável
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function TotemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
