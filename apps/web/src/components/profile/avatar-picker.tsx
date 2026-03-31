/**
 * AvatarPicker - Avatar selection grid
 * Nordic design system
 */

import { AVATARS, Avatar, cn } from '@neurodual/ui';
import { Check } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

interface AvatarPickerProps {
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
  size?: 'sm' | 'md';
}

export function AvatarPicker({
  selectedId,
  onSelect,
  label,
  size = 'md',
}: AvatarPickerProps): ReactNode {
  const avatarSize = size === 'sm' ? 18 : 22;
  const checkSize = size === 'sm' ? 6 : 8;

  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">
        {label}
      </div>
      <div className="grid grid-cols-5 md:grid-cols-10 gap-2 md:gap-3">
        {AVATARS.map((avatar) => (
          <button
            type="button"
            key={avatar.id}
            onClick={() => onSelect(avatar.id)}
            className={cn(
              'relative aspect-square flex items-center justify-center rounded-2xl transition-all duration-300',
              selectedId === avatar.id
                ? 'bg-surface ring-2 ring-visual shadow-lg scale-105 z-10'
                : 'bg-background hover:bg-white hover:shadow-md hover:scale-105 opacity-70 hover:opacity-100',
            )}
            aria-label={`Select ${avatar.id} avatar`}
            aria-pressed={selectedId === avatar.id}
          >
            <Avatar
              id={avatar.id}
              size={avatarSize}
              className="border-none shadow-none bg-transparent"
            />
            {selectedId === avatar.id && (
              <div className="absolute -top-1 -right-1 bg-visual text-white rounded-full p-0.5 border-2 border-surface shadow-sm">
                <Check size={checkSize} strokeWidth={4} />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
