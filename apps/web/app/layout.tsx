import "@handle/design-tokens/tokens.css";
import type { Metadata } from "next";
import { HandleAuthProvider } from "@/lib/handleAuth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Handle",
  description: "Personal AI agent",
};

const webBaseUrl = (
  process.env.NEXT_PUBLIC_HANDLE_WEB_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/, "");
const signInUrl = `${webBaseUrl}/sign-in`;
const signUpUrl = `${webBaseUrl}/sign-up`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <HandleAuthProvider signInUrl={signInUrl} signUpUrl={signUpUrl}>
      <html lang="en">
        <body className="bg-bg-canvas font-sans text-text-primary antialiased">
          {children}
        </body>
      </html>
    </HandleAuthProvider>
  );
}
