"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2Icon,
  PlayIcon,
  DownloadIcon,
  CheckCircle2Icon,
  XCircleIcon,
  TriangleAlertIcon,
  MinusCircleIcon,
} from "lucide-react";
import type { HealthCheckJob } from "@/types/system-health-check";

interface SummaryCardProps {
  job: HealthCheckJob | null;
  isRunning: boolean;
  isStarting: boolean;
  onRun: () => void;
  onDownload: () => void;
}

function formatRelative(epochSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - epochSec;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function SummaryCard({
  job,
  isRunning,
  isStarting,
  onRun,
  onDownload,
}: SummaryCardProps) {
  const hasRun = !!job;
  const summary = job?.summary;
  const canDownload = !!job && job.status === "complete" && !!job.tarball_path;

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Health Check</CardTitle>
        <CardDescription>
          Run a full diagnostic of binaries, permissions, AT transport, services, and configuration. Download the bundle to share with support.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {hasRun && summary ? (
              <>
                <Badge variant="outline" className="bg-success/15 text-success hover:bg-success/20 border-success/30">
                  <CheckCircle2Icon className="size-3" />
                  {summary.pass} pass
                </Badge>
                <Badge variant="outline" className="bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30">
                  <XCircleIcon className="size-3" />
                  {summary.fail} fail
                </Badge>
                <Badge variant="outline" className="bg-warning/15 text-warning hover:bg-warning/20 border-warning/30">
                  <TriangleAlertIcon className="size-3" />
                  {summary.warn} warn
                </Badge>
                <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted-foreground/30">
                  <MinusCircleIcon className="size-3" />
                  {summary.skip} skip
                </Badge>
                {job?.started_at && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {isRunning ? "Started " : "Last run "} {formatRelative(job.started_at)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">No diagnostics run yet.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onRun} disabled={isRunning || isStarting}>
              {isRunning || isStarting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <PlayIcon className="size-4" />
                  Run Diagnostics
                </>
              )}
            </Button>
            {canDownload && (
              <Button onClick={onDownload} variant="outline">
                <DownloadIcon className="size-4" />
                Download Bundle
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
