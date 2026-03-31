/**
 * Controller Hook for ProfileDialog
 * Handles form state and modal lifecycle
 */

import { useAuthAdapter, useAuthQuery, useMountEffect } from '@neurodual/ui';
import { useCallback, useEffect, useState } from 'react';

export function useProfileDialog(isOpen: boolean, onClose: () => void) {
  const authState = useAuthQuery();
  const authAdapter = useAuthAdapter();

  // Get profile from auth state (Supabase)
  const profile = authState.status === 'authenticated' ? authState.profile : null;

  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useMountEffect(() => {
    setMounted(true);
  });

  // Sync local state with profile when dialog opens
  useEffect(() => {
    if (isOpen && profile) {
      setUsername(profile.username);
      setSelectedAvatar(profile.avatarId);
    }
  }, [isOpen, profile]);

  const handleSave = useCallback(async () => {
    if (!username.trim() || isSaving) return;

    setIsSaving(true);

    const updates: { username?: string; avatarId?: string } = {};
    if (profile && username.trim() !== profile.username) {
      updates.username = username.trim();
    }
    if (profile && selectedAvatar !== profile.avatarId) {
      updates.avatarId = selectedAvatar;
    }

    // Only call API if there are changes
    if (Object.keys(updates).length > 0) {
      await authAdapter.updateProfile(updates);
    }

    setIsSaving(false);
    onClose();
  }, [username, selectedAvatar, profile, authAdapter, onClose, isSaving]);

  return {
    user: profile,
    username,
    selectedAvatar,
    mounted,
    isSaving,
    handleSave,
    setUsername,
    setSelectedAvatar,
  };
}
