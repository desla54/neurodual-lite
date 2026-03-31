export interface TimelineItem {
  /** Unique ID for Flip tracking */
  id: string;
  /** Turn index in the sequence */
  turn: number;
  /** Position index (0-8) */
  position: number;
  /** Sound letter */
  letter: string;
}

export type {
  ExpectedClassification,
  PositionClassification,
  SoundClassification,
} from '@neurodual/logic';
