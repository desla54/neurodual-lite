import type { TutorialRecoveryCheckResult, TutorialRecoverySnapshot } from '../types/recovery';

export interface TutorialRecoveryPort {
  saveTutorialRecoverySnapshot(snapshot: TutorialRecoverySnapshot): void;
  clearTutorialRecoverySnapshot(): void;
  checkForRecoverableTutorial(): TutorialRecoveryCheckResult;
  createTutorialRecoverySnapshot(tutorialId: string, stepIndex: number): TutorialRecoverySnapshot;
}
