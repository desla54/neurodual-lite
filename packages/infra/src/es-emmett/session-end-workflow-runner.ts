/**
 * Stub — SessionEndWorkflowRunner kept for backward compatibility.
 * Badge/XP computation is now handled inline by DirectCommandBus/SessionWriter.
 */

export class SessionEndWorkflowRunner {
  constructor(..._args: unknown[]) {
    // No-op
  }

  async onSessionEnded(_args: unknown): Promise<void> {
    // No-op: handled inline by DirectCommandBus
  }
}
