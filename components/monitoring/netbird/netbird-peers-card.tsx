"use client";

import { motion } from "motion/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MotionTableRow = motion.create(TableRow);

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UsersIcon, AlertCircle, CheckCircle2Icon, MinusCircleIcon } from "lucide-react";
import type { NetBirdStatus, NetBirdPeer } from "@/hooks/use-netbird";

// =============================================================================
// NetBirdPeersCard — Peer list table for NetBird network
// =============================================================================

interface NetBirdPeersCardProps {
  status: NetBirdStatus | null;
  isLoading: boolean;
  error?: string | null;
}

function formatLastSeen(lastSeen: string, connected: boolean): string {
  if (connected) return "Now";
  if (!lastSeen || lastSeen === "-") return "Unknown";
  // NetBird returns relative strings like "2 minutes ago" or timestamps
  return lastSeen;
}

export function NetBirdPeersCard({
  status,
  isLoading,
  error,
}: NetBirdPeersCardProps) {
  const isConnected = status?.backend_state === "Connected";
  const peers: NetBirdPeer[] = (isConnected && status?.peers) || [];

  // --- Loading skeleton ------------------------------------------------------
  if (isLoading) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Network Peers</CardTitle>
          <CardDescription>
            Devices on your NetBird network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="border-b px-4 py-3">
              <div className="flex gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <div className="divide-y">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Error state (fetch failed, no data) ------------------------------------
  if (!isLoading && error && !status) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Network Peers</CardTitle>
          <CardDescription>
            Devices on your NetBird network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">
              Failed to load peer data.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Not connected ----------------------------------------------------------
  if (!isConnected) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Network Peers</CardTitle>
          <CardDescription>
            Devices on your NetBird network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <UsersIcon className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Connect to NetBird to see your network peers.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Connected but no per-peer details (older NetBird versions) ------------
  // Show a summary card with counts when individual peer info isn't available
  if (peers.length === 0) {
    const peersConnected = status?.peers_connected ?? 0;
    const peersTotal = status?.peers_total ?? 0;

    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Network Peers</CardTitle>
          <CardDescription>
            Devices on your NetBird network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <UsersIcon className="size-10 text-muted-foreground" />
            {peersTotal > 0 ? (
              <>
                <div className="text-center space-y-1">
                  <p className="text-2xl font-bold">
                    {peersConnected}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      / {peersTotal}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {peersConnected === 1 ? "peer" : "peers"} connected
                  </p>
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Per-peer details are not available in this NetBird version.
                  Upgrade to a newer version for detailed peer information.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                No peers found on your NetBird network.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Peer table ------------------------------------------------------------
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Network Peers</CardTitle>
        <CardDescription>
          Devices on your NetBird network.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="hidden @sm/card:table-cell">Connection</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="hidden @md/card:table-cell w-28">
                  Last Seen
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody aria-live="polite">
              {peers.map((peer, i) => {
                const isOnline = peer.status === "Connected";
                const isP2P = peer.connection_type?.toLowerCase().includes("p2p") ||
                  peer.direct?.toLowerCase() === "true";

                return (
                  <MotionTableRow
                    key={`${peer.hostname}-${peer.netbird_ip || i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.05, 0.4), ease: "easeOut" }}
                  >
                    <TableCell className="max-w-48">
                      <span className="font-medium text-sm truncate block">
                        {peer.hostname || "Unknown"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {peer.netbird_ip || "\u2014"}
                    </TableCell>
                    <TableCell className="hidden @sm/card:table-cell">
                      {isOnline ? (
                        isP2P ? (
                          <Badge variant="outline" className="bg-success/15 text-success hover:bg-success/20 border-success/30">
                            <CheckCircle2Icon className="size-3" />
                            P2P
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-warning/15 text-warning hover:bg-warning/20 border-warning/30">
                            <AlertCircle className="size-3" />
                            Relayed
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">\u2014</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isOnline ? (
                        <Badge variant="outline" className="bg-success/15 text-success hover:bg-success/20 border-success/30">
                          <CheckCircle2Icon className="h-3 w-3" />
                          Online
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted-foreground/30">
                          <MinusCircleIcon className="h-3 w-3" />
                          Offline
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden @md/card:table-cell text-xs text-muted-foreground">
                      {formatLastSeen(peer.last_seen, isOnline)}
                    </TableCell>
                  </MotionTableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground">
          Showing <strong>{peers.length}</strong>{" "}
          {peers.length === 1 ? "peer" : "peers"}
        </div>
        {status?.peers_connected !== undefined && status.peers_connected > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2Icon className="size-3 text-success" />
            {status.peers_connected} connected
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
