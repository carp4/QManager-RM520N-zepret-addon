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
          <CardTitle>Modem Subsystem</CardTitle>
          <CardDescription>
            Live modem firmware health and crash history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Separator />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-6 w-20" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-8" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-32" />
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
          <CardTitle>Modem Subsystem</CardTitle>
          <CardDescription>
            Live modem firmware health and crash history.
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

  // --- Data state ---
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Modem Subsystem</CardTitle>
        <CardDescription>
          Live modem firmware health and crash history.
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

          {/* ── Firmware ───────────────────────────────────────────── */}
          <Separator />
          <motion.div variants={itemVariants} className="flex items-center justify-between">
            <p className="font-semibold text-muted-foreground text-sm">Firmware</p>
            <span className="font-mono text-sm text-muted-foreground">
              {data?.firmware_name ?? "—"}
            </span>
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
