import i18n from '../../i18n';

const EMOTION_EMOJI: Record<string, string> = {
  joy: '😊',
  sadness: '😢',
  anger: '😠',
  fear: '😨',
  disgust: '🤢',
  surprise: '😲',
  contempt: '😏',
  neutral: '😐',
};

const TONE_DISPLAY: Record<string, string> = {
  C4: 'Do',
  D4: 'Re',
  E4: 'Mi',
  F4: 'Fa',
  G4: 'Sol',
  A4: 'La',
  B4: 'Si',
  C5: 'Do+',
};

function getWordDisplayLabel(value: string, language?: string): string {
  switch (value) {
    case 'word-hand':
      return i18n.t('game.dualTrack.wordLabels.hand', { lng: language, defaultValue: 'hand' });
    case 'word-cat':
      return i18n.t('game.dualTrack.wordLabels.cat', { lng: language, defaultValue: 'cat' });
    case 'word-moon':
      return i18n.t('game.dualTrack.wordLabels.moon', { lng: language, defaultValue: 'moon' });
    case 'word-fire':
      return i18n.t('game.dualTrack.wordLabels.fire', { lng: language, defaultValue: 'fire' });
    case 'word-water':
      return i18n.t('game.dualTrack.wordLabels.water', {
        lng: language,
        defaultValue: 'water',
      });
    case 'word-king':
      return i18n.t('game.dualTrack.wordLabels.king', { lng: language, defaultValue: 'king' });
    case 'word-key':
      return i18n.t('game.dualTrack.wordLabels.key', { lng: language, defaultValue: 'key' });
    case 'word-wind':
      return i18n.t('game.dualTrack.wordLabels.wind', { lng: language, defaultValue: 'wind' });
    default:
      return value;
  }
}

export function getStimulusDisplayLabel(value: string, language?: string): string {
  if (/^\d$/.test(value)) return value;
  const toneLabel = TONE_DISPLAY[value];
  if (toneLabel) return toneLabel;

  const emotionLabel = EMOTION_EMOJI[value];
  if (emotionLabel) return emotionLabel;

  return getWordDisplayLabel(value, language);
}

export function getStimulusTextFontSize(label: string): number {
  if (label.length <= 2) return 16;
  if (label.length <= 4) return 10;
  return 8;
}
