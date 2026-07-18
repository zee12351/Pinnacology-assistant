import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://pinnovix.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Pinnovix — AI research workspace",
  description: "Discover literature, draft and cite papers, and turn research into publication-ready visuals — powered by AI and grounded in real sources.",
  applicationName: "Pinnovix",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Pinnovix",
    title: "Pinnovix — AI research workspace",
    description: "Research, write, and visualize — all in one AI workspace for scientists.",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Pinnovix" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pinnovix — AI research workspace",
    description: "Research, write, and visualize — all in one AI workspace for scientists.",
    images: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen selection:bg-blue-500/30">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
