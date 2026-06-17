import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://railroute-project.vercel.app"),
  title: {
    default: "RailRoute | Indian Railways Search",
    template: "%s | RailRoute",
  },
  description: "Search direct trains, split journeys, fares, PNR status, route details and coach layouts with clear source and freshness labels.",
  applicationName: "RailRoute",
  keywords: ["Indian Railways", "train search", "PNR status", "train fare", "seat availability", "train route"],
  openGraph: {
    title: "RailRoute | Indian Railways Search",
    description: "Search trains, split journeys, fares, PNR status, route details and coach layouts with clear source labels.",
    url: "https://railroute-project.vercel.app",
    siteName: "RailRoute",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RailRoute | Indian Railways Search",
    description: "Provider-backed train search, fares, PNR, route details and coach layouts.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-500">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
