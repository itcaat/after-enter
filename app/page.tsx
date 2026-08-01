import type { Metadata } from "next";
import { LocalizedShell } from "./localized-shell";

export const metadata: Metadata = {
  title: "What happens after you press Enter in the browser?",
  description: "An interactive simulation of the full web request path: OS, DNS, network, edge, backend, HTTP, and rendering.",
};

export default function Home() {
  return <LocalizedShell />;
}
