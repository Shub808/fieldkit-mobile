import { ScrollView, Switch, View } from "react-native";

import { useApp } from "@/state/app-context";
import { spacing, useTheme } from "@/theme";
import {
  Banner,
  Button,
  Card,
  Divider,
  Label,
  Row,
  Screen,
} from "@/ui/components";

/**
 * Field conditions.
 *
 * There is no real backend behind this app, and the honest way to present
 * that is to make the fake one controllable. These switches drive the
 * simulated server, so a reviewer can pull the plug, add latency, make a
 * third of requests fail, or have the office edit a job behind the
 * technician's back — and then watch the queue, the retries and the conflict
 * resolution actually deal with it.
 *
 * Everything here is a demo affordance, and the screen says so.
 */
export default function ConditionsScreen() {
  const theme = useTheme();
  const { conditions, setConditions, jobs, simulateOfficeEdit, resetDemo, busy } =
    useApp();

  const firstOpenJob = jobs.find(
    (job) => job.status !== "completed" && job.status !== "cancelled",
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Banner
          tone="info"
          title="Demo controls"
          body="This build talks to a simulated office server running inside the app. These switches change how that server behaves so the offline and conflict behaviour can be seen on purpose."
        />

        <Card style={{ gap: spacing.md }}>
          <Label variant="title">Connection</Label>

          <Row>
            <View style={{ flex: 1, gap: 2 }}>
              <Label variant="label">Offline</Label>
              <Label variant="caption" tone="muted">
                Every request fails as if there were no signal. The app keeps
                working from the device.
              </Label>
            </View>
            <Switch
              value={conditions.offline}
              onValueChange={(offline) => setConditions({ offline })}
              accessibilityLabel="Simulate being offline"
              trackColor={{ true: theme.colors.accent, false: theme.colors.borderStrong }}
            />
          </Row>

          <Divider />

          <View style={{ gap: spacing.sm }}>
            <Label variant="label">Latency</Label>
            <Label variant="caption" tone="muted">
              Currently {conditions.latencyMs} ms per request.
            </Label>
            <Row gap={spacing.xs} wrap>
              {[0, 250, 1200, 3000].map((latencyMs) => (
                <Button
                  key={latencyMs}
                  label={latencyMs === 0 ? "Instant" : `${latencyMs} ms`}
                  variant={conditions.latencyMs === latencyMs ? "primary" : "secondary"}
                  onPress={() => setConditions({ latencyMs })}
                  style={{ minHeight: 40, paddingVertical: spacing.sm }}
                />
              ))}
            </Row>
          </View>

          <Divider />

          <View style={{ gap: spacing.sm }}>
            <Label variant="label">Request failures</Label>
            <Label variant="caption" tone="muted">
              {Math.round(conditions.failureRate * 100)}% of requests return a 503,
              which the queue retries with exponential backoff.
            </Label>
            <Row gap={spacing.xs} wrap>
              {[0, 0.3, 0.7, 1].map((failureRate) => (
                <Button
                  key={failureRate}
                  label={`${Math.round(failureRate * 100)}%`}
                  variant={conditions.failureRate === failureRate ? "primary" : "secondary"}
                  onPress={() => setConditions({ failureRate })}
                  style={{ minHeight: 40, paddingVertical: spacing.sm }}
                />
              ))}
            </Row>
          </View>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Label variant="title">The office</Label>
          <Label variant="caption" tone="muted">
            Changes a job on the server without telling the device — the situation
            that produces a real conflict. Change the same job on this device
            first, then sync.
          </Label>
          <Button
            label={
              firstOpenJob
                ? `Office edits “${firstOpenJob.title}”`
                : "No open job to edit"
            }
            variant="secondary"
            disabled={!firstOpenJob}
            onPress={() => firstOpenJob && void simulateOfficeEdit(firstOpenJob.id)}
            accessibilityHint="Raises or lowers that job&rsquo;s priority on the server only"
          />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Label variant="title">Reset</Label>
          <Label variant="caption" tone="muted">
            Clears everything stored on this device and re-seeds the day&rsquo;s work.
          </Label>
          <Button
            label="Reset demo data"
            variant="danger"
            loading={busy}
            onPress={() => void resetDemo()}
          />
        </Card>

        <Label variant="caption" tone="subtle">
          FieldKit is a personal portfolio project. Every customer, address and
          name in it is invented.
        </Label>
      </ScrollView>
    </Screen>
  );
}
