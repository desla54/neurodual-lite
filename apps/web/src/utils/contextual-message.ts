/**
 * Contextual Message Translation Utilities
 *
 * Helper functions to translate ContextualMessageData (i18n keys) into ContextualMessage (strings).
 */

import type {
  ContextualMessage,
  ContextualMessageData,
  TranslatableMessage,
} from '@neurodual/logic';

/**
 * Translation function type (compatible with i18next t())
 */
export type TFunction = (key: string, params?: Record<string, string | number>) => string;

/**
 * Translate a TranslatableMessage to a string.
 */
function translateMessage(t: TFunction, msg: TranslatableMessage): string {
  const rawParams = msg.params;
  if (!rawParams) return t(msg.key);

  // Localize modality tokens when logic passes modality ids (e.g. 'audio', 'position').
  // Keeps logic layer language-agnostic while improving FR output quality.
  const localizeModalityToken = (token: unknown): unknown => {
    if (typeof token !== 'string' || token.length === 0) return token;
    const key = `common.${token}`;
    const translated = t(key);
    return translated === key ? token : translated;
  };

  const params: Record<string, string | number> = { ...rawParams };
  for (const k of ['modality', 'best', 'worst', 'faster']) {
    if (k in params) {
      const v = localizeModalityToken(params[k]);
      if (typeof v === 'string' || typeof v === 'number') params[k] = v;
    }
  }

  return t(msg.key, params);
}

/**
 * Translate ContextualMessageData (with i18n keys) to ContextualMessage (with strings).
 *
 * @param t - Translation function (from useTranslation('stats'))
 * @param data - ContextualMessageData with i18n keys
 * @returns ContextualMessage with translated strings
 */
export function translateContextualMessage(
  t: TFunction,
  data: ContextualMessageData,
): ContextualMessage {
  return {
    level: data.level,
    headline: translateMessage(t, data.headline),
    subline: translateMessage(t, data.subline),
    insight: data.insight ? translateMessage(t, data.insight) : undefined,
  };
}
