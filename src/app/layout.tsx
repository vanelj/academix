import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Notificaciones } from "@/components/ui/notificaciones";
import { TooltipProvider } from "@/components/ui/tooltip";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Academix",
  description: "Academix: plataforma de oferta y gestión de cursos virtuales para instituciones educativas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // El script de tema añade la clase `dark` antes de hidratar.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          {/* Proveedor único de notificaciones (paneles y zona pública). */}
          <Notificaciones>{children}</Notificaciones>
        </TooltipProvider>
      </body>
    </html>
  );
}
