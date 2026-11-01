import { View } from "react-native";

import { checklistProgress, isOverdue } from "@/domain/jobs";
import type { Job, JobPriority, JobStatus } from "@/domain/types";
import { Chip, Label, Row, type ChipTone } from "@/ui/components";
import { spacing, useTheme } from "@/theme";

/**
 * Status and priority are shown as a glyph *and* a word *and* a colour.
 * A technician may be colour-blind, in direct sunlight, or wearing polarised
 * safety glasses — any one of those makes hue alone useless.
 */

const STATUS_META: Record<JobStatus, { label: string; tone: ChipTone; glyph: string }> = {
  scheduled: { label: "Scheduled", tone: "neutral", glyph: "◷" },
  en_route: { label: "En route", tone: "info", glyph: "→" },
  on_site: { label: "On site", tone: "accent", glyph: "◉" },
  blocked: { label: "Blocked", tone: "warn", glyph: "!" },
  completed: { label: "Completed", tone: "good", glyph: "✓" },
  cancelled: { label: "Cancelled", tone: "bad", glyph: "✕" },
};

const PRIORITY_META: Record<JobPriority, { label: string; tone: ChipTone; glyph: string }> = {
  low: { label: "Low", tone: "neutral", glyph: "↓" },
  normal: { label: "Normal", tone: "neutral", glyph: "→" },
  high: { label: "High", tone: "warn", glyph: "↑" },
  emergency: { label: "Emergency", tone: "bad", glyph: "⇈" },
};

export function StatusChip({ status }: { status: JobStatus }) {
  const meta = STATUS_META[status];
  return <Chip label={meta.label} tone={meta.tone} glyph={meta.glyph} />;
}

export function PriorityChip({ priority }: { priority: JobPriority }) {
  const meta = PRIORITY_META[priority];
  return <Chip label={meta.label} tone={meta.tone} glyph={meta.glyph} />;
}

export function statusLabel(status: JobStatus): string {
  return STATUS_META[status].label;
}

export function priorityLabel(priority: JobPriority): string {
  return PRIORITY_META[priority].label;
}

/** A bar plus its own numbers, because a bar alone is not a value. */
export function ChecklistProgress({ job }: { job: Job }) {
  const theme = useTheme();
  const progress = checklistProgress(job.checklist);
  const ratio = progress.total === 0 ? 0 : progress.done / progress.total;

  return (
    <View style={{ gap: 4 }}>
      <Row>
        <Label variant="caption" tone="muted">
          Checklist {progress.done} of {progress.total}
        </Label>
        {progress.requiredOutstanding > 0 ? (
          <Label variant="caption" tone="muted" style={{ marginLeft: "auto" }}>
            {progress.requiredOutstanding} required outstanding
          </Label>
        ) : null}
      </Row>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}
        accessibilityLabel={`Checklist progress: ${progress.done} of ${progress.total} items done`}
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.surfaceMuted,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.round(ratio * 100)}%`,
            height: "100%",
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>
    </View>
  );
}

/**
 * Relative time, computed against a caller-supplied `now` so a list renders
 * every row against the same instant and the function stays pure.
 */
export function timeLabel(iso: string, now: number): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "unknown";
  const diffMinutes = Math.round((target - now) / 60_000);
  const absolute = Math.abs(diffMinutes);

  if (absolute < 60) {
    if (diffMinutes === 0) return "now";
    return diffMinutes > 0 ? `in ${absolute}m` : `${absolute}m ago`;
  }
  if (absolute < 60 * 24) {
    const hours = Math.round(absolute / 60);
    return diffMinutes > 0 ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.round(absolute / (60 * 24));
  return diffMinutes > 0 ? `in ${days}d` : `${days}d ago`;
}

export function OverdueChip({ job, now }: { job: Job; now: number }) {
  if (!isOverdue(job, now)) return null;
  return <Chip label="Overdue" tone="bad" glyph="!" />;
}

export function JobMeta({ job, now }: { job: Job; now: number }) {
  return (
    <Row wrap gap={spacing.xs}>
      <StatusChip status={job.status} />
      <PriorityChip priority={job.priority} />
      <OverdueChip job={job} now={now} />
    </Row>
  );
}
