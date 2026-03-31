import { describe, expect, it } from 'bun:test';
import { render, screen } from '@testing-library/react';
import type { Payload, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { CustomTooltip } from './custom-tooltip';

function buildPayload(overrides: Partial<Payload<ValueType, string>>): Payload<ValueType, string> {
  return {
    graphicalItemId: 'score-line',
    name: 'Last 5 sessions',
    color: '#111827',
    ...overrides,
  };
}

describe('CustomTooltip', () => {
  it('renders the hovered datum value instead of a stale tooltip entry value', () => {
    render(
      <CustomTooltip
        active
        hideLabel
        payload={[
          buildPayload({
            dataKey: 'score',
            value: 85,
            payload: { idx: 'N-1', score: 42 },
          }),
        ]}
        valueFormatter={(value) => `${value}%`}
      />,
    );

    expect(screen.getByText('42%')).toBeDefined();
    expect(screen.queryByText('85%')).toBeNull();
  });

  it('does not render when the hovered datum is a placeholder without value', () => {
    const { container } = render(
      <CustomTooltip
        active
        hideLabel
        payload={[
          buildPayload({
            dataKey: 'score',
            value: 85,
            payload: { idx: '2' },
          }),
        ]}
        valueFormatter={(value) => `${value}%`}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
