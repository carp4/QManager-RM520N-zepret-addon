"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import type { PingProfile } from "@/types/modem-status";

// =============================================================================
// usePingProfile — Fetch & Save Hook for Connectivity Sensitivity
// =============================================================================
// Backend: GET/POST /cgi-bin/quecmanager/settings/ping_profile.sh
//
// GET returns { success: true, settings: { profile: PingProfile } }.
// POST { action: "save_settings", profile: PingProfile } writes the file
// and pokes /tmp/qmanager_ping_reload; daemon picks up the change on its
// next probe cycle (1-10s depending on the previous profile's interval).
// =============================================================================

const ENDPOINT = "/cgi-bin/quecmanager/settings/ping_profile.sh";

interface PingProfileSettings {
  profile: PingProfile;
}

interface PingProfileResponse {
  success: boolean;
  settings?: PingProfileSettings;
  error?: string;
  detail?: string;
}

export interface UsePingProfileReturn {
  profile: PingProfile | undefined;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  saveError: string | null;
  save: (profile: PingProfile) => Promise<PingProfileResponse>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePingProfile(): UsePingProfileReturn {
  const [profile, setProfile] = useState<PingProfile | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch current profile
  // ---------------------------------------------------------------------------
  const fetchProfile = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const resp = await authFetch(ENDPOINT);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json: PingProfileResponse = await resp.json();
      if (!mountedRef.current) return;

      if (!json.success || !json.settings) {
        throw new Error(
          json.detail ?? json.error ?? "Failed to load profile",
        );
      }

      setProfile(json.settings.profile);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err instanceof Error ? err.message : "Failed to load profile",
      );
    } finally {
      if (mountedRef.current && !silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ---------------------------------------------------------------------------
  // Save profile
  // ---------------------------------------------------------------------------
  const save = useCallback(
    async (newProfile: PingProfile): Promise<PingProfileResponse> => {
      setSaveError(null);
      setIsSaving(true);

      try {
        const resp = await authFetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_settings", profile: newProfile }),
        });

        const json: PingProfileResponse = await resp.json();
        if (!mountedRef.current) return json;

        if (!json.success) {
          throw new Error(
            json.detail ?? json.error ?? "Save failed",
          );
        }

        // Optimistically update local state; also trigger a silent re-fetch
        // so the component reflects the persisted value.
        setProfile(newProfile);
        fetchProfile(true);

        return json;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Save failed";
        if (mountedRef.current) setSaveError(msg);
        throw err;
      } finally {
        if (mountedRef.current) setIsSaving(false);
      }
    },
    [fetchProfile],
  );

  return {
    profile,
    isLoading,
    error,
    isSaving,
    saveError,
    save,
  };
}
