/**
 * useBadgeTranslation Hook
 *
 * Provides translation functions for badge names and descriptions.
 * Falls back to the hardcoded value in the badge definition if no translation is found.
 */

import { useTranslation } from 'react-i18next';
import type { BadgeDefinition, BadgeCategory } from '@neurodual/logic';

export function useBadgeTranslation() {
  const { t } = useTranslation();

  return {
    /**
     * Get the translated badge name
     * Falls back to badge.name if no translation exists
     */
    getName: (badge: BadgeDefinition | { id: string; name: string }): string =>
      t(`badges.${badge.id}.name`, { defaultValue: badge.name }),

    /**
     * Get the translated badge description
     * Falls back to badge.description if no translation exists
     */
    getDescription: (badge: BadgeDefinition | { id: string; description: string }): string =>
      t(`badges.${badge.id}.description`, { defaultValue: badge.description }),

    /**
     * Get the translated category name
     */
    getCategoryName: (category: BadgeCategory): string =>
      t(`badges.categories.${category}`, { defaultValue: category }),
  };
}
