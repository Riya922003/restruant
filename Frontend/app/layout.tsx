import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { PostHogIdentifyUser, PostHogPageView, PostHogProvider } from "@/components/analytics/posthog-provider";
import { ToastProvider } from "@/components/ui/toast";
import { AppDialogProvider } from "@/components/ui/app-dialog";
import { ThemeProvider } from "@/components/theme/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


const themeInitScript = `
(function () {
  try {
    var theme = localStorage.getItem("restaurantos-theme") || "system";
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  } catch (_) {}
})();
`;

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
      suppressHydrationWarning
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <PostHogProvider>
          <ThemeProvider>
            <ToastProvider>
            <AppDialogProvider>
              <AuthProvider>
              <PostHogPageView />
              <PostHogIdentifyUser />
              {children}
            </AuthProvider>
            </AppDialogProvider>
          </ToastProvider>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
