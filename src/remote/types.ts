import type { Job, Mutation } from "@/domain/types";

export class NetworkError extends Error {
  constructor(message = "No connection") {
    super(message);
    this.name = "NetworkError";
  }
}

export class ServerError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ServerError";
    this.status = status;
  }
}

export type PushResult =
  /** Applied. The job carries the new server revision. */
  | { status: "applied"; job: Job }
  /** The device was working from an outdated revision. */
  | { status: "conflict"; serverJob: Job }
  /** The mutation is invalid and will never succeed; do not retry it. */
  | { status: "rejected"; reason: string; serverJob: Job | null };

export interface RemoteApi {
  /** Jobs changed at or after `since`, or everything when `since` is null. */
  pull(since: string | null): Promise<Job[]>;
  push(mutation: Mutation): Promise<PushResult>;
}
