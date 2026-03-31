/**
 * AdminStressTab - Stress testing tools
 *
 * Provides:
 * - Link to dedicated stress test page
 * - Quick stress test options
 * - Memory and performance monitoring hints
 */

import { Button, Card } from '@neurodual/ui';
import { Flame, Lightning, Timer, Memory, ArrowRight } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

// =============================================================================
// Stress Test Options
// =============================================================================

const STRESS_TESTS = [
  {
    id: 'rapid',
    name: 'Rapid Sessions',
    description: 'Run multiple short sessions in quick succession',
    icon: Lightning,
    params: 'mode=rapid&sessions=5&trials=10',
  },
  {
    id: 'endurance',
    name: 'Endurance Test',
    description: 'Long session with 100+ trials to test memory stability',
    icon: Timer,
    params: 'mode=endurance&trials=100',
  },
  {
    id: 'memory',
    name: 'Memory Pressure',
    description: 'Simulate memory-intensive operations during gameplay',
    icon: Memory,
    params: 'mode=memory&pressure=high',
  },
];

// =============================================================================
// Main Component
// =============================================================================

export function AdminStressTab(): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Info */}
      <Card className="bg-orange-500/5 border-orange-500/30">
        <div className="flex gap-3">
          <Flame size={24} weight="bold" className="text-orange-400 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-orange-400 mb-1">
              {t('admin.stress.title', 'Stress Testing')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.stress.description',
                'Test application stability under various load conditions. Monitor memory usage and performance during stress tests.',
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* Dedicated Stress Test Page Link */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold">{t('admin.stress.fullTest', 'Full Stress Test Suite')}</h4>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.stress.fullTestDesc',
                'Access the dedicated stress test page with comprehensive testing options.',
              )}
            </p>
          </div>
          <Link to="/stress-test">
            <Button className="gap-2">
              {t('admin.stress.open', 'Open')}
              <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </Card>

      {/* Quick Stress Tests */}
      <Card>
        <h4 className="font-bold mb-4">{t('admin.stress.quickTests', 'Quick Stress Tests')}</h4>
        <div className="grid gap-3">
          {STRESS_TESTS.map(({ id, name, description, icon: Icon, params }) => (
            <Link
              key={id}
              to={`/stress-test?${params}`}
              className="flex items-center gap-4 p-4 rounded-lg bg-surface border border-border hover:bg-muted transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Icon size={20} weight="bold" className="text-orange-400" />
              </div>
              <div className="flex-1">
                <div className="font-bold">{name}</div>
                <div className="text-sm text-muted-foreground">{description}</div>
              </div>
              <ArrowRight size={20} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      </Card>

      {/* Tips */}
      <Card className="bg-surface/50">
        <h4 className="font-bold mb-3">{t('admin.stress.tips', 'Testing Tips')}</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-orange-400">•</span>
            Open DevTools Performance tab before running stress tests
          </li>
          <li className="flex gap-2">
            <span className="text-orange-400">•</span>
            Monitor Memory tab for leaks during extended sessions
          </li>
          <li className="flex gap-2">
            <span className="text-orange-400">•</span>
            Check Console for warnings about event loop lag or freezes
          </li>
          <li className="flex gap-2">
            <span className="text-orange-400">•</span>
            Use the Health tab to review session metrics after tests
          </li>
        </ul>
      </Card>
    </div>
  );
}
