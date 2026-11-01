import { ScrollView, View } from "react-native";

import type { Conflict, Mutation } from "@/domain/types";
import { useApp } from "@/state/app-context";
import { spacing } from "@/theme";
import {
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Label,
  Row,
  Screen,
} from "@/ui/components";
import { priorityLabel, statusLabel, timeLabel } from "@/ui/job-bits";
import { useNow } from "@/ui/use-now";

/**
 * The sync screen.
 *
 * Offline-first apps fail when the user cannot tell what has and has not
 * reached the office. This screen is the answer to "is my day saved?": the
 * queue is visible, each entry says what it is and why it has not gone, and
 * anything needing a decision is right at the top.
 */
export default function SyncScreen() {
  const {
    sync,
    outbox,
    conflicts,
    jobs,
    conditions,
    busy,
    persistent,
    syncNow,
    resolveConflict,
    discardMutation,
  } = useApp();

  const now = useNow();
  const pending = outbox.filter((entry) => !entry.deadLettered);
  const failed = outbox.filter((entry) => entry.deadLettered);
  const jobTitle = (jobId: string) =>
    jobs.find((job) => job.id === jobId)?.title ?? jobId;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Card style={{ gap: spacing.sm }}>
          <Row>
            <Label variant="title">Status</Label>
            <Chip
              style={{ marginLeft: "auto" }}
              label={conditions.offline ? "Offline" : "Online"}
              tone={conditions.offline ? "warn" : "good"}
              glyph={conditions.offline ? "⚠" : "●"}
            />
          </Row>
          <Label variant="caption" tone="muted">
            {sync.lastSyncedAt
              ? `Last synced ${timeLabel(sync.lastSyncedAt, now)}.`
              : "Not synced yet on this device."}
          </Label>
          <Row gap={spacing.xs} wrap>
            <Chip label={`${pending.length} waiting`} tone={pending.length ? "info" : "neutral"} />
            <Chip
              label={`${conflicts.length} need you`}
              tone={conflicts.length ? "bad" : "neutral"}
            />
            <Chip label={`${failed.length} failed`} tone={failed.length ? "warn" : "neutral"} />
          </Row>
          <Button
            label={busy ? "Syncing…" : "Sync now"}
            variant="primary"
            loading={busy}
            onPress={() => void syncNow()}
            accessibilityHint="Sends everything waiting and fetches updates from the office"
          />
          {!persistent ? (
            <Banner
              tone="warn"
              title="Storage is not persistent on this device"
              body="Device storage could not be opened, so your work is held in memory only and will be lost if the app restarts. Everything else still works."
            />
          ) : null}
        </Card>

        {conflicts.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Label variant="title">Needs your decision</Label>
            <Label variant="caption" tone="muted">
              You and the office changed the same thing. Nothing is discarded until
              you choose.
            </Label>
            {conflicts.map((conflict) => (
              <ConflictCard
                key={conflict.id}
                conflict={conflict}
                title={jobTitle(conflict.jobId)}
                onResolve={(resolution) => void resolveConflict(conflict.id, resolution)}
              />
            ))}
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Label variant="title">Waiting to send ({pending.length})</Label>
          {pending.length === 0 ? (
            <Card>
              <EmptyState
                title="Everything is sent"
                body="No changes are waiting on this device."
              />
            </Card>
          ) : (
            pending.map((entry) => (
              <MutationCard
                key={entry.id}
                mutation={entry}
                title={jobTitle(entry.jobId)}
                now={now}
              />
            ))
          )}
        </View>

        {failed.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Label variant="title">Could not be sent ({failed.length})</Label>
            <Label variant="caption" tone="muted">
              These were refused by the office and will not be retried. Review them,
              then discard.
            </Label>
            {failed.map((entry) => (
              <MutationCard
                key={entry.id}
                mutation={entry}
                title={jobTitle(entry.jobId)}
                now={now}
                onDiscard={() => void discardMutation(entry.id)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const KIND_LABELS: Record<Mutation["kind"], string> = {
  set_status: "Status change",
  set_priority: "Priority change",
  toggle_checklist: "Checklist item",
  add_note: "Note",
  complete_job: "Job completion",
};

function describePayload(mutation: Mutation): string {
  switch (mutation.kind) {
    case "set_status":
      return `to ${statusLabel(mutation.payload.status as never)}`;
    case "set_priority":
      return `to ${priorityLabel(mutation.payload.priority as never)}`;
    case "toggle_checklist":
      return mutation.payload.done ? "ticked" : "unticked";
    case "add_note":
      return "added";
    case "complete_job":
      return "with write-up";
  }
}

function MutationCard({
  mutation,
  title,
  now,
  onDiscard,
}: {
  mutation: Mutation;
  title: string;
  now: number;
  onDiscard?: () => void;
}) {
  return (
    <Card style={{ gap: spacing.xs }}>
      <Row>
        <Label variant="label">{KIND_LABELS[mutation.kind]}</Label>
        <Label variant="caption" tone="subtle" style={{ marginLeft: "auto" }}>
          {timeLabel(mutation.createdAt, now)}
        </Label>
      </Row>
      <Label variant="caption" tone="muted" numberOfLines={2}>
        {title} — {describePayload(mutation)}
      </Label>
      <Row gap={spacing.xs} wrap>
        {mutation.attempts > 0 ? (
          <Chip label={`${mutation.attempts} attempt${mutation.attempts === 1 ? "" : "s"}`} tone="warn" />
        ) : (
          <Chip label="Queued" tone="info" />
        )}
        {mutation.deadLettered ? <Chip label="Given up" tone="bad" glyph="✕" /> : null}
      </Row>
      {mutation.lastError ? (
        <Label variant="caption" tone="muted">
          Last response: {mutation.lastError}
        </Label>
      ) : null}
      {onDiscard ? (
        <>
          <Divider />
          <Button label="Discard this change" variant="danger" onPress={onDiscard} />
        </>
      ) : null}
    </Card>
  );
}

function formatValue(field: Conflict["field"], value: unknown): string {
  if (field === "status") return statusLabel(value as never);
  if (field === "priority") return priorityLabel(value as never);
  if (typeof value === "string") return value || "(empty)";
  return JSON.stringify(value);
}

const FIELD_LABELS: Record<Conflict["field"], string> = {
  status: "Status",
  priority: "Priority",
  completionNotes: "Completion write-up",
  checklist: "Checklist",
  notes: "Notes",
};

function ConflictCard({
  conflict,
  title,
  onResolve,
}: {
  conflict: Conflict;
  title: string;
  onResolve: (resolution: "keep_mine" | "keep_theirs") => void;
}) {
  return (
    <Card style={{ gap: spacing.sm }}>
      <Label variant="label">
        {FIELD_LABELS[conflict.field]} — {title}
      </Label>
      <Label variant="caption" tone="muted">
        It was {formatValue(conflict.field, conflict.base)} when you last synced.
      </Label>
      <View style={{ gap: spacing.xs }}>
        <Row gap={spacing.sm}>
          <Chip label="You set" tone="accent" />
          <Label variant="body">{formatValue(conflict.field, conflict.mine)}</Label>
        </Row>
        <Row gap={spacing.sm}>
          <Chip label="Office set" tone="info" />
          <Label variant="body">{formatValue(conflict.field, conflict.theirs)}</Label>
        </Row>
      </View>
      <Row gap={spacing.sm}>
        <Button
          label="Keep mine"
          variant="primary"
          style={{ flex: 1 }}
          onPress={() => onResolve("keep_mine")}
          accessibilityHint="Keeps your value and sends it to the office"
        />
        <Button
          label="Use theirs"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => onResolve("keep_theirs")}
          accessibilityHint="Accepts the office's value and discards yours"
        />
      </Row>
    </Card>
  );
}
