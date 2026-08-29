"use client";

import dynamic from "next/dynamic";

const ScrollShowcase = dynamic(() => import("./ScrollShowcase"), {
  ssr: false,
  loading: () => <div data-scroll-showcase className="h-screen bg-[#050507] md:h-[340vh]" />,
});

export default function ScrollShowcaseLoader() {
  return <ScrollShowcase />;
}
