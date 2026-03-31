import { describe, expect, it, mock } from 'bun:test';
import { translateContextualMessage, type TFunction } from './contextual-message';
import type { ContextualMessageData } from '@neurodual/logic';

describe('contextual-message', () => {
  const createMockT = (): TFunction => {
    return mock((key: string, params?: Record<string, string | number>) => {
      if (params) {
        let result = key;
        for (const [k, v] of Object.entries(params)) {
          result += `|${k}=${v}`;
        }
        return result;
      }
      return key;
    });
  };

  describe('translateContextualMessage', () => {
    it('should translate headline and subline', () => {
      const t = createMockT();
      const data: ContextualMessageData = {
        level: 'positive',
        headline: { key: 'headline.key', params: {} },
        subline: { key: 'subline.key', params: {} },
      };

      const result = translateContextualMessage(t, data);

      expect(result.level).toBe('positive');
      expect(result.headline).toBe('headline.key');
      expect(result.subline).toBe('subline.key');
      expect(result.insight).toBeUndefined();
    });

    it('should translate with params', () => {
      const t = createMockT();
      const data: ContextualMessageData = {
        level: 'warning',
        headline: { key: 'headline.key', params: { score: 85 } },
        subline: { key: 'subline.key', params: { level: 'N3' } },
      };

      const result = translateContextualMessage(t, data);

      expect(result.headline).toBe('headline.key|score=85');
      expect(result.subline).toBe('subline.key|level=N3');
    });

    it('should translate insight when present', () => {
      const t = createMockT();
      const data: ContextualMessageData = {
        level: 'neutral',
        headline: { key: 'headline', params: {} },
        subline: { key: 'subline', params: {} },
        insight: { key: 'insight.key', params: { count: 5 } },
      };

      const result = translateContextualMessage(t, data);

      expect(result.insight).toBe('insight.key|count=5');
    });

    it('should preserve level value', () => {
      const t = createMockT();
      const levels = ['positive', 'neutral', 'warning', 'negative'] as const;

      for (const level of levels) {
        const data: ContextualMessageData = {
          level,
          headline: { key: 'h', params: {} },
          subline: { key: 's', params: {} },
        };

        const result = translateContextualMessage(t, data);
        expect(result.level).toBe(level);
      }
    });

    it('should call t function with correct arguments', () => {
      const t = createMockT();
      const data: ContextualMessageData = {
        level: 'positive',
        headline: { key: 'stats.headline', params: { value: 42 } },
        subline: { key: 'stats.subline', params: {} },
      };

      translateContextualMessage(t, data);

      expect(t).toHaveBeenCalledWith('stats.headline', { value: 42 });
      expect(t).toHaveBeenCalledWith('stats.subline', {});
    });
  });
});
