"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangleIcon } from "lucide-react";
import { TbAlertTriangleFilled } from "react-icons/tb";
import { SaveButton, useSaveFlash } from "@/components/ui/save-button";
import { MetaPanel, MetaPair } from "@/components/ui/meta-panel";

import { usePingProfile } from "@/hooks/use-ping-profile";
import { useModemStatus } from "@/hooks/use-modem-status";
import { PING_PROFILES, type PingProfile } from "@/types/modem-status";
import { staggerContainer, staggerItem } from "@/lib/motion-presets";

// ─── Profile metadata (UI labels and per-preset blurbs) ────────────────────

// Mirrors ping-daemon/src/config.rs::ProfileConfig::for_profile.
// Keep these in sync — the daemon is the source of truth, this table is
// purely for previewing values in the UI before the user saves.
const PROFILE_META: Record<
  PingProfile,
  {
    label: string;
    blurb: string;
    intervalSec: number;
    failSecs: number;
    recoverSecs: number;
  }
> = {
  sensitive: {
    label: "Sensitive",
    blurb:
      "Fastest UI feedback. Best for hardwired or strong-signal setups.",
    intervalSec: 1,
    failSecs: 6,
    recoverSecs: 3,
  },
  regular: {
    label: "Regular",
    blurb: "Balanced default. Good for most users.",
    intervalSec: 2,
    failSecs: 10,
    recoverSecs: 6,
  },
  relaxed: {
    label: "Relaxed",
    blurb: "Conservative. Matches the previous QManager default.",
    intervalSec: 5,
    failSecs: 15,
    recoverSecs: 10,
  },
  quiet: {
    label: "Quiet",
    blurb: "Battery and data conscious. Slowest reaction time.",
    intervalSec: 10,
    failSecs: 30,
    recoverSecs: 20,
  },
};

// 30 seconds — how long after a save we wait before showing the
// "daemon hasn't picked up the change yet" footnote.
const STUCK_THRESHOLD_MS = 30_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSecs(value: number | null | undefined): string {
  if (value === undefined || value === null || value === 0) return "—";
  return `${value}s`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ConnectivitySensitivityCard() {
  const { profile, isLoading, error, isSaving, saveError, save } =
    usePingProfile();
  const { data: modemStatus } = useModemStatus();
  const { saved, markSaved } = useSaveFlash();

  // Local selection state — initialized from saved profile, syncs on remount
  const [selected, setSelected] = useState<PingProfile | undefined>(profile);
  const initializedRef = useRef(false);

  // When the saved profile arrives, sync local state once.
  useEffect(() => {
    if (profile !== undefined && !initializedRef.current) {
      setSelected(profile);
      initializedRef.current = true;
    }
  }, [profile]);

  // After a successful save, sync local selection to whatever was just saved
  // (prevents stale dirty state if user clicks a profile twice)
  const lastSavedAtRef = useRef<number | null>(null);
  const lastSavedProfileRef = useRef<PingProfile | null>(null);

  // Dirty detection
  const isDirty = useMemo(() => {
    if (!profile || !selected) return false;
    return selected !== profile;
  }, [profile, selected]);

  const canSave = isDirty && !isSaving;

  // Daemon-stuck detection: after a save, if the daemon's runtime profile
  // doesn't match within STUCK_THRESHOLD_MS, surface a footnote.
  const [stuckHint, setStuckHint] = useState(false);
  const [saveCount, setSaveCount] = useState(0);
  useEffect(() => {
    if (lastSavedAtRef.current === null) return;
    const interval = setInterval(() => {
      if (lastSavedAtRef.current === null) return;
      const elapsed = Date.now() - lastSavedAtRef.current;
      if (elapsed < STUCK_THRESHOLD_MS) return;
      const runtime = modemStatus?.connectivity?.profile;
      const target = lastSavedProfileRef.current;
      if (runtime && target && runtime !== target) {
        setStuckHint(true);
      } else {
        setStuckHint(false);
        lastSavedAtRef.current = null;
        lastSavedProfileRef.current = null;
      }
    }, 2_000);
    return () => clearInterval(interval);
  }, [saveCount, modemStatus?.connectivity?.profile]);

  // Save handler
  const handleSave = async () => {
    if (!canSave || !selected) return;
    try {
      await save(selected);
      markSaved();
      lastSavedAtRef.current = Date.now();
      lastSavedProfileRef.current = selected;
      setStuckHint(false);
      setSaveCount((c) => c + 1);
      toast.success("Sensitivity profile updated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      toast.error(msg);
    }
  };

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Connectivity Sensitivity</CardTitle>
          <CardDescription>
            How aggressively the modem checks if your internet is working.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
            <div className="flex justify-end">
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error variant ──────────────────────────────────────────────────────
  if (error && !profile) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Connectivity Sensitivity</CardTitle>
          <CardDescription>
            How aggressively the modem checks if your internet is working.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangleIcon className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const activeMeta = selected ? PROFILE_META[selected] : null;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Connectivity Sensitivity</CardTitle>
        <CardDescription>
          How aggressively the modem checks if your internet is working.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {saveError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangleIcon className="size-4" />
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        <motion.div
          className="grid gap-3"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {/* ── Segmented control ────────────────────────────────────── */}
          <motion.div variants={staggerItem}>
            <Tabs
              value={selected ?? ""}
              onValueChange={(v) => {
                if (v && (PING_PROFILES as readonly string[]).includes(v)) {
                  setSelected(v as PingProfile);
                }
              }}
            >
              <TabsList
                className="grid w-full grid-cols-4"
                aria-label="Connectivity sensitivity profile"
              >
                {PING_PROFILES.map((p) => (
                  <TabsTrigger
                    key={p}
                    value={p}
                    aria-label={`${PROFILE_META[p].label} (${PROFILE_META[p].intervalSec}s probe)`}
                  >
                    {PROFILE_META[p].label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </motion.div>

          {/* ── Active-profile meta panel ────────────────────────────── */}
          {activeMeta && (
            <motion.div variants={staggerItem}>
              <MetaPanel title={activeMeta.label} blurb={activeMeta.blurb}>
                <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
                  <MetaPair label="Probe interval" value={formatSecs(activeMeta.intervalSec)} />
                  <MetaPair label="Fail threshold" value={formatSecs(activeMeta.failSecs)} />
                  <MetaPair label="Recover after" value={formatSecs(activeMeta.recoverSecs)} />
                </div>
              </MetaPanel>
            </motion.div>
          )}

          {/* ── Daemon-stuck warning banner ──────────────────────────── */}
          {stuckHint && (
            <motion.div variants={staggerItem}>
              <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/30 text-warning text-sm">
                <TbAlertTriangleFilled className="size-5 mt-0.5 shrink-0" />
                <p className="font-semibold">
                  Settings saved, but the probe is still on the old preset. Try
                  refreshing in a moment; if this persists, restart the
                  qmanager-ping service.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Save button ──────────────────────────────────────────── */}
          <motion.div variants={staggerItem} className="flex justify-end">
            <SaveButton
              onClick={handleSave}
              isSaving={isSaving}
              saved={saved}
              disabled={!canSave}
            />
          </motion.div>
        </motion.div>
      </CardContent>
    </Card>
  );
}

