"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import {
  CheckCircle2Icon,
  XCircleIcon,
  MinusCircleIcon,
  SendIcon,
  Loader2,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshCcwIcon,
  AlertCircle,
  TriangleAlertIcon,
  ChevronRightIcon,
  CheckIcon,
  Trash2Icon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SaveButton, useSaveFlash } from "@/components/ui/save-button";
import { useDiscordBot } from "@/hooks/use-discord-bot";
import type {
  DiscordBotSavePayload,
  DiscordBotSettings,
} from "@/types/discord-bot";

// Discord snowflake: 17–20 numeric digits.
const DISCORD_ID_REGEX = /^\d{17,20}$/;

// --- Onboarding stepper -----------------------------------------------------
type StepState = "done" | "active" | "pending";

function StepperPill({ n, label, state }: { n: number; label: string; state: StepState }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap transition-colors",
        state === "done" &&
          "border-success/30 bg-success/15 text-success",
        // Active gets a non-color cue (font-semibold + ring) so users with
        // color-vision differences can still see which step they're on —
        // WCAG 1.4.1 (Use of Color).
        state === "active" &&
          "border-warning/40 bg-warning/15 text-warning font-semibold ring-1 ring-warning/40",
        state === "pending" &&
          "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 items-center justify-center rounded-full text-[10px] font-medium tabular-nums",
          state === "done" && "bg-success/25",
          state === "active" && "bg-warning/25",
          state === "pending" && "bg-muted-foreground/20",
        )}
      >
        {state === "done" ? <CheckIcon className="size-3" /> : n}
      </span>
      {label}
    </div>
  );
}

interface OnboardingStepperProps {
  tokenSet: boolean;
  ownerIdSet: boolean;
  online: boolean;
  authorized: boolean;
}

