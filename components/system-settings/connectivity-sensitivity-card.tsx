"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { motion, type Variants } from "motion/react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangleIcon } from "lucide-react";
import { SaveButton, useSaveFlash } from "@/components/ui/save-button";

import { usePingProfile } from "@/hooks/use-ping-profile";
import { useModemStatus } from "@/hooks/use-modem-status";
import { PING_PROFILES, type PingProfile } from "@/types/modem-status";

// ─── Animation variants ────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

// ─── Profile metadata (UI labels and per-preset blurbs) ────────────────────

const PROFILE_META: Record<
  PingProfile,
  { label: string; blurb: string; intervalLabel: string }
> = {
  sensitive: {
    label: "Sensitive",
    blurb:
      "Fastest UI feedback. Best for hardwired or strong-signal setups.",
    intervalLabel: "1s",
  },
  regular: {
    label: "Regular",
    blurb: "Balanced default. Good for most users.",
    intervalLabel: "2s",
  },
  relaxed: {
    label: "Relaxed",
    blurb: "Conservative. Matches the previous QManager default.",
    intervalLabel: "5s",
  },
  quiet: {
    label: "Quiet",
    blurb: "Battery and data conscious. Slowest reaction time.",
    intervalLabel: "10s",
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
  const runtime = modemStatus?.connectivity ?? null;

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
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* ── Segmented control ────────────────────────────────────── */}
          <motion.div variants={itemVariants}>
            <ToggleGroup
              type="single"
              value={selected ?? ""}
              onValueChange={(v) => {
                if (v && (PING_PROFILES as readonly string[]).includes(v)) {
                  setSelected(v as PingProfile);
                }
              }}
              className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1"
              aria-label="Connectivity sensitivity profile"
            >
              {PING_PROFILES.map((p) => (
                <ToggleGroupItem
                  key={p}
                  value={p}
                  className="data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-sm text-sm"
                  aria-label={`${PROFILE_META[p].label} (${PROFILE_META[p].intervalLabel} probe)`}
                >
                  {PROFILE_META[p].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </motion.div>

          {/* ── Active-profile meta panel ────────────────────────────── */}
          {activeMeta && (
            <motion.div
              variants={itemVariants}
              className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm"
            >
              <p className="text-foreground">
                <span className="font-semibold">{activeMeta.label}</span>
                <span className="text-muted-foreground"> — {activeMeta.blurb}</span>
              </p>
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
                <MetaPair label="Probe interval" value={formatSecs(runtime?.history_interval_sec)} />
                <MetaPair label="Fail threshold" value={formatSecs(runtime?.fail_secs)} />
                <MetaPair label="Recover after" value={formatSecs(runtime?.recover_secs)} />
              </div>
              {stuckHint && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Daemon hasn&apos;t picked up the change yet — check{" "}
                  <code className="font-mono text-[0.7rem]">systemctl status qmanager-ping</code>{" "}
                  if this persists.
                </p>
              )}
            </motion.div>
          )}

          {/* ── Save button ──────────────────────────────────────────── */}
          <motion.div variants={itemVariants} className="flex justify-end">
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

// ─── Sub-component ──────────────────────────────────────────────────────────

function MetaPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
