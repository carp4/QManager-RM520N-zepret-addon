"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { SaveButton, useSaveFlash } from "@/components/ui/save-button";

import { useQualityThresholds } from "@/hooks/use-quality-thresholds";
import { useModemStatus } from "@/hooks/use-modem-status";
import {
  QUALITY_PRESETS,
  type QualityPreset,
  type QualityThresholdsSettings,
} from "@/types/modem-status";

// ─── Animation variants ────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

// ─── Preset metadata ────────────────────────────────────────────────────────

interface PresetMeta {
  label: string;
  blurb: string;
  threshold: number;
  debounce: number;
}

const LATENCY_META: Record<QualityPreset, PresetMeta> = {
  standard: {
    label: "Standard",
    blurb: "Good cellular. Flags any sustained latency over 150 ms.",
    threshold: 150,
    debounce: 3,
  },
  tolerant: {
    label: "Tolerant",
    blurb: "Average cellular. Allows occasional spikes before flagging.",
    threshold: 250,
    debounce: 3,
  },
  "very-tolerant": {
    label: "Very Tolerant",
    blurb: "Poor signal areas. Only flags when latency stays high for a while.",
    threshold: 500,
    debounce: 2,
  },
};

const LOSS_META: Record<QualityPreset, PresetMeta> = {
  standard: {
    label: "Standard",
    blurb: "Tight quality bar. Flags loss above 15 %.",
    threshold: 15,
    debounce: 3,
  },
  tolerant: {
    label: "Tolerant",
    blurb: "Acceptable on cellular under load. Won't fire from short bursts.",
    threshold: 30,
    debounce: 3,
  },
  "very-tolerant": {
    label: "Very Tolerant",
    blurb: "Severe drops only — useful in poor signal areas.",
    threshold: 50,
    debounce: 2,
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return `${Math.round(ms)} ms`;
}

function formatLoss(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "—";
  return `${pct} %`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function QualityThresholdsCard() {
  const { thresholds, isDefault, isLoading, error, isSaving, saveError, save } =
    useQualityThresholds();
  const { data: modemStatus } = useModemStatus();
  const { saved, markSaved } = useSaveFlash();

  const [selected, setSelected] = useState<QualityThresholdsSettings | undefined>(
    thresholds,
  );

  useEffect(() => {
    if (thresholds && !selected) setSelected(thresholds);
  }, [thresholds, selected]);

  const isDirty = useMemo(() => {
    if (!thresholds || !selected) return false;
    return (
      selected.latency.preset !== thresholds.latency.preset ||
      selected.loss.preset !== thresholds.loss.preset
    );
  }, [thresholds, selected]);

  const canSave = isDirty && !isSaving;

  const handleSave = async () => {
    if (!canSave || !selected) return;
    try {
      await save(selected);
      markSaved();
      toast.success("Quality thresholds updated");
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
          <CardTitle>Latency &amp; Loss Thresholds</CardTitle>
          <CardDescription>
            When QManager flags slow latency or packet loss as a network event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
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
  if (error && !thresholds) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Latency &amp; Loss Thresholds</CardTitle>
          <CardDescription>
            When QManager flags slow latency or packet loss as a network event.
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

  if (!selected) return null;

  const latPreset = selected.latency.preset;
  const lossPreset = selected.loss.preset;
  const latMeta = LATENCY_META[latPreset];
  const lossMeta = LOSS_META[lossPreset];

  const liveLatency = modemStatus?.connectivity?.latency_ms ?? null;
  const liveLoss = modemStatus?.connectivity?.packet_loss_pct ?? null;

  const latencyOk =
    liveLatency === null || liveLatency <= latMeta.threshold;
  const lossOk = liveLoss === null || liveLoss < lossMeta.threshold;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Latency &amp; Loss Thresholds</CardTitle>
        <CardDescription>
          When QManager flags slow latency or packet loss as a network event.
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
          className="grid gap-5"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* ── Latency row ─────────────────────────────────────────── */}
          <motion.div variants={itemVariants} className="grid gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Latency</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                Current: <span className="font-semibold">{formatLatency(liveLatency)}</span>
              </span>
            </div>

            <ToggleGroup
              type="single"
              value={latPreset}
              onValueChange={(v) => {
                if (v && (QUALITY_PRESETS as readonly string[]).includes(v)) {
                  setSelected({
                    ...selected,
                    latency: { preset: v as QualityPreset },
                  });
                }
              }}
              className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
              aria-label="Latency threshold preset"
            >
              {QUALITY_PRESETS.map((p) => (
                <ToggleGroupItem
                  key={p}
                  value={p}
                  className="data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-sm text-sm"
                  aria-label={`${LATENCY_META[p].label} (${LATENCY_META[p].threshold} ms)`}
                >
                  {LATENCY_META[p].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
              <p className="text-foreground">
                <span className="font-semibold">{latMeta.label}</span>
                <span className="text-muted-foreground"> — {latMeta.blurb}</span>
              </p>
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
                <MetaPair label="Threshold" value={`${latMeta.threshold} ms`} />
                <MetaPair label="Debounce" value={`${latMeta.debounce} samples`} />
                <MetaPair
                  label="Current"
                  value={formatLatency(liveLatency)}
                  glyph={
                    liveLatency === null
                      ? null
                      : latencyOk
                        ? "ok"
                        : "warn"
                  }
                />
              </div>
            </div>
          </motion.div>

          <Separator />

          {/* ── Packet loss row ─────────────────────────────────────── */}
          <motion.div variants={itemVariants} className="grid gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Packet loss</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                Current: <span className="font-semibold">{formatLoss(liveLoss)}</span>
              </span>
            </div>

            <ToggleGroup
              type="single"
              value={lossPreset}
              onValueChange={(v) => {
                if (v && (QUALITY_PRESETS as readonly string[]).includes(v)) {
                  setSelected({
                    ...selected,
                    loss: { preset: v as QualityPreset },
                  });
                }
              }}
              className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
              aria-label="Packet loss threshold preset"
            >
              {QUALITY_PRESETS.map((p) => (
                <ToggleGroupItem
                  key={p}
                  value={p}
                  className="data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-sm text-sm"
                  aria-label={`${LOSS_META[p].label} (${LOSS_META[p].threshold} percent)`}
                >
                  {LOSS_META[p].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
              <p className="text-foreground">
                <span className="font-semibold">{lossMeta.label}</span>
                <span className="text-muted-foreground"> — {lossMeta.blurb}</span>
              </p>
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
                <MetaPair label="Threshold" value={`${lossMeta.threshold} %`} />
                <MetaPair label="Debounce" value={`${lossMeta.debounce} samples`} />
                <MetaPair
                  label="Current"
                  value={formatLoss(liveLoss)}
                  glyph={liveLoss === null ? null : lossOk ? "ok" : "warn"}
                />
              </div>
            </div>
          </motion.div>

          {isDefault && (
            <motion.p
              variants={itemVariants}
              className="text-xs text-muted-foreground"
            >
              Default after recent update — pick Standard for stricter thresholds.
            </motion.p>
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

function MetaPair({
  label,
  value,
  glyph = null,
}: {
  label: string;
  value: string;
  glyph?: "ok" | "warn" | null;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums flex items-center gap-1.5">
        {value}
        {glyph === "ok" && <span className="text-success">●</span>}
        {glyph === "warn" && (
          <span className="text-warning animate-pulse">⚠</span>
        )}
      </span>
    </div>
  );
}
