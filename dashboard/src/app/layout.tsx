import type { Metadata } from "next";
import { inter } from "@/lib/fonts";
import "./globals.css";
import { Providers } from "./providers";
import { QueryProvider } from "@/providers/query-provider";

export const metadata: Metadata = {
  title: "Sambungin Dashboard",
  description: "Dashboard for the Sambungin router and provider pools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <QueryProvider>
          <Providers>{children}</Providers>
        </QueryProvider>
      </body>
    </html>
  );
}
