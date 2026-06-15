import "./globals.css"

export const metadata = { title: "FM Flow" }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
