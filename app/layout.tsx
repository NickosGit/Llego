import type { Metadata, Viewport } from "next";

import { SimBanner } from "@/components/SimBanner";

import "./globals.css";

export const metadata: Metadata = {
  title: "¿Llego? · Atizapán → El Rosario",
  description:
    "Qué tan confiable es el colectivo Atizapán → Metro El Rosario a la hora que sales. Datos simulados.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFD600",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SimBanner />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6">{children}</div>
      </body>
    </html>
  );
}
