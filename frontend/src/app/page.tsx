import Nav from "@/components/landing/Nav";
import StoryStage from "@/components/landing/StoryStage";
import AttendanceSection from "@/components/landing/AttendanceSection";
import CryptoSection from "@/components/landing/CryptoSection";
import SpeedSection from "@/components/landing/SpeedSection";
import CtaSection from "@/components/landing/CtaSection";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="relative overflow-x-clip bg-white">
      <Nav />
      <StoryStage />
      <AttendanceSection />
      <CryptoSection />
      <SpeedSection />
      <CtaSection />
      <Footer />
    </main>
  );
}
