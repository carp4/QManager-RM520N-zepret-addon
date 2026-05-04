"use client";

import { useMemo } from "react";
import { useSystemHealthCheck } from "@/hooks/use-system-health-check";
import SummaryCard from "./summary-card";
import CategoryCard from "./category-card";
import {
  CATEGORY_LABELS,
  type HealthCheckTest,
  type TestCategory,
} from "@/types/system-health-check";

const CATEGORY_ORDER: TestCategory[] = [
  "binaries",
  "permissions",
  "at_transport",
  "sms",
  "sudoers",
  "services",
  "network",
  "configuration",
];

export default function SystemHealthCheck() {
  const { job, isRunning, isStarting, error, start, fetchTestOutput, downloadBundle } =
    useSystemHealthCheck();

  // Group tests by category, then sort categories fail-first.
  const groups = useMemo(() => {
    const buckets = new Map<TestCategory, HealthCheckTest[]>();
    if (job?.tests) {
      for (const t of job.tests) {
        const arr = buckets.get(t.category) ?? [];
        arr.push(t);
        buckets.set(t.category, arr);
      }
    }
    const items: { category: TestCategory; tests: HealthCheckTest[]; failCount: number }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const tests = buckets.get(cat);
      if (!tests || tests.length === 0) continue;
      const failCount = tests.filter((t) => t.status === "fail").length;
      items.push({ category: cat, tests, failCount });
    }
    items.sort((a, b) => {
      if ((a.failCount > 0) === (b.failCount > 0)) {
        return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      }
      return a.failCount > 0 ? -1 : 1;
    });
    return items;
  }, [job]);

  return (
    <div className="@container/main mx-auto p-2">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">System Health Check</h1>
        <p className="text-muted-foreground">
          Diagnose QManager subsystems and download a redacted bundle for support.
        </p>
      </div>
      <div className="grid grid-cols-1 grid-flow-row gap-4">
        <SummaryCard
          job={job}
          isRunning={isRunning}
          isStarting={isStarting}
          onRun={start}
          onDownload={downloadBundle}
        />
        {error && (
          <div className="text-sm text-destructive">Error: {error}</div>
        )}
        {groups.map((g) => (
          <CategoryCard
            key={g.category}
            category={g.category}
            tests={g.tests}
            fetchOutput={fetchTestOutput}
          />
        ))}
        {!job && (
          <div className="text-sm text-muted-foreground text-center py-8">
            Click <strong>Run Diagnostics</strong> above to start a health check.
            All categories ({CATEGORY_ORDER.map((c) => CATEGORY_LABELS[c]).join(", ")}) will be probed.
          </div>
        )}
      </div>
    </div>
  );
}
