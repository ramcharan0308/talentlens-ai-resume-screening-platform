import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { SmoothScrollProvider } from "@/components/providers/smooth-scroll-provider";

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
  title: "TalentLens - AI Resume Screening & Staffing Operations Platform",
  description:
    "Enterprise AI resume screening, grounded evidence citation, candidate pipeline lifecycle, and multi-tenant client shortlist portal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen flex flex-col bg-background text-foreground`}
      >
        <SmoothScrollProvider>
          <Header />
          <main className="flex-1 flex flex-col">{children}</main>
          <footer className="border-t border-border/80 py-5 text-xs text-muted-foreground bg-card/60">
            <div className="container mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground/80">TalentLens</span>
                <span>•</span>
                <span>Enterprise Staffing & AI Screening Operations</span>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground/80">
                <span>SLA Target: 48h Turnaround</span>
                <span>•</span>
                <span>DPDP Compliance Enforced</span>
              </div>
            </div>
          </footer>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
