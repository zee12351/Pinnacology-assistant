import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Research & Academic Writing Assistant",
  description: "A production-ready platform for research and academic writing.",
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
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
