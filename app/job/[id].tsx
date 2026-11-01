import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { MIN_COMPLETION_NOTES, nextStatuses, validateCompletion } from "@/domain/jobs";
import { JOB_PRIORITIES, type ChecklistItem } from "@/domain/types";
import { useApp, useJob } from "@/state/app-context";
import { radius, spacing, useTheme } from "@/theme";
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
import {
  ChecklistProgress,
  JobMeta,
  priorityLabel,
  statusLabel,
  timeLabel,
} from "@/ui/job-bits";
import { useNow } from "@/ui/use-now";

/**
 * Job detail.
 *
 * Every control here writes to the device first and returns immediately; the
 * queue deals with the network. The only thing that is ever blocked is a
 * completion that fails the domain rules, and that is blocked *locally* — a
 * technician must find out the paperwork is incomplete while they are still
 * on site, not when the queue drains that evening.
 */
export default function JobScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const job = useJob(params.id);
  const { mutate, conditions, sync } = useApp();

  const [note, setNote] = useState("");
  const [completion, setCompletion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const now = useNow();

  if (!job) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Job" }} />
        <EmptyState
          title="Job not found"
          body="It may have been reassigned, or removed from this device."
        />
      </Screen>
    );
  }

  const run = async (
    kind: Parameters<typeof mutate>[1],
    payload: Record<string, unknown>,
    onDone?: () => void,
  ) => {
    setSaving(true);
    setError(null);
    const result = await mutate(job.id, kind, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    onDone?.();
  };

  const draft = { ...job, completionNotes: completion };
  const completionCheck = validateCompletion(draft);
  const transitions = nextStatuses(job.status);

  return (
    <Screen>
      <Stack.Screen options={{ title: job.reference }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {conditions.offline ? (
          <Banner
            tone="warn"
            title="Offline"
            body="Your changes are saved here and will send when you have signal."
          />
        ) : null}

        {error ? <Banner tone="bad" title="That change was not applied" body={error} /> : null}

        <Card style={{ gap: spacing.sm }}>
          <Label variant="display">{job.title}</Label>
          <Label variant="body" tone="muted">
            {job.customerName}
          </Label>
          <Label variant="caption" tone="muted">
            {job.siteAddress}
          </Label>
          <Row gap={spacing.sm} wrap>
            <Label variant="caption" tone="subtle">
              Scheduled {timeLabel(job.scheduledFor, now)}
            </Label>
            <Label variant="caption" tone="subtle">
              · revision {job.rev}
            </Label>
          </Row>
          <JobMeta job={job} now={now} />
          <ChecklistProgress job={job} />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Label variant="title">Status</Label>
          {transitions.length === 0 ? (
            <Label variant="caption" tone="muted">
              This job is {statusLabel(job.status).toLowerCase()}. Reopening it is a
              back-office action.
            </Label>
          ) : (
            <>
              <Label variant="caption" tone="muted">
                Only the transitions that make sense from here are offered.
              </Label>
              <Row gap={spacing.xs} wrap>
                {transitions.map((status) => (
                  <Button
                    key={status}
                    label={statusLabel(status)}
                    variant="secondary"
                    disabled={saving}
                    onPress={() => void run("set_status", { status })}
                    style={{ minHeight: 44 }}
                  />
                ))}
              </Row>
            </>
          )}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Label variant="title">Priority</Label>
          <Label variant="caption" tone="muted">
            Raise this if what you have found on site is worse than the job was
            booked as.
          </Label>
          <Row gap={spacing.xs} wrap>
            {JOB_PRIORITIES.map((priority) => (
              <Button
                key={priority}
                label={priorityLabel(priority)}
                variant={job.priority === priority ? "primary" : "secondary"}
                disabled={saving || job.priority === priority}
                onPress={() => void run("set_priority", { priority })}
                style={{ minHeight: 44 }}
              />
            ))}
          </Row>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Label variant="title">Checklist</Label>
          {job.checklist.length === 0 ? (
            <Label variant="caption" tone="muted">
              No checklist on this job.
            </Label>
          ) : (
            job.checklist.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                disabled={saving}
                onToggle={() =>
                  void run("toggle_checklist", { itemId: item.id, done: !item.done })
                }
              />
            ))
          )}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Label variant="title">Notes ({job.notes.length})</Label>
          {job.notes.map((entry) => (
            <View key={entry.id} style={{ gap: 2 }}>
              <Label variant="body">{entry.body}</Label>
              <Label variant="caption" tone="subtle">
                {entry.authorName} · {timeLabel(entry.createdAt, now)}
              </Label>
              <Divider />
            </View>
          ))}

          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Add a note for the office or the next visit"
            placeholderTextColor={theme.colors.textSubtle}
            accessibilityLabel="New note"
            style={{
              minHeight: 80,
              borderRadius: radius.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.borderStrong,
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
              padding: spacing.md,
              fontSize: 15,
              textAlignVertical: "top",
            }}
          />
          <Button
            label="Add note"
            variant="secondary"
            disabled={saving || note.trim().length < 3}
            onPress={() =>
              void run(
                "add_note",
                {
                  note: {
                    id: `note_${Date.now().toString(36)}`,
                    body: note.trim(),
                    authorName: "Morgan Hale",
                    createdAt: new Date().toISOString(),
                  },
                },
                () => setNote(""),
              )
            }
          />
        </Card>

        {job.status !== "completed" && job.status !== "cancelled" ? (
          <Card style={{ gap: spacing.md }}>
            <Label variant="title">Complete this job</Label>
            <Label variant="caption" tone="muted">
              Checked on this device, so you find out now rather than when the queue
              sends tonight.
            </Label>

            <TextInput
              value={completion}
              onChangeText={setCompletion}
              multiline
              placeholder="What did you do? At least 15 characters."
              placeholderTextColor={theme.colors.textSubtle}
              accessibilityLabel="Completion write-up"
              accessibilityHint={`Required, at least ${MIN_COMPLETION_NOTES} characters`}
              style={{
                minHeight: 96,
                borderRadius: radius.md,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: completionCheck.errors.completionNotes
                  ? theme.colors.badBorder
                  : theme.colors.borderStrong,
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                padding: spacing.md,
                fontSize: 15,
                textAlignVertical: "top",
              }}
            />

            {completion.length > 0 || completionCheck.errors.checklist ? (
              <View style={{ gap: spacing.xs }}>
                {Object.entries(completionCheck.errors).map(([field, message]) => (
                  <Row key={field} gap={spacing.xs}>
                    <Chip label="Needed" tone="warn" glyph="!" />
                    <Label variant="caption" tone="muted" style={{ flex: 1 }}>
                      {message}
                    </Label>
                  </Row>
                ))}
              </View>
            ) : null}

            <Button
              label="Mark complete"
              variant="primary"
              loading={saving}
              disabled={!completionCheck.ok || saving}
              testID="complete-job"
              onPress={() =>
                void run("complete_job", { completionNotes: completion.trim() }, () =>
                  setCompletion(""),
                )
              }
            />
          </Card>
        ) : (
          <Card style={{ gap: spacing.sm }}>
            <Label variant="title">Write-up</Label>
            <Label variant="body" tone="muted">
              {job.completionNotes || "No write-up recorded."}
            </Label>
          </Card>
        )}

        {sync.pending > 0 ? (
          <Label variant="caption" tone="subtle" style={{ textAlign: "center" }}>
            {sync.pending} change{sync.pending === 1 ? "" : "s"} waiting to send.
          </Label>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function ChecklistRow({
  item,
  disabled,
  onToggle,
}: {
  item: ChecklistItem;
  disabled: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.done, disabled }}
      accessibilityLabel={`${item.label}${item.required ? ", required" : ", optional"}`}
      disabled={disabled}
      onPress={onToggle}
      testID={`checklist-${item.id}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 44,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.sm,
          borderWidth: 2,
          alignItems: "center",
          justifyContent: "center",
          borderColor: item.done ? theme.colors.accent : theme.colors.borderStrong,
          backgroundColor: item.done ? theme.colors.accent : "transparent",
        }}
      >
        {item.done ? (
          <Label variant="caption" style={{ color: theme.colors.accentText }}>
            ✓
          </Label>
        ) : null}
      </View>
      <Label variant="body" style={{ flex: 1 }} tone={item.done ? "muted" : "default"}>
        {item.label}
      </Label>
      {item.required ? <Chip label="Required" tone="neutral" /> : null}
    </Pressable>
  );
}
