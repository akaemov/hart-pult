import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Пульт HartDevelopment",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
