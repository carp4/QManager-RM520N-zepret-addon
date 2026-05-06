"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import type {
  DiscordBotSettings,
  DiscordBotStatus,
  DiscordBotSavePayload,
} from "@/types/discord-bot";

const CGI_CONFIGURE = "/cgi-bin/quecmanager/monitoring/discord_bot/configure.sh";
const CGI_STATUS = "/cgi-bin/quecmanager/monitoring/discord_bot/status.sh";
const CGI_TEST = "/cgi-bin/quecmanager/monitoring/discord_bot/test.sh";

export interface UseDiscordBotReturn {
  settings: DiscordBotSettings | null;
  status: DiscordBotStatus | null;
  isLoading: boolean;
  isSaving: boolean;
  isSendingTest: boolean;
  error: string | null;
  saveSettings: (payload: DiscordBotSavePayload) => Promise<boolean>;
  sendTestDm: () => Promise<boolean>;
  enable: () => Promise<boolean>;
  disable: () => Promise<boolean>;
  refresh: () => void;
}

export function useDiscordBot(): UseDiscordBotReturn {
  const [settings, setSettings] = useState<DiscordBotSettings | null>(null);
  const [status, setStatus] = useState<DiscordBotStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const [confResp, statResp] = await Promise.all([
        authFetch(CGI_CONFIGURE),
        authFetch(CGI_STATUS),
      ]);
      if (!confResp.ok || !statResp.ok) throw new Error("Fetch failed");
      const [conf, stat] = await Promise.all([confResp.json(), statResp.json()]);
      if (!mountedRef.current) return;
      if (conf.success) setSettings(conf.settings);
      if (stat.success) setStatus(stat);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch Discord bot settings");
    } finally {
      if (mountedRef.current && !silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveSettings = useCallback(async (payload: DiscordBotSavePayload): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    try {
      const resp = await authFetch(CGI_CONFIGURE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!mountedRef.current) return false;
      if (!json.success) { setError(json.error ?? "Failed to save"); return false; }
      await fetchAll(true);
      return true;
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : "Failed to save");
      return false;
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }, [fetchAll]);

  const sendTestDm = useCallback(async (): Promise<boolean> => {
    setIsSendingTest(true);
    try {
      const resp = await authFetch(CGI_TEST, { method: "POST" });
      const json = await resp.json();
      return json.success;
    } catch { return false; }
    finally { if (mountedRef.current) setIsSendingTest(false); }
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    const resp = await authFetch(CGI_CONFIGURE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enable" }),
    });
    const json = await resp.json();
    if (json.success) await fetchAll(true);
    return json.success;
  }, [fetchAll]);

  const disable = useCallback(async (): Promise<boolean> => {
    const resp = await authFetch(CGI_CONFIGURE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable" }),
    });
    const json = await resp.json();
    if (json.success) await fetchAll(true);
    return json.success;
  }, [fetchAll]);

  return { settings, status, isLoading, isSaving, isSendingTest, error,
           saveSettings, sendTestDm, enable, disable, refresh: fetchAll };
}
