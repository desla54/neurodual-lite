/**
 * Result of reading a stream from the event store.
 */
export type ReadStreamResult = {
  readonly currentStreamVersion: bigint;
  readonly streamExists: boolean;
  readonly events: readonly unknown[];
};

export interface CommandMetadata {
  readonly commandId: string;
  readonly timestamp: Date;
  readonly causationId?: string;
  readonly correlationId?: string;
  readonly userId?: string;
}

export type CommandBusPort = {
  handle(command: {
    readonly type: string;
    readonly data: Record<string, unknown>;
    readonly metadata: CommandMetadata;
  }): Promise<unknown>;

  /**
   * Read events from a stream, returning the current stream version and events.
   * Used during recovery to initialize the stream version from the authoritative source.
   */
  readStream?(args: {
    readonly streamId: { readonly aggregateId: string; readonly aggregateType: string };
    readonly fromVersion?: bigint;
    readonly maxCount?: bigint;
  }): Promise<ReadStreamResult>;
};
