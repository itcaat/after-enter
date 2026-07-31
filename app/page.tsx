import type { Metadata } from "next";
import { LocalizedShell } from "./localized-shell";

export const metadata: Metadata = {
  title: "What happens after you press Enter?",
  description: "An interactive simulation of a web request, from the URL to a rendered page.",
};

export default function Home() {
  return <LocalizedShell />;
}
