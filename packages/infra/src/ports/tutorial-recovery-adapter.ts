import type { TutorialRecoveryPort } from '@neurodual/logic';
import {
  checkForRecoverableTutorial,
  clearTutorialRecoverySnapshot,
  createTutorialRecoverySnapshot,
  saveTutorialRecoverySnapshot,
} from '../lifecycle/tutorial-recovery';

export const tutorialRecoveryAdapter: TutorialRecoveryPort = {
  saveTutorialRecoverySnapshot,
  clearTutorialRecoverySnapshot,
  checkForRecoverableTutorial,
  createTutorialRecoverySnapshot,
};
