"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import { useAuth } from "@/lib/auth-context";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let initialized = false;

function ensurePostHog() {
  if (!POSTHOG_KEY || typeof window === "undefined") return false;
  if (initialized) return true;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    person_profiles: "identified_only",
  });
  initialized = true;
  return true;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensurePostHog();
  }, []);

  if (!POSTHOG_KEY) return <>{children}</>;
  return <Provider client={posthog}>{children}</Provider>;
}

export function PostHogPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ensurePostHog()) return;
    posthog.capture("$pageview", {
      $current_url: window.location.href,
    });
  }, [pathname]);

  return null;
}

export function PostHogIdentifyUser() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!ensurePostHog() || loading) return;

    if (!user) {
      posthog.reset();
      return;
    }

    posthog.identify(String(user.id), {
      email: user.email,
      name: user.full_name,
      role: user.role,
    });
  }, [user, loading]);

  return null;
}
