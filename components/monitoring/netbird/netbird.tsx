"use client";

import { useNetBird } from "@/hooks/use-netbird";
import { NetBirdConnectionCard } from "./netbird-connection-card";
import { NetBirdPeersCard } from "./netbird-peers-card";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { TriangleAlertIcon } from "lucide-react";

import Link from "next/link";

const NetBirdComponent = () => {
  const hookData = useNetBird();

  // Mutual exclusion guard — other VPN is installed
  if (!hookData.isLoading && hookData.status?.other_vpn_installed) {
    return (
      <div className="@container/main mx-auto p-2">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">NetBird VPN</h1>
          <p className="text-muted-foreground">
            Manage your NetBird mesh VPN connection and network peers.
          </p>
        </div>
                <div className="grid grid-cols-1 @3xl/main:grid-cols-2 grid-flow-row gap-4">
          <Card>
            <CardContent>
              <Empty className="h-full bg-muted/30">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TriangleAlertIcon />
                  </EmptyMedia>
                  <EmptyTitle>
                    {hookData.status.other_vpn_name} is already installed
                  </EmptyTitle>
                  <EmptyDescription className="max-w-xs text-pretty">
                    Only one VPN can be installed at a time. Uninstall{" "}
                    {hookData.status.other_vpn_name} from the{" "}
                    <Link
                      href="/monitoring/tailscale"
                      className="underline font-medium"
                    >
                      {hookData.status.other_vpn_name} page
                    </Link>{" "}
                    first.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        </div>
        {/* <Card>
          <CardContent className="pt-6">
            <Alert>
              <AlertCircle className="size-4" />
              <AlertTitle>
                {hookData.status.other_vpn_name} is already installed
              </AlertTitle>
              <AlertDescription>
                Only one VPN can be installed at a time. Uninstall{" "}
                {hookData.status.other_vpn_name} from the{" "}
                <Link
                  href="/monitoring/tailscale"
                  className="underline font-medium"
                >
                  {hookData.status.other_vpn_name} page
                </Link>{" "}
                first.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card> */}
      </div>
    );
  }

  return (
    <div className="@container/main mx-auto p-2">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">NetBird VPN</h1>
        <p className="text-muted-foreground">
          Manage your NetBird mesh VPN connection and network peers.
        </p>
      </div>
      <div className="grid grid-cols-1 @3xl/main:grid-cols-2 grid-flow-row gap-4">
        <NetBirdConnectionCard {...hookData} />
        <NetBirdPeersCard
          status={hookData.status}
          isLoading={hookData.isLoading}
          error={hookData.error}
        />
      </div>
    </div>
  );
};

export default NetBirdComponent;
