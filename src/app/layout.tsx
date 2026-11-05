import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Header } from "@/components/layout/header";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "TalentLens - AI Resume Screening & Client Shortlist Portal",
  description:
    "Enterprise AI resume screening, grounded evidence citation, and multi-tenant client shortlist portal for staffing firms.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-background text-foreground`}>
        <Header />
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6 text-center text-xs text-muted-foreground bg-card/40">
          <div className="container flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>© 2026 TalentLens. Built for Company A (Noida) Staffing Operations.</span>
            <span>Milestone 1 — Core Foundation & Schema</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
