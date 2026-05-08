"use client";

import {
  CheckCircle2Icon,
  XCircleIcon,
  MinusCircleIcon,
  TriangleAlertIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { motion, type Variants } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { MetricBar } from "@/components/ui/metric-bar";
import { useModemSubsys } from "@/hooks/use-modem-subsys";
import type { ModemSubsysState } from "@/types/modem-subsys";

// ─── Animation variants ────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(epochSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - epochSec;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── State badge ────────────────────────────────────────────────────────────

function ModemStateBadge({ state }: { state: ModemSubsysState }) {
  switch (state) {
    case "online":
      return (
        <Badge
          variant="outline"
          className="bg-success/15 text-success hover:bg-success/20 border-success/30"
        >
          <CheckCircle2Icon className="size-3" />
          Online
        </Badge>
      );
    case "crashed":
      return (
        <Badge
          variant="outline"
          className="bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30"
        >
          <XCircleIcon className="size-3" />
          Crashed
        </Badge>
      );
    case "offline":
      return (
        <Badge
          variant="outline"
          className="bg-muted/50 text-muted-foreground border-muted-foreground/30"
        >
          <MinusCircleIcon className="size-3" />
          Offline
        </Badge>
      );
    case "unknown":
    default:
      return (
        <Badge
          variant="outline"
          className="bg-muted/50 text-muted-foreground border-muted-foreground/30"
        >
          <MinusCircleIcon className="size-3" />
          Unknown
        </Badge>
      );
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ModemSubsystemCard() {
  const { data, isLoading, error, refetch } = useModemSubsys();

  // --- Loading skeleton ---
  if (isLoading) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>
            Live modem firmware health and host system telemetry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {/* State */}
            <Separator />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-6 w-20" />
            </div>
            {/* Crashes since boot */}
            <Separator />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-8" />
            </div>
            {/* Last crashed */}
            <Separator />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-24" />
            </div>
            {/* CPU Load */}
            <Separator />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-12" />
              </div>
              <Skeleton className="h-1 w-full" />
            </div>
            {/* CPU Frequency */}
            <Separator />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-1 w-full" />
            </div>
            {/* Memory */}
            <Separator />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-1 w-full" />
            </div>
            {/* Storage */}
            <Separator />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-1 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Error state ---
  if (error && !data) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>
            Live modem firmware health and host system telemetry.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Alert variant="destructive">
            <AlertTriangleIcon className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={refetch} className="self-start">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // --- Derived metric values ---
  const cpuLoad = data?.cpu?.load_1m ?? null;
  const coreCount = data?.cpu?.core_count ?? null;
  const resolvedCoreCount = cpuLoad !== null ? (coreCount ?? 4) : null;

  const freqKhz = data?.cpu?.freq_khz ?? null;
  const maxFreqKhz = data?.cpu?.max_freq_khz ?? null;

  const memTotalKb = data?.memory?.total_kb ?? 0;
  const memUsedKb = data?.memory?.used_kb ?? 0;
  const showMemBar = data?.memory != null && memTotalKb > 0;

  const storageTotalKb = data?.storage?.total_kb ?? 0;
  const storageUsedKb = data?.storage?.used_kb ?? 0;
  const showStorageBar = data?.storage != null && storageTotalKb > 0;

  // --- Data state ---
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>System Health</CardTitle>
        <CardDescription>
          Live modem firmware health and host system telemetry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <motion.div
          className="grid gap-2"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* ── State ──────────────────────────────────────────────── */}
          <Separator />
          <motion.div variants={itemVariants} className="flex items-center justify-between">
            <p className="font-semibold text-muted-foreground text-sm">State</p>
            {data ? (
              <ModemStateBadge state={data.state} />
            ) : (
              <Badge
                variant="outline"
                className="bg-muted/50 text-muted-foreground border-muted-foreground/30"
              >
                <MinusCircleIcon className="size-3" />
                Unknown
              </Badge>
            )}
          </motion.div>

          {/* ── Crashes since boot ─────────────────────────────────── */}
          <Separator />
          <motion.div variants={itemVariants} className="flex items-center justify-between">
            <p className="font-semibold text-muted-foreground text-sm">
              Crashes since boot
            </p>
            <p className="text-sm font-medium tabular-nums">
              {data?.crash_count != null ? data.crash_count : "—"}
            </p>
          </motion.div>

          {/* ── Last crashed ───────────────────────────────────────── */}
          <Separator />
          <motion.div variants={itemVariants} className="flex items-center justify-between">
            <p className="font-semibold text-muted-foreground text-sm">
              Last crashed
            </p>
            <p className="text-sm text-muted-foreground">
              {data?.last_crash_at != null
                ? formatRelativeTime(data.last_crash_at)
                : "Never"}
            </p>
          </motion.div>

          {/* ── CPU Load ───────────────────────────────────────────── */}
          <Separator />
          <motion.div variants={itemVariants} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-muted-foreground text-sm">CPU Load</p>
              <p className="text-sm font-medium tabular-nums">
                {cpuLoad !== null ? cpuLoad.toFixed(2) : "—"}
              </p>
            </div>
            {cpuLoad !== null && resolvedCoreCount !== null && (
              <MetricBar
                value={cpuLoad}
                max={resolvedCoreCount}
                warnAt={resolvedCoreCount * 0.75}
                dangerAt={resolvedCoreCount * 1.0}
              />
            )}
          </motion.div>

          {/* ── CPU Frequency ──────────────────────────────────────── */}
          <Separator />
          <motion.div variants={itemVariants} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-muted-foreground text-sm">CPU Frequency</p>
              <p className="text-sm font-medium tabular-nums">
                {freqKhz !== null ? `${(freqKhz / 1_000_000).toFixed(1)} GHz` : "—"}
              </p>
            </div>
            {freqKhz !== null && maxFreqKhz !== null && (
              <MetricBar
                value={freqKhz}
                max={maxFreqKhz}
                warnAt={Infinity}
                dangerAt={Infinity}
                colorOverride="primary"
              />
            )}
          </motion.div>

          {/* ── Memory ─────────────────────────────────────────────── */}
          <Separator />
          <motion.div variants={itemVariants} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-muted-foreground text-sm">Memory</p>
              <p className="text-sm font-medium tabular-nums">
                {data?.memory != null
                  ? `${Math.round(memUsedKb / 1024)} MB (${Math.round((memUsedKb / memTotalKb) * 100)}%)`
                  : "—"}
              </p>
            </div>
            {showMemBar && (
              <MetricBar
                value={(memUsedKb / memTotalKb) * 100}
                max={100}
                warnAt={70}
                dangerAt={90}
              />
            )}
          </motion.div>

          {/* ── Storage ────────────────────────────────────────────── */}
          <Separator />
          <motion.div variants={itemVariants} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-muted-foreground text-sm">
                Storage
                <span className="text-xs text-muted-foreground ml-1">/usrdata</span>
              </p>
              <p className="text-sm font-medium tabular-nums">
                {data?.storage != null
                  ? `${Math.round(storageUsedKb / 1024)} / ${Math.round(storageTotalKb / 1024)} MB`
                  : "—"}
              </p>
            </div>
            {showStorageBar && (
              <MetricBar
                value={(storageUsedKb / storageTotalKb) * 100}
                max={100}
                warnAt={70}
                dangerAt={90}
              />
            )}
          </motion.div>

          {/* ── Coredump warning (rendered only when present) ──────── */}
          {data?.coredump_present && (
            <>
              <Separator />
              <motion.div variants={itemVariants} className="flex items-center justify-between">
                <p className="font-semibold text-muted-foreground text-sm">
                  Diagnostic data
                </p>
                <Badge
                  variant="outline"
                  className="bg-warning/15 text-warning hover:bg-warning/20 border-warning/30"
                >
                  <TriangleAlertIcon className="size-3" />
                  Coredump available
                </Badge>
              </motion.div>
            </>
          )}
        </motion.div>
      </CardContent>
    </Card>
  );
}
