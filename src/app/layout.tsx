import type { Metadata } from "next"

import { DemoGuide } from "@/components/DemoGuide"

import "./globals.css"

export const metadata: Metadata = {
  title: "Pull — from screenshots to signed-off looks",
  description:
    "Drop a folder of look screenshots. Pull crops them, reads the look numbers, builds the boards, sends your client one link — and turns their approvals into request emails and prepaid labels.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-eva-theme="pull">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <DemoGuide />
        {children}
      </body>
    </html>
  )
}
