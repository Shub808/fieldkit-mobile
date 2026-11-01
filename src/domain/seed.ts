import type { ChecklistItem, Job } from "@/domain/types";

/**
 * Deterministic demo data.
 *
 * Generated from a fixed seed so the device, the simulated server and the
 * test suite all see the same jobs. Every customer, address and name is
 * invented; nothing here comes from a real company or a real person.
 */

function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TITLES = [
  "Annual boiler service",
  "Replace faulty RCD",
  "Emergency leak — plant room",
  "Install smart meter",
  "Quarterly HVAC inspection",
  "Repair roller shutter motor",
  "Cold store temperature alarm",
  "Fire panel fault — zone 4",
  "Lift door sensor alignment",
  "Pump seal replacement",
  "Electrical safety certificate",
  "Replace damaged ceiling tiles",
] as const;

const CUSTOMERS = [
  ["Harbour Point Retail", "14 Quayside Parade, Bristol"],
  ["Elmwood Care Home", "3 Elmwood Rise, Leeds"],
  ["Northgate Logistics", "Unit 7, Northgate Industrial Park, Hull"],
  ["Cedar Lane Primary", "Cedar Lane, Sheffield"],
  ["Riverside Hotel", "22 Riverside Walk, York"],
  ["Pinehurst Offices", "Pinehurst Business Centre, Derby"],
  ["Mallow Street Pharmacy", "8 Mallow Street, Nottingham"],
  ["Kingsway Leisure Centre", "Kingsway, Coventry"],
] as const;

const CHECKLISTS: readonly (readonly [string, boolean])[][] = [
  [
    ["Isolate supply and confirm dead", true],
    ["Photograph the installation before work", true],
    ["Complete the works", true],
    ["Test and confirm safe operation", true],
    ["Tidy the work area", false],
  ],
  [
    ["Sign in at reception", true],
    ["Review the site risk assessment", true],
    ["Carry out the inspection", true],
    ["Record readings", true],
    ["Brief the site contact", false],
  ],
  [
    ["Confirm the fault with the site contact", true],
    ["Make safe", true],
    ["Order parts if required", false],
    ["Complete the repair", true],
  ],
];

const DAY_MS = 86_400_000;

export const SEED_TECHNICIAN = {
  id: "tech_morgan",
  name: "Morgan Hale",
  role: "Field technician",
} as const;

/** `nowMs` is a parameter so the fixture is stable in tests and screenshots. */
export function buildSeedJobs(
  nowMs = Date.parse("2026-10-27T08:00:00.000Z"),
  seed = 20_261_027,
): Job[] {
  const rng = createRng(seed);
  const jobs: Job[] = [];

  for (let i = 0; i < 14; i += 1) {
    const [customerName, siteAddress] = CUSTOMERS[i % CUSTOMERS.length]!;
    const template = CHECKLISTS[i % CHECKLISTS.length]!;
    const checklist: ChecklistItem[] = template.map(([label, required], index) => ({
      id: `chk_${i + 1}_${index + 1}`,
      label,
      required,
      // A couple of early jobs arrive part-done, which is what a real
      // handover looks like.
      done: i < 2 && index < 2,
    }));

    // A spread of overdue, today and upcoming work.
    const offsetDays = i < 3 ? -(i + 1) : i < 9 ? 0 : i - 8;
    const hour = 8 + (i % 9);
    const scheduled = new Date(
      Math.floor(nowMs / DAY_MS) * DAY_MS + offsetDays * DAY_MS + hour * 3_600_000,
    );

    const status =
      i === 0
        ? "on_site"
        : i === 1
          ? "en_route"
          : i === 2
            ? "blocked"
            : i >= 12
              ? "completed"
              : "scheduled";

    jobs.push({
      id: `job_${String(i + 1).padStart(3, "0")}`,
      reference: `FK-${2400 + i}`,
      title: TITLES[i % TITLES.length]!,
      customerName,
      siteAddress,
      scheduledFor: scheduled.toISOString(),
      priority:
        i === 2 ? "emergency" : i % 4 === 0 ? "high" : i % 3 === 0 ? "low" : "normal",
      status,
      assigneeId: SEED_TECHNICIAN.id,
      checklist:
        status === "completed"
          ? checklist.map((item) => ({ ...item, done: true }))
          : checklist,
      notes:
        i === 2
          ? [
              {
                id: `note_${i}_1`,
                body: "Site contact says the isolation valve is seized. Needs a second pair of hands and a new valve before we can proceed.",
                authorName: SEED_TECHNICIAN.name,
                createdAt: new Date(nowMs - 3 * 3_600_000).toISOString(),
              },
            ]
          : [],
      completionNotes:
        status === "completed"
          ? "Unit serviced, filters replaced and operation confirmed with the site contact."
          : "",
      updatedAt: new Date(nowMs - Math.floor(rng() * 48) * 3_600_000).toISOString(),
      rev: 1,
    });
  }

  return jobs;
}
