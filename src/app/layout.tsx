import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Jobless Joe — The Crooner Song Engine",
  description:
    "A comedy-driven crooner song generator for Jobless Joe's Bootcamp. Every Facebook ad is another chapter in Joe's unlikely AI transformation.",
  keywords: [
    "Jobless Joe",
    "AI song generator",
    "crooner comedy",
    "Facebook ad creative",
    "Jobless Joe's Bootcamp",
  ],
  authors: [{ name: "Jobless Joe's Bootcamp" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Jobless Joe — The Crooner Song Engine",
    description:
      "Comedy-driven crooner songs for Jobless Joe's Bootcamp. Each episode another chapter in Joe's AI adventure.",
    siteName: "Jobless Joe's Bootcamp",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jobless Joe — The Crooner Song Engine",
    description:
      "Comedy-driven crooner songs for Jobless Joe's Bootcamp. Each episode another chapter in Joe's AI adventure.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
