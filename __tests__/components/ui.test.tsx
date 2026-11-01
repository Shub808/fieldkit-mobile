import { render, screen } from "@testing-library/react-native";

import type { Job } from "@/domain/types";
import { MIN_TOUCH_TARGET, Banner, Button, Chip, Label } from "@/ui/components";
import {
  ChecklistProgress,
  OverdueChip,
  PriorityChip,
  StatusChip,
  timeLabel,
} from "@/ui/job-bits";

/**
 * React Native Testing Library v14's `render` is asynchronous — it awaits
 * React 19's concurrent render before returning the queries. Forgetting the
 * `await` silently yields a Promise with no query methods on it, which is a
 * confusing failure the first time you meet it.
 */
const NOW = Date.parse("2026-10-27T12:00:00.000Z");

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_001",
    reference: "FK-2400",
    title: "Annual boiler service",
    customerName: "Harbour Point Retail",
    siteAddress: "14 Quayside Parade, Bristol",
    scheduledFor: "2026-10-27T09:00:00.000Z",
    priority: "normal",
    status: "on_site",
    assigneeId: "tech_morgan",
    checklist: [
      { id: "c1", label: "Isolate supply", required: true, done: true },
      { id: "c2", label: "Photograph", required: true, done: false },
      { id: "c3", label: "Tidy up", required: false, done: false },
    ],
    notes: [],
    completionNotes: "",
    updatedAt: "2026-10-27T07:00:00.000Z",
    rev: 1,
    ...overrides,
  };
}

describe("Button", () => {
  it("exposes a button role and its label", async () => {
    await render(<Button label="Mark complete" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Mark complete" })).toBeTruthy();
  });

  it("meets the minimum touch target", async () => {
    // 44pt is the smallest target that is reliably hittable with gloves on.
    await render(<Button label="Sync" onPress={() => {}} testID="sync" />);
    const styles = screen.getByTestId("sync").props.style;
    const flat = Array.isArray(styles) ? Object.assign({}, ...styles.flat()) : styles;
    expect(flat.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it("announces disabled and busy state rather than only looking different", async () => {
    await render(<Button label="Sync" onPress={() => {}} disabled testID="b" />);
    expect(screen.getByTestId("b").props.accessibilityState).toMatchObject({ disabled: true });

    await screen.rerender(<Button label="Sync" onPress={() => {}} loading testID="b" />);
    expect(screen.getByTestId("b").props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it("does not fire while disabled", async () => {
    const onPress = jest.fn();
    await render(<Button label="Sync" onPress={onPress} disabled testID="sync" />);
    screen.getByTestId("sync").props.onPress?.();
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("status and priority chips", () => {
  it("renders a word, not just a colour, for every status", async () => {
    const expected: [Job["status"], string][] = [
      ["scheduled", "Scheduled"],
      ["en_route", "En route"],
      ["on_site", "On site"],
      ["blocked", "Blocked"],
      ["completed", "Completed"],
      ["cancelled", "Cancelled"],
    ];
    for (const [status, label] of expected) {
      await render(<StatusChip status={status} />);
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("renders a word for every priority", async () => {
    for (const [priority, label] of [
      ["low", "Low"],
      ["normal", "Normal"],
      ["high", "High"],
      ["emergency", "Emergency"],
    ] as [Job["priority"], string][]) {
      await render(<PriorityChip priority={priority} />);
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("hides the decorative glyph from assistive technology", async () => {
    await render(<Chip label="Blocked" tone="warn" glyph="!" />);
    // The word carries the meaning; the glyph is redundancy for sighted users
    // in sunlight, not something to read aloud.
    // The glyph is only findable with hidden elements included — which is
    // precisely the assertion: a screen reader does not reach it.
    expect(screen.queryByText("!")).toBeNull();
    expect(
      screen.getByText("!", { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
    expect(screen.getByText("Blocked")).toBeTruthy();
  });
});

describe("OverdueChip", () => {
  it("appears for an open job whose slot has passed", async () => {
    await render(
      <OverdueChip job={job({ scheduledFor: "2026-10-26T09:00:00.000Z" })} now={NOW} />,
    );
    expect(screen.getByText("Overdue")).toBeTruthy();
  });

  it("stays away for finished work", async () => {
    await render(
      <OverdueChip
        job={job({ status: "completed", scheduledFor: "2020-01-01T09:00:00.000Z" })}
        now={NOW}
      />,
    );
    expect(screen.queryByText("Overdue")).toBeNull();
  });
});

describe("ChecklistProgress", () => {
  it("shows the numbers as well as the bar", async () => {
    // A bar on its own is a shape, not a value.
    await render(<ChecklistProgress job={job()} />);
    expect(screen.getByText("Checklist 1 of 3")).toBeTruthy();
    expect(screen.getByText("1 required outstanding")).toBeTruthy();
  });

  it("exposes its value to assistive technology", async () => {
    await render(<ChecklistProgress job={job()} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.props.accessibilityValue).toMatchObject({ min: 0, max: 3, now: 1 });
  });

  it("does not divide by zero on an empty checklist", async () => {
    await render(<ChecklistProgress job={job({ checklist: [] })} />);
    expect(screen.getByText("Checklist 0 of 0")).toBeTruthy();
  });
});

describe("Banner", () => {
  it("is announced as an alert", async () => {
    await render(
      <Banner tone="warn" title="Working offline" body="Saved on this device." />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Working offline")).toBeTruthy();
  });
});

describe("Label", () => {
  it("renders its children", async () => {
    await render(<Label variant="title">Job detail</Label>);
    expect(screen.getByText("Job detail")).toBeTruthy();
  });
});

describe("timeLabel", () => {
  it("describes the near future and the near past", async () => {
    expect(timeLabel("2026-10-27T12:00:00.000Z", NOW)).toBe("now");
    expect(timeLabel("2026-10-27T12:25:00.000Z", NOW)).toBe("in 25m");
    expect(timeLabel("2026-10-27T11:30:00.000Z", NOW)).toBe("30m ago");
  });

  it("switches to hours and days", async () => {
    expect(timeLabel("2026-10-27T18:00:00.000Z", NOW)).toBe("in 6h");
    expect(timeLabel("2026-10-25T12:00:00.000Z", NOW)).toBe("2d ago");
  });

  it("does not throw on an unparseable timestamp", async () => {
    expect(timeLabel("not-a-date", NOW)).toBe("unknown");
  });
});
