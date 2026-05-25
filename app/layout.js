import "./globals.css";

export const metadata = {
  title: "Properside AI",
  description: "Properside AI Chat App"
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