function OnboardingStepper({ tokenSet, ownerIdSet, online, authorized }: OnboardingStepperProps) {
  // Order matches the form below: User ID first (easy — copy from Discord
  // with Developer Mode), then Token (harder — requires Developer Portal app),
  // then Online (gateway connect), then Authorized (DM channel captured).
  const steps = [
    { n: 1, label: "User ID", done: ownerIdSet },
    { n: 2, label: "Token", done: tokenSet },
    { n: 3, label: "Online", done: online },
    { n: 4, label: "Authorized", done: authorized },
  ];

  // First not-done step becomes the "active" one.
  const firstPendingIndex = steps.findIndex((s) => !s.done);

  return (
    <ol
      className="flex items-center gap-1.5 flex-wrap m-0 p-0 list-none"
      aria-label="Setup progress"
    >
      {steps.map((s, i) => {
        const state: StepState = s.done
          ? "done"
          : i === firstPendingIndex
            ? "active"
            : "pending";
        return (
          <li
            key={s.n}
            className="flex items-center gap-1.5"
            aria-current={state === "active" ? "step" : undefined}
          >
            <StepperPill n={s.n} label={s.label} state={state} />
            {i < steps.length - 1 && (
              <ChevronRightIcon
                className="size-3 text-muted-foreground/60"
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function DiscordBotCard() {
  const {
    settings,
    status,
    isLoading,
    isSaving,
    isSendingTest,
    error,
    saveSettings,
    sendTestDm,
    refresh,
    resetBot,
    isResetting,
  } = useDiscordBot();

  const { saved, markSaved } = useSaveFlash();

  // --- Local form state (synced from server data during render) -------------
  const [prevSettings, setPrevSettings] = useState<DiscordBotSettings | null>(
    null,
  );
  const [token, setToken] = useState(""); // ephemeral — never pre-filled
  const [showToken, setShowToken] = useState(false);
  // When the token is already saved server-side, the field collapses to a
  // "Saved · Replace" affordance. Clicking Replace flips this to true and
  // re-renders the input. Cleared on successful save and on reset.
  const [replaceTokenMode, setReplaceTokenMode] = useState(false);
  const [ownerID, setOwnerID] = useState("");
  const [threshold, setThreshold] = useState("5");
  const [enabled, setEnabled] = useState(false);
  // Optimistic auth flag — bridges the gap between a successful test send
  // and the next status poll landing with `authorized: true` from the
  // backend. The backend (status.sh checking the dm_channel cache file) is
  // the source of truth; this only suppresses flicker and is cleared on
  // reset.
  const [optimisticAuth, setOptimisticAuth] = useState(false);
  const authorized = !!status?.authorized || optimisticAuth;
  // Tracks when the user clicked "Add Bot to Account". When the QManager tab
  // regains focus after this, we auto-fire a test message to verify
  // reachability — OAuth has no callback into us, so a delivered message is
  // the only proof.
  const oauthClickedAtRef = useRef<number | null>(null);
  const [autoVerifying, setAutoVerifying] = useState(false);
  // Post-save initialization buffer. The Discord gateway handshake takes ~10s
  // on a typical cellular link, so we hold the UI in a "Connecting…" state for
  // that window instead of trusting a possibly-stale status.json from before
  // the daemon's svc_restart. While true: badge shows "Connecting…", auth
  // alert and Send Test stay hidden, status polls every 1s.
  const [isInitializing, setIsInitializing] = useState(false);

  if (settings && settings !== prevSettings) {
    setPrevSettings(settings);
    setOwnerID(settings.owner_discord_id);
    setThreshold(String(settings.threshold_minutes));
    setEnabled(settings.enabled);
  }

  // --- Validation ------------------------------------------------------------
  const ownerIDError =
    ownerID && !DISCORD_ID_REGEX.test(ownerID)
      ? "Discord User ID is 17–20 digits — copy it from Discord with Developer Mode on"
      : null;

  const thresholdNum = Number(threshold);
  const thresholdError =
    threshold &&
    (isNaN(thresholdNum) ||
      !Number.isInteger(thresholdNum) ||
      thresholdNum < 1 ||
      thresholdNum > 60)
      ? "Duration must be 1–60 minutes"
      : null;

  const tokenRequiredError =
    enabled && !settings?.token_set && !token.trim()
      ? "Bot token is required when the bot is enabled"
      : null;

  const ownerIDRequiredError =
    enabled && !ownerID ? "Discord User ID is required when the bot is enabled" : null;

  const hasValidationErrors = !!(
    ownerIDError ||
    thresholdError ||
    tokenRequiredError ||
    ownerIDRequiredError
  );

  // Whether the Enable switch may be flipped on. Token + valid User ID must
  // be in hand before enabling makes sense — otherwise the daemon would
  // svc_restart and immediately exit on missing creds. Toggling OFF is always
  // allowed (so a user can disable a configured bot).
  const tokenAvailable = !!settings?.token_set || token.trim().length > 0;
  const ownerIDValid = !!ownerID && !ownerIDError;
  const prereqsMet = tokenAvailable && ownerIDValid;

  // --- Dirty check -----------------------------------------------------------
  const isDirty = settings
    ? enabled !== settings.enabled ||
      ownerID !== settings.owner_discord_id ||
      threshold !== String(settings.threshold_minutes) ||
      token.trim().length > 0
    : false;

  const canSave = !hasValidationErrors && isDirty && !isSaving && !isSendingTest;

  const canSendTest =
    !!status?.connected &&
    !!settings?.enabled &&
    !!settings?.token_set &&
    !!settings?.owner_discord_id &&
    !isSaving &&
    !isSendingTest;

  // --- Handlers --------------------------------------------------------------
  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSave) return;

    const payload: DiscordBotSavePayload = {
      action: "save_settings",
      enabled,
      owner_discord_id: ownerID,
      threshold_minutes: thresholdNum,
    };
    if (token.trim()) payload.bot_token = token.trim();

    const ok = await saveSettings(payload);
    if (ok) {
      setToken("");
      setReplaceTokenMode(false);
      setShowToken(false);
      markSaved();
      toast.success("Discord bot settings saved");
      // The daemon takes ~10s to complete the Discord gateway handshake after
      // svc_restart — and the status.json on disk may still hold connected:true
      // from the previous session for the first second or two. Drive the UI
      // into a deliberate "Connecting…" state and let the polling effect
      // refresh status until the new daemon is actually up.
      if (payload.enabled) {
        setIsInitializing(true);
      }
    } else {
      toast.error(error || "Failed to save Discord bot settings");
    }
  };

  // Optimistic UI bridge for the gap between "test message delivered" and the
  // next status poll landing the backend's authoritative `authorized` flag.
  // Only call after a successful round-trip; backend persistence comes from
  // the daemon writing /etc/qmanager/discord_dm_channel.
  const markAuthorized = useCallback(() => {
    setOptimisticAuth(true);
    refresh();
  }, [refresh]);

  const handleSendTest = async () => {
    const result = await sendTestDm();
    // Stable toast id — keeps manual sends and the auto-verify-on-focus
    // path from stacking duplicate "Test message…" notifications when the
    // user clicks Send while a focus-fired auto-verify is also resolving.
    if (result.success) {
      markAuthorized();
      toast.success("Test message delivered — bot is authorized", {
        id: "discord-test-message",
      });
    } else {
      toast.error(
        result.error ||
          "Couldn't deliver the test message — make sure you've added the bot to your Discord account",
        { id: "discord-test-message" },
      );
    }
  };

  const oauthUrl = status?.app_id
    ? `https://discord.com/oauth2/authorize?client_id=${status.app_id}&scope=applications.commands&integration_type=1`
    : null;

  // Open the OAuth install URL and arm the focus listener.
  // We can't detect when the user finishes Discord's OAuth flow (no callback),
  // so we rely on the QManager tab regaining focus as a proxy for "user came back".
  const handleAddBot = () => {
    if (!oauthUrl) return;
    oauthClickedAtRef.current = Date.now();
    window.open(oauthUrl, "_blank", "noopener,noreferrer");
  };

  // When the user returns from Discord's OAuth flow, fire a test DM
  // automatically — eliminates the manual "Send Test DM" step that's easy
  // to miss. A 1.5s grace period filters out the immediate focus shuffle
  // that happens around window.open itself; a 2s post-focus delay gives
  // Discord time to register the install before we test.
  useEffect(() => {
    const handleFocus = async () => {
      const clickedAt = oauthClickedAtRef.current;
      if (clickedAt === null) return;
      if (Date.now() - clickedAt < 1500) return;
      oauthClickedAtRef.current = null;

      setAutoVerifying(true);
      await new Promise((r) => setTimeout(r, 2000));
      const result = await sendTestDm();
      if (result.success) {
        markAuthorized();
        toast.success("Bot authorized — test message delivered", {
          id: "discord-test-message",
        });
      } else {
        toast.error(
          result.error ||
            "Couldn't verify — finish authorization in Discord, then send a test message",
          { id: "discord-test-message" },
        );
      }
      setAutoVerifying(false);
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [sendTestDm, markAuthorized]);

  // --- Post-save initialization buffer --------------------------------------
  // While isInitializing, poll status every 1s so the badge tracks the
  // gateway handshake. Hold for at least 10s — that's the typical Discord
  // gateway connect time on cellular, and it absorbs any stale connected:true
  // left in status.json from before svc_restart. Buttons that depend on
  // status.connected (Send Test, Add Bot in the auth alert) stay correctly
  // gated by status; the buffer just prevents premature interaction with the
  // "Awaiting authorization" UI flashing in from stale data.
  useEffect(() => {
    if (!isInitializing) return;
    const interval = setInterval(() => refresh(true), 1000);
    const timeout = setTimeout(() => setIsInitializing(false), 10000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isInitializing, refresh]);

  // --- Status badge ----------------------------------------------------------
  // Five states (in order of "more configured" → "fully working"):
  //   0. Connecting       — post-save buffer; gateway handshake in progress
  //   1. Not installed    — bot binary missing
  //   2. Disconnected     — bot installed but gateway connection failed (token invalid/etc)
  //   3. Awaiting auth    — gateway connected but user hasn't added the bot via OAuth yet
  //                         (we can't DM them; proven only by a successful test DM)
  //   4. Authorized       — gateway connected AND user has been reached at least once
  const statusBadge = () => {
    if (isInitializing) {
      return (
        <Badge
          variant="outline"
          className="bg-info/15 text-info hover:bg-info/20 border-info/30"
        >
          <Loader2 className="size-3 animate-spin" /> Connecting…
        </Badge>
      );
    }
    if (!status?.installed) {
      return (
        <Badge
          variant="outline"
          className="bg-muted/50 text-muted-foreground hover:bg-muted/60 border-muted-foreground/30"
        >
          <MinusCircleIcon className="size-3" /> Not installed
        </Badge>
      );
    }
    if (!status.connected) {
      return (
        <Badge
          variant="outline"
          className="bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30"
        >
          <XCircleIcon className="size-3" />
          {status.error === "invalid_token" ? "Invalid token" : "Disconnected"}
        </Badge>
      );
    }
    if (!authorized) {
      return (
        <Badge
          variant="outline"
          className="bg-warning/15 text-warning hover:bg-warning/20 border-warning/30"
        >
          <TriangleAlertIcon className="size-3" /> Awaiting authorization
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="bg-success/15 text-success hover:bg-success/20 border-success/30"
      >
        <CheckCircle2Icon className="size-3" /> Authorized
        {status.latency_ms > 0 && (
          // Drop the prior `text-success/70` — gray-on-color killed contrast
          // below 3:1 in light mode. Use a thin separator + tabular-nums so
          // the latency reads cleanly and doesn't jitter as it polls.
          <span className="ml-1 tabular-nums">· {status.latency_ms}ms</span>
        )}
      </Badge>
    );
  };

  // Setup progress flags (for the stepper + setup-help logic)
  const tokenSet = !!settings?.token_set;
  const ownerIdSet = !!settings?.owner_discord_id && DISCORD_ID_REGEX.test(settings.owner_discord_id);
  const online = !!status?.connected;
  const fullyOnboarded = tokenSet && ownerIdSet && online && authorized;

  // --- Loading skeleton ------------------------------------------------------
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Connection</CardTitle>
          <CardDescription>
            Connect your Discord account and choose when downtime alerts
            are sent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-10 w-full max-w-sm" />
            <Skeleton className="h-10 w-full max-w-sm" />
            <Skeleton className="h-10 w-full max-w-sm" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Error state (initial fetch failed) -----------------------------------
  if (!isLoading && error && !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Connection</CardTitle>
          <CardDescription>
            Connect your Discord account and choose when downtime alerts
            are sent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load settings</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => refresh()}>
                <RefreshCcwIcon className="size-3.5" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // --- Render ---------------------------------------------------------------
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle as="h2">Connection</CardTitle>
            <CardDescription>
              Connect your Discord account and choose when downtime alerts
              are sent.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statusBadge()}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refresh()}
              aria-label="Refresh status"
              title="Refresh status"
            >
              <RefreshCcwIcon className="size-4" />
            </Button>
          </div>
        </div>
        {/* Onboarding stepper — hidden once everything's done */}
        {!fullyOnboarded && (
          <div className="mt-3">
            <OnboardingStepper
              tokenSet={tokenSet}
              ownerIdSet={ownerIdSet}
              online={online}
              authorized={authorized}
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* First-time setup help — flat typography, no nested-card chrome */}
        {(!status?.installed || !tokenSet) && (
          <Collapsible className="mb-6 group/setup">
            <CollapsibleTrigger
              type="button"
              className="flex items-center gap-1.5 text-sm font-medium cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              <ChevronRightIcon
                className="size-4 transition-transform group-data-[state=open]/setup:rotate-90"
                aria-hidden
              />
              First-time setup — how to get a bot token
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ol className="mt-2 ml-5 list-decimal list-outside space-y-1.5 text-sm text-muted-foreground marker:text-muted-foreground/60">
                <li>
                  Go to{" "}
                  <a
                    href="https://discord.com/developers/applications"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-info underline underline-offset-2 hover:text-info/80"
                  >
                    discord.com/developers
                  </a>{" "}
                  → New Application → Bot → copy token.
                </li>
                <li>Paste the token in the field below.</li>
                <li>
                  In Discord, enable Developer Mode (Settings → Advanced),
                  then right-click your avatar → Copy User ID.
                </li>
                <li>Paste your User ID below and save.</li>
                <li>
                  Once the bot connects, click{" "}
                  <span className="font-medium text-foreground">
                    Add Bot to Account
                  </span>{" "}
                  to authorize it for direct messages — then send a test
                  message to confirm.
                </li>
              </ol>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Post-save initialization callout — Discord gateway handshake takes
            ~10s on cellular. Holds the user's attention so they don't click
            "Add Bot to Account" against a not-yet-ready bot. */}
        {isInitializing && (
          <Alert className="mb-6 border-info/30 bg-info/5 [&>svg]:text-info">
            <Loader2 className="size-4 animate-spin" />
            <AlertTitle className="text-info">
              Connecting to Discord…
            </AlertTitle>
            <AlertDescription>
              The bot is starting up — this usually takes about 10 seconds.
              Authorization options will appear once the gateway is ready.
            </AlertDescription>
          </Alert>
        )}

        {/* Awaiting-authorization callout — connected but no test DM has succeeded */}
        {!isInitializing && tokenSet && online && !authorized && oauthUrl && (
          <Alert className="mb-6 border-warning/30 bg-warning/5 [&>svg]:text-warning">
            <TriangleAlertIcon className="size-4" />
            <AlertTitle className="text-warning">
              {autoVerifying
                ? "Verifying authorization…"
                : "Almost there — authorize the bot"}
            </AlertTitle>
            <AlertDescription>
              {autoVerifying ? (
                <p className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Sending a test message to confirm reachability…
                </p>
              ) : (
                <>
                  <p className="mb-3">
                    Click{" "}
                    <span className="font-medium text-foreground">
                      Add Bot to Account
                    </span>{" "}
                    to install the bot in your Discord account. When you
                    return to this tab, we&apos;ll automatically send a
                    test message to confirm it can reach you.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAddBot}
                    >
                      <ExternalLinkIcon className="size-4" />
                      Add Bot to Account
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={!canSendTest}
                      onClick={handleSendTest}
                    >
                      {isSendingTest ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Sending&hellip;
                        </>
                      ) : (
                        <>
                          <SendIcon className="size-4" />
                          Send test message manually
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        <form className="grid gap-4" onSubmit={handleSave}>
          <FieldSet>
            <FieldGroup>
              {/* Enable toggle — gated until both creds are in hand. Toggling
                  OFF an enabled bot is always allowed. */}
              <div>
                <Field orientation="horizontal" className="w-fit">
                  <FieldLabel htmlFor="discord-enabled">
                    Enable Discord Bot
                  </FieldLabel>
                  <Switch
                    id="discord-enabled"
                    checked={enabled}
                    onCheckedChange={setEnabled}
                    disabled={!enabled && !prereqsMet}
                  />
                </Field>
                {!enabled && !prereqsMet && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Fill in your Discord User ID and Bot Token below first.
                  </p>
                )}
              </div>

              {/* Discord User ID — first because it's easy to obtain (Discord
                  Developer Mode → Copy User ID). Token comes after. */}
              <Field>
                <FieldLabel htmlFor="discord-owner-id">
                  Your Discord User ID
                </FieldLabel>
                <Input
                  id="discord-owner-id"
                  inputMode="numeric"
                  placeholder="e.g. 123456789012345678"
                  className="max-w-sm font-mono"
                  value={ownerID}
                  onChange={(e) => setOwnerID(e.target.value.trim())}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={!!(ownerIDError || ownerIDRequiredError)}
                  aria-describedby={
                    ownerIDError || ownerIDRequiredError
                      ? "discord-owner-id-error"
                      : "discord-owner-id-desc"
                  }
                />
                {ownerIDError || ownerIDRequiredError ? (
                  <FieldError id="discord-owner-id-error">
                    {ownerIDError || ownerIDRequiredError}
                  </FieldError>
                ) : (
                  <FieldDescription id="discord-owner-id-desc">
                    The Discord account that will receive DMs from the bot.
                  </FieldDescription>
                )}
              </Field>

              {/* Bot Token — collapses to a "Saved" chip + Replace button once
                  the server has it. Replace re-renders the input so the user
                  can paste a new token; Cancel discards the edit and keeps the
                  saved one. */}
              <Field>
                <FieldLabel htmlFor="discord-token">Bot Token</FieldLabel>
                {settings?.token_set && !replaceTokenMode ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="bg-success/15 text-success hover:bg-success/20 border-success/30"
                    >
                      <CheckCircle2Icon className="size-3" />
                      Saved
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReplaceTokenMode(true);
                        setToken("");
                        setShowToken(false);
                      }}
                    >
                      Replace
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative max-w-sm">
                      <Input
                        id="discord-token"
                        name="discord-bot-token"
                        // Use a real password input so masking works in every
                        // browser (the previous CSS `text-security` trick was
                        // WebKit-only — Firefox would leak the token in
                        // plaintext). `autoComplete="new-password"` tells
                        // browsers/managers this isn't a saved-password field
                        // to auto-fill from.
                        type={showToken ? "text" : "password"}
                        placeholder={
                          replaceTokenMode
                            ? "Paste new bot token"
                            : "Paste your bot token"
                        }
                        // Suppress the Edge/IE native reveal button so it doesn't
                        // duplicate our show/hide toggle.
                        className="pr-11 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-1p-ignore=""
                        data-lpignore="true"
                        data-form-type="other"
                        aria-invalid={!!tokenRequiredError}
                        aria-describedby={
                          tokenRequiredError
                            ? "discord-token-error"
                            : "discord-token-desc"
                        }
                      />
                      <button
                        type="button"
                        aria-label={showToken ? "Hide token" : "Show token"}
                        aria-pressed={showToken}
                        // p-1.5 around a size-4 (16px) icon yields a ~28px hit
                        // area — meets WCAG 2.5.8 AA minimum (24px). The
                        // negative margin keeps the icon visually flush with
                        // the input's right edge.
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        onClick={() => setShowToken((v) => !v)}
                      >
                        {showToken ? (
                          <EyeOffIcon className="size-4" />
                        ) : (
                          <EyeIcon className="size-4" />
                        )}
                      </button>
                    </div>
                    {replaceTokenMode && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start mt-1 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setReplaceTokenMode(false);
                          setToken("");
                          setShowToken(false);
                        }}
                      >
                        Cancel — keep saved token
                      </Button>
                    )}
                  </>
                )}
                {tokenRequiredError ? (
                  <FieldError id="discord-token-error">
                    {tokenRequiredError}
                  </FieldError>
                ) : (
                  <FieldDescription id="discord-token-desc">
                    Created in the Discord Developer Portal. Stored locally
                    on this device.
                  </FieldDescription>
                )}
              </Field>

              {/* Threshold */}
              <Field>
                <FieldLabel htmlFor="discord-threshold">
                  Alert After (minutes)
                </FieldLabel>
                <Input
                  id="discord-threshold"
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  className="max-w-sm"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  aria-invalid={!!thresholdError}
                  aria-describedby={
                    thresholdError
                      ? "discord-threshold-error"
                      : "discord-threshold-desc"
                  }
                />
                {thresholdError ? (
                  <FieldError id="discord-threshold-error">
                    {thresholdError}
                  </FieldError>
                ) : (
                  <FieldDescription id="discord-threshold-desc">
                    How long the connection must be down before an alert is
                    sent. Prevents alerts for brief, transient outages.
                  </FieldDescription>
                )}
              </Field>
            </FieldGroup>
          </FieldSet>

          <Separator className="my-2" />

          <div className="grid gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <SaveButton
                type="submit"
                isSaving={isSaving}
                saved={saved}
                disabled={!canSave}
              />
              {/* Send test message and Add Bot live in the awaiting-auth
                  callout while the user is mid-onboarding — hide here to
                  avoid duplicate CTAs. Once authorized, they live here as
                  routine actions. */}
              {authorized && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canSendTest}
                  onClick={handleSendTest}
                >
                  {isSendingTest ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Sending&hellip;
                    </>
                  ) : (
                    <>
                      <SendIcon className="size-4" />
                      Send test message
                    </>
                  )}
                </Button>
              )}
            </div>
            {isDirty && enabled && authorized && (
              <p className="text-xs text-muted-foreground">
                Save your changes — the test uses the saved settings.
              </p>
            )}
          </div>
        </form>

        {/* Use server-saved settings.enabled, not the local `enabled` form state —
            unsaved local toggles haven't actually stopped the daemon yet. Mirrors
            the email-alerts uninstall gate (msmtpInstalled && !isEnabled). */}
        {(tokenSet || ownerIdSet) && !settings?.enabled && (
          <>
            <Separator className="mt-6" />
            <div className="flex items-center justify-between gap-3 flex-wrap pt-6">
              <div>
                <p className="text-sm font-medium">Reset Discord Bot</p>
                <p className="text-xs text-muted-foreground">
                  Clear the saved token, recipient, and authorization. You&apos;ll need to set up the bot again from scratch.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isResetting}>
                    {isResetting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Resetting&hellip;
                      </>
                    ) : (
                      <>
                        <Trash2Icon className="size-4" />
                        Reset
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Discord Bot?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3 text-sm text-muted-foreground">
                        <p>
                          Stops the bot and deletes the saved token, Discord
                          User ID, and authorization on this device.
                        </p>
                        <ul className="list-disc list-outside ml-5 space-y-1 marker:text-muted-foreground/60">
                          <li>The bot binary stays installed on this router.</li>
                          <li>
                            Your Discord application stays on Discord&apos;s
                            servers — you can reuse the same token if
                            you&apos;ve kept it.
                          </li>
                        </ul>
                        <p>You&apos;ll need to set up the bot again before alerts can resume.</p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        const ok = await resetBot();
                        if (ok) {
                          // Backend reset removes /etc/qmanager/discord_dm_channel,
                          // so status.authorized will flip to false on the next
                          // poll — no client-side persistence to clean up here.
                          setOptimisticAuth(false);
                          // Reset all local form state
                          setToken("");
                          setShowToken(false);
                          setReplaceTokenMode(false);
                          setOwnerID("");
                          setThreshold("5");
                          setEnabled(false);
                          setPrevSettings(null);
                          // Disarm any pending OAuth-return verification —
                          // otherwise a focus event after reset would fire a
                          // spurious test message against now-empty credentials.
                          oauthClickedAtRef.current = null;
                          setAutoVerifying(false);
                          toast.success("Discord bot reset");
                        } else {
                          toast.error(error || "Failed to reset Discord bot");
                        }
                      }}
                    >
                      Reset
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
