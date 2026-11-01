import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";

import { compareJobs, isOverdue, isTerminal } from "@/domain/jobs";
import type { Job } from "@/domain/types";
import { useApp } from "@/state/app-context";
import { radius, spacing, useTheme } from "@/theme";
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  Label,
  Row,
  Screen,
} from "@/ui/components";
import { ChecklistProgress, JobMeta, timeLabel } from "@/ui/job-bits";
import { useNow } from "@/ui/use-now";

type Filter = "open" | "today" | "overdue" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "today", label: "Today" },
  { id: "overdue", label: "Overdue" },
  { id: "all", label: "All" },
];

function sameDay(iso: string, now: number): boolean {
  const a = new Date(iso);
  const b = new Date(now);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * The technician's work list.
 *
 * Reads entirely from the local store, so it renders instantly on launch and
 * is identical with or without signal. Filtering and search are local too —
 * a list that needs the network to filter is useless in a plant room.
 */
export default function WorkScreen() {
  const theme = useTheme();
  const { jobs, ready, sync, conditions, syncNow, busy } = useApp();
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");

  const now = useNow();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs
      .filter((job) => {
        if (filter === "open" && isTerminal(job.status)) return false;
        if (filter === "today" && !sameDay(job.scheduledFor, now)) return false;
        if (filter === "overdue" && !isOverdue(job, now)) return false;
        if (!needle) return true;
        return (
          job.title.toLowerCase().includes(needle) ||
          job.reference.toLowerCase().includes(needle) ||
          job.customerName.toLowerCase().includes(needle) ||
          job.siteAddress.toLowerCase().includes(needle)
        );
      })
      .sort(compareJobs);
  }, [jobs, filter, query, now]);

  if (!ready) {
    return (
      <Screen>
        <EmptyState title="Loading your work…" body="Reading the jobs stored on this device." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {conditions.offline ? (
          <Banner
            tone="warn"
            title="Working offline"
            body={
              sync.pending > 0
                ? `${sync.pending} change${sync.pending === 1 ? "" : "s"} saved on this device and waiting to send.`
                : "Everything you do is saved on this device and will send when you have signal."
            }
          />
        ) : null}

        {sync.conflicts > 0 ? (
          <Banner
            tone="bad"
            title={`${sync.conflicts} change${sync.conflicts === 1 ? "" : "s"} need your decision`}
            body="The office changed the same thing you did. Open Sync to choose."
          />
        ) : null}

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search job, reference, customer or site"
          placeholderTextColor={theme.colors.textSubtle}
          accessibilityLabel="Search your jobs"
          returnKeyType="search"
          style={{
            minHeight: 44,
            borderRadius: radius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surface,
            color: theme.colors.text,
            paddingHorizontal: spacing.md,
            fontSize: 15,
          }}
        />

        <Row gap={spacing.xs} wrap>
          {FILTERS.map((entry) => {
            const active = filter === entry.id;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${entry.label} jobs`}
                onPress={() => setFilter(entry.id)}
                style={{
                  minHeight: 36,
                  justifyContent: "center",
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderWidth: StyleSheet.hairlineWidth,
                  backgroundColor: active ? theme.colors.accentTint : theme.colors.surface,
                  borderColor: active ? theme.colors.accentTint : theme.colors.border,
                }}
              >
                <Label
                  variant="label"
                  tone={active ? "accent" : "muted"}
                >
                  {entry.label}
                </Label>
              </Pressable>
            );
          })}
          <Button
            label={busy ? "Syncing…" : "Sync"}
            variant="secondary"
            loading={busy}
            onPress={() => void syncNow()}
            accessibilityHint="Send queued changes and fetch updates from the office"
            style={{ marginLeft: "auto", minHeight: 36, paddingVertical: spacing.xs }}
          />
        </Row>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(job) => job.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
        ListEmptyComponent={
          <EmptyState
            title="Nothing here"
            body={
              query
                ? "No job matches that search."
                : "No jobs in this view. Try a different filter."
            }
          />
        }
        renderItem={({ item }) => <JobRow job={item} now={now} />}
      />
    </Screen>
  );
}

function JobRow({ job, now }: { job: Job; now: number }) {
  const theme = useTheme();
  return (
    <Link href={`/job/${job.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${job.title}, ${job.customerName}, reference ${job.reference}`}
        accessibilityHint="Opens the job"
        testID={`job-row-${job.id}`}
        style={({ pressed }) => ({
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.sm,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Row>
          <Label variant="label" tone="muted">
            {job.reference}
          </Label>
          <Label variant="caption" tone="subtle" style={{ marginLeft: "auto" }}>
            {timeLabel(job.scheduledFor, now)}
          </Label>
        </Row>

        <Label variant="title" numberOfLines={2}>
          {job.title}
        </Label>
        <Label variant="caption" tone="muted" numberOfLines={1}>
          {job.customerName} · {job.siteAddress}
        </Label>

        <JobMeta job={job} now={now} />
        <ChecklistProgress job={job} />

        {job.notes.length > 0 ? (
          <Chip label={`${job.notes.length} note${job.notes.length === 1 ? "" : "s"}`} />
        ) : null}
      </Pressable>
    </Link>
  );
}
