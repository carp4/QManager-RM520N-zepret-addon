"use client";

/**
 * Auth gate — redirects to login if the indicator cookie is missing.
 * Sync check, no API call, no loading state.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  if (typeof document !== "undefined" && !document.cookie.includes("qm_logged_in=1")) {
    window.location.href = "/login/";
    return null;
  }
  return <>{children}</>;
}
