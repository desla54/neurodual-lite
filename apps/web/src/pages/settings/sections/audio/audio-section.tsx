/**
 * Audio settings section
 * - Audio language (letters pronunciation)
 * - Voice selection
 * - Sound effects toggle
 * - Audio sync preset
 * - Texture level slider + 3-letter preview
 *
 * Note: Audio language and voice are also in LanguageSection (intentional duplication)
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Microphone, SpeakerHigh } from '@phosphor-icons/react';
import {
  Card,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
} from '@neurodual/ui';
import { useSettingsStore } from '../../../../stores';
import { audioLanguages, voiceOptions } from '../../config';

export function AudioSection(): ReactNode {
  const { t } = useTranslation();

  // Audio language
  const audioLanguage = useSettingsStore((s) => s.ui.audioLanguage);
  const setAudioLanguage = useSettingsStore((s) => s.setAudioLanguage);

  // Voice
  const voiceId = useSettingsStore((s) => s.ui.voiceId);
  const setVoiceId = useSettingsStore((s) => s.setVoiceId);
  const normalizedVoiceId = voiceId === 2 ? 2 : 1;

  // Sound effects
  const buttonSoundsEnabled = useSettingsStore((s) => s.ui.buttonSoundsEnabled);
  const setButtonSoundsEnabled = useSettingsStore((s) => s.setButtonSoundsEnabled);

  const feedbackSoundsEnabled = useSettingsStore((s) => s.ui.soundEnabled);
  const setFeedbackSoundsEnabled = useSettingsStore((s) => s.setSoundEnabled);

  return (
    <div className="space-y-6">
      <Section title={t('settings.audio.title', 'Audio')}>
        <Card className="space-y-0 divide-y divide-border">
          {/* Audio Language */}
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl shrink-0 bg-audio/10 text-audio">
                <Globe size={20} weight="regular" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-foreground">{t('settings.audio.audioLanguage')}</div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5">
                  {t('settings.audio.pronouncedLetters')}
                </div>
              </div>
            </div>
            <Select value={audioLanguage} onValueChange={setAudioLanguage}>
              <SelectTrigger
                className="w-auto shrink-0 h-10"
                aria-label={t('settings.audio.audioLanguage')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('settings.audio.auto')}</SelectItem>
                {audioLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Voice Selector */}
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl shrink-0 bg-audio/10 text-audio">
                <Microphone size={20} weight="regular" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-foreground">{t('settings.audio.voice')}</div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5">
                  {t('settings.audio.voiceType')}
                </div>
              </div>
            </div>
            <Select value={String(normalizedVoiceId)} onValueChange={(v) => setVoiceId(Number(v))}>
              <SelectTrigger
                className="w-auto shrink-0 h-10"
                aria-label={t('settings.audio.voice')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voiceOptions.map((voice) => (
                  <SelectItem key={voice.id} value={String(voice.id)}>
                    {t(voice.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      </Section>

      <Section title={t('settings.audio.soundEffects')}>
        <Card className="space-y-0 divide-y divide-border">
          {/* UI Click Sounds */}
          <Toggle
            label={t('settings.audio.buttonSounds')}
            description={t('settings.audio.buttonSoundsDesc')}
            checked={buttonSoundsEnabled}
            onChange={setButtonSoundsEnabled}
            icon={<SpeakerHigh size={20} weight="regular" />}
            activeColor="audio"
          />

          {/* Feedback Sounds */}
          <Toggle
            label={t('settings.audio.feedbackSounds')}
            description={t('settings.audio.feedbackSoundsDesc')}
            checked={feedbackSoundsEnabled}
            onChange={setFeedbackSoundsEnabled}
            icon={<SpeakerHigh size={20} weight="regular" />}
            activeColor="audio"
          />
        </Card>
      </Section>

      {/* Audio Sync Preset section removed — sync presets are no longer supported */}
    </div>
  );
}
