import { describe, expect, it, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { EditableSlider } from './editable-slider';

function renderSlider(onChange = mock(() => {}), value = 50) {
  render(
    <EditableSlider label="Test slider" value={value} onChange={onChange} min={0} max={100} />,
  );

  return {
    slider: screen.getByRole('slider'),
    onChange,
  };
}

describe('EditableSlider touch gesture gating', () => {
  it('applies value changes on horizontal touch drag', () => {
    const { slider, onChange } = renderSlider();

    fireEvent.touchStart(slider, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(slider, { touches: [{ clientX: 125, clientY: 104 }] });
    fireEvent.change(slider, { target: { value: '70' } });

    expect(onChange).toHaveBeenCalledWith(70);
  });

  it('does not disable native touch handling on the range input', () => {
    const { slider } = renderSlider();

    expect(slider.getAttribute('style')).toBeNull();
  });

  it('still supports non-touch range changes', () => {
    const { slider, onChange } = renderSlider();

    fireEvent.change(slider, { target: { value: '64' } });

    expect(onChange).toHaveBeenCalledWith(64);
  });
});
