import "./globals.css";

export const metadata = {
  title: "Performance Pulse",
  description: "A private 1:1 and performance conversation tool for an employee and their manager.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
