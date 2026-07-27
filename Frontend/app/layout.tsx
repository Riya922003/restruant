import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { PostHogIdentifyUser, PostHogPageView, PostHogProvider } from "@/components/analytics/posthog-provider";
import { ToastProvider } from "@/components/ui/toast";
import { AppDialogProvider } from "@/components/ui/app-dialog";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RestaurantOS",
  description: "AI powered restaurant management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PostHogProvider>
          <ToastProvider>
            <AppDialogProvider>
              <AuthProvider>
              <PostHogPageView />
              <PostHogIdentifyUser />
              {children}
            </AuthProvider>
            </AppDialogProvider>
          </ToastProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
