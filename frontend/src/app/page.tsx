import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import SystemShowcase from "@/components/landing/SystemShowcase";
import AntifraudSection from "@/components/landing/AntifraudSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import CryptoSection from "@/components/landing/CryptoSection";
import SpeedSection from "@/components/landing/SpeedSection";
import PlansSection from "@/components/landing/PlansSection";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="relative overflow-x-clip bg-white">
      <Nav />
      <Hero />
      <SystemShowcase />
      <AntifraudSection />
      <FeaturesSection />
      <CryptoSection />
      <SpeedSection />
      <PlansSection />
      <Footer />
    </main>
  );
}
