import Image from "next/image";

export function SceneBanner({ image, eyebrow, title, description }: {
  image: "scouting-ground" | "agency-desk" | "investment-city" | "career-tunnel" | "headquarters";
  eyebrow: string;
  title: string;
  description: string;
}) {
  return <section className="scene-banner relative isolate overflow-hidden rounded-xl border border-line">
    <Image src={`/images/${image}.jpg`} alt="" fill priority sizes="(min-width: 1280px) 65vw, 100vw" className="object-cover" />
    <div className="absolute inset-0 bg-gradient-to-r from-[#0b1814]/95 via-[#0b1814]/75 to-[#0b1814]/10" />
    <div className="relative max-w-xl px-5 py-7 sm:px-7 sm:py-9">
      <p className="t-label text-[#dfcc99]">{eyebrow}</p>
      <h2 className="office-title mt-2 text-3xl text-[#fff6e4]">{title}</h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#ece8d9]">{description}</p>
    </div>
  </section>;
}
