import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedLibrary — Lecture intelligence",
  description: "A private, searchable lecture library for medical school.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
