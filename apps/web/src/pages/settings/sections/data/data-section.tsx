/**
 * Data management settings section - export, import, reset data, delete account
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  ArrowsClockwise,
  ChartBar,
  DownloadSimple,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react';
import {
  Card,
  Section,
  Spinner,
  useAuthAdapter,
  useAuthQuery,
  useDeleteAllData,
  useExportSessions,
  useImportSessions,
  useSessionSummariesCountQuery,
} from '@neurodual/ui';
import { SessionHistoryExportSchema } from '@neurodual/logic';
import { ConfirmationDialog } from '../../../../components/confirmation-dialog';
import { useSettingsStore } from '../../../../stores/settings-store';

export function DataSection(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirmationWord = t('settings.data.confirmationWord');
  const authState = useAuthQuery();
  const authAdapter = useAuthAdapter();
  const { count: sessionsCount } = useSessionSummariesCountQuery();
  const exportSessionsMutation = useExportSessions();
  const importSessionsMutation = useImportSessions();
  const deleteAllDataMutation = useDeleteAllData();

  // Anonymous stats sharing
  const shareAnonymousStats = useSettingsStore((s) => s.ui.shareAnonymousStats);
  const setShareAnonymousStats = useSettingsStore((s) => s.setShareAnonymousStats);

  // Export/Import state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export handler
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const data = await exportSessionsMutation.mutateAsync();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `neurodual-history-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [exportSessionsMutation]);

  // Import handler
  const handleImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      setImportResult(null);

      try {
        const text = await file.text();
        const parseResult = SessionHistoryExportSchema.safeParse(JSON.parse(text));
        if (!parseResult.success) {
          throw new Error('Invalid format');
        }
        const result = await importSessionsMutation.mutateAsync(parseResult.data);
        setImportResult({
          imported: result.imported,
          skipped: result.skipped,
        });
      } catch (err) {
        console.error('Import failed:', err);
      } finally {
        setIsImporting(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [importSessionsMutation],
  );

  // Reset data state
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Delete account state
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isAuthenticated = authState.status === 'authenticated';
  const canReset = resetConfirmText.toUpperCase() === confirmationWord;
  const canDelete = deleteConfirmText.toUpperCase() === confirmationWord;

  const handleResetAllData = async () => {
    if (!canReset) return;

    setIsResetting(true);
    setResetError(null);

    const result = await deleteAllDataMutation.mutateAsync();

    if (result.success) {
      setShowResetDialog(false);
      setResetConfirmText('');
      window.location.reload();
    } else {
      setResetError(result.error || t('settings.data.deleteFailed', 'Delete failed'));
      setIsResetting(false);
    }
  };

  // Delete account success overlay
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const handleDeleteAccount = async () => {
    if (!canDelete || !isAuthenticated) return;

    setIsDeletingAccount(true);
    setDeleteError(null);

    const result = await authAdapter.deleteAccount();

    if (result.success) {
      setShowDeleteAccountDialog(false);
      setDeleteConfirmText('');
      setDeleteSuccess(true);
    } else {
      setDeleteError(result.error.message);
      setIsDeletingAccount(false);
    }
  };

  const closeResetDialog = () => {
    if (!isResetting) {
      setShowResetDialog(false);
      setResetConfirmText('');
      setResetError(null);
    }
  };

  const closeDeleteDialog = () => {
    if (!isDeletingAccount) {
      setShowDeleteAccountDialog(false);
      setDeleteConfirmText('');
      setDeleteError(null);
    }
  };

  // Auto-redirect to home after successful account deletion
  useEffect(() => {
    if (!deleteSuccess) return;
    const timer = setTimeout(() => navigate('/', { replace: true }), 2000);
    return () => clearTimeout(timer);
  }, [deleteSuccess, navigate]);

  // Full-screen success overlay after account deletion
  if (deleteSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-green-600 font-bold text-lg">
            {t('settings.data.deleteAccountSuccess', 'Account deleted')}
          </p>
          <p className="text-muted-foreground text-sm">
            {t('auth.callback.redirecting', 'Redirecting...')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <Section title={t('settings.data.title', 'Data')}>
          <div className="space-y-3">
            {/* Export Data Card */}
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2.5 rounded-2xl shrink-0 bg-primary/10 text-primary">
                    <DownloadSimple size={20} weight="regular" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-foreground">
                      {t('settings.data.exportTitle', 'Export my data')}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium mt-0.5">
                      {t('settings.data.exportDesc', '{{count}} sessions (JSON)', {
                        count: sessionsCount,
                      })}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isExporting || sessionsCount === 0}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <Spinner size={16} className="text-primary" />
                      {t('common.loading', 'Loading...')}
                    </>
                  ) : (
                    t('settings.data.exportButton', 'Export')
                  )}
                </button>
              </div>
            </Card>

            {/* Import Data Card */}
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2.5 rounded-2xl shrink-0 bg-secondary text-muted-foreground">
                    <UploadSimple size={20} weight="regular" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-foreground">
                      {t('settings.data.importTitle', 'Import data')}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium mt-0.5">
                      {importResult
                        ? t(
                            'settings.data.importResult',
                            '{{imported}} imported, {{skipped}} skipped',
                            { imported: importResult.imported, skipped: importResult.skipped },
                          )
                        : t('settings.data.importDesc', 'Restore from a JSON file')}
                    </div>
                  </div>
                </div>
                <label className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold bg-secondary text-foreground hover:bg-secondary/80 transition-colors cursor-pointer flex items-center justify-center gap-2">
                  {isImporting ? (
                    <>
                      <Spinner size={16} className="text-foreground" />
                      {t('common.loading', 'Loading...')}
                    </>
                  ) : (
                    t('settings.data.importButton', 'Import')
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImport}
                    disabled={isImporting}
                    className="hidden"
                  />
                </label>
              </div>
            </Card>
          </div>
        </Section>

        <Section title={t('settings.data.shareTitle', 'Anonymous sharing')}>
          {/* Anonymous Stats Sharing Card */}
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="p-2.5 rounded-2xl shrink-0 bg-violet-50 text-violet-600">
                  <ChartBar size={20} weight="regular" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-foreground">
                    {t('settings.data.shareTitle', 'Anonymous sharing')}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium mt-0.5">
                    {t(
                      'settings.data.shareDesc',
                      'Contribute to leaderboards and comparisons (anonymized data)',
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShareAnonymousStats(!shareAnonymousStats)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  shareAnonymousStats ? 'bg-primary' : 'bg-secondary'
                }`}
                role="switch"
                aria-checked={shareAnonymousStats}
                aria-label={t('settings.data.shareTitle', 'Anonymous sharing')}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    shareAnonymousStats ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </Card>
        </Section>

        <Section title={t('settings.data.resetTitle', 'Reset my data')}>
          <div className="space-y-3">
            {/* Reset Data Card */}
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2.5 rounded-2xl shrink-0 bg-amber-50 text-amber-600">
                    <ArrowsClockwise size={20} weight="regular" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-foreground">
                      {t('settings.data.resetTitle', 'Reset my data')}
                    </div>
                    <div className="text-xs text-muted-foreground font-medium mt-0.5">
                      {t('settings.data.resetDesc')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetDialog(true)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                >
                  {t('settings.data.resetButton', 'Reset')}
                </button>
              </div>
            </Card>

            {/* Delete Account Card (only for authenticated users) */}
            {isAuthenticated && (
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="p-2.5 rounded-2xl shrink-0 bg-destructive/10 text-destructive">
                      <Trash size={20} weight="regular" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-foreground">
                        {t('settings.data.deleteAccountTitle')}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium mt-0.5">
                        {t('settings.data.deleteAccountDesc')}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeleteAccountDialog(true)}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    {t('settings.data.deleteButton')}
                  </button>
                </div>
              </Card>
            )}
          </div>
        </Section>
      </div>

      {/* Reset Data Confirmation Dialog */}
      {showResetDialog && (
        <ConfirmationDialog
          title={t('settings.data.confirmTitle')}
          description={t('settings.data.confirmDesc')}
          confirmWord={confirmationWord}
          inputValue={resetConfirmText}
          onInputChange={setResetConfirmText}
          onConfirm={handleResetAllData}
          onCancel={closeResetDialog}
          isLoading={isResetting}
          error={resetError}
          confirmLabel={t('settings.data.confirmReset')}
          loadingLabel={t('settings.data.deleting')}
          confirmIcon={<ArrowsClockwise size={18} weight="regular" />}
          variant="warning"
        />
      )}

      {/* Delete Account Confirmation Dialog */}
      {showDeleteAccountDialog && (
        <ConfirmationDialog
          title={t('settings.data.deleteAccountConfirmTitle')}
          description={t('settings.data.deleteAccountConfirmDesc')}
          confirmWord={confirmationWord}
          inputValue={deleteConfirmText}
          onInputChange={setDeleteConfirmText}
          onConfirm={handleDeleteAccount}
          onCancel={closeDeleteDialog}
          isLoading={isDeletingAccount}
          error={deleteError}
          confirmLabel={t('settings.data.confirmDeleteAccount')}
          loadingLabel={t('settings.data.deletingAccount')}
          confirmIcon={<Trash size={18} weight="regular" />}
          variant="destructive"
        />
      )}
    </>
  );
}
