import "./globals.css";

export const metadata = {
  title: "Properside AI Workspace - AI Chat, Temp Email, Stream Anime Tools",
  description:
    "Properside AI Workspace adalah kumpulan tools cerdas seperti AI Chat, Temp Email, Stream Anime, dan utilitas lainnya dalam satu dashboard modern.",
  keywords: [
    "Properside AI",
    "AI Workspace",
    "AI Chat",
    "Temp Email",
    "Stream Anime",
    "Tools AI",
    "AI Indonesia"
  ],
  authors: [{ name: "Properside AI" }],
  creator: "Properside AI",
  publisher: "Properside AI",
  metadataBase: new URL("https://properside-ai.pages.dev"),
  openGraph: {
    title: "Properside AI Workspace",
    description:
      "Workspace modern berisi AI Chat, Temp Email, Stream Anime, dan tools cerdas lainnya.",
    url: "https://properside-ai.pages.dev",
    siteName: "Properside AI",
    type: "website",
    locale: "id_ID"
  },
  twitter: {
    card: "summary_large_image",
    title: "Properside AI Workspace",
    description:
      "AI Chat, Temp Email, Stream Anime, dan tools cerdas dalam satu workspace."
  },
  robots: {
    index: true,
    follow: true
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
