/**
 * Language settings section
 * - Interface language
 * - Audio language (letters pronunciation)
 * - Voice selection
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Microphone, Translate } from '@phosphor-icons/react';
import {
  Card,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neurodual/ui';
import { useSettingsStore } from '../../../../stores';
import { supportedLanguages } from '../../../../locales';
import { audioLanguages, voiceOptions } from '../../config';

export function LanguageSection(): ReactNode {
  const { t } = useTranslation();

  // Interface language
  const language = useSettingsStore((s) => s.ui.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  // Audio language
  const audioLanguage = useSettingsStore((s) => s.ui.audioLanguage);
  const setAudioLanguage = useSettingsStore((s) => s.setAudioLanguage);

  // Voice
  const voiceId = useSettingsStore((s) => s.ui.voiceId);
  const setVoiceId = useSettingsStore((s) => s.setVoiceId);
  const normalizedVoiceId = voiceId === 2 ? 2 : 1;

  return (
    <div className="space-y-6">
      <Section title={t('settings.language.title', 'Langue')}>
        <Card className="space-y-0 divide-y divide-border">
          {/* Interface Language */}
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl shrink-0 bg-primary/10 text-primary">
                <Translate size={20} weight="regular" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-foreground">{t('settings.language.interface')}</div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5">
                  {t('settings.language.appLanguage')}
                </div>
              </div>
            </div>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger
                className="w-auto shrink-0 h-10"
                aria-label={t('settings.language.interface')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      </Section>

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
    </div>
  );
}
