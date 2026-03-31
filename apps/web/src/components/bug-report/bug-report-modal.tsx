import { Bug } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toast,
} from '@neurodual/ui';
import { useBugReport } from './use-bug-report';

const MIN_MESSAGE_LENGTH = 10;

interface BugReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BugReportModal({ open, onOpenChange }: BugReportModalProps): ReactNode {
  const { t } = useTranslation();
  const { submitBugReport, isPending } = useBugReport();
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < MIN_MESSAGE_LENGTH) {
      toast.error(t('settings.bugReport.tooShort'));
      return;
    }

    const result = await submitBugReport(trimmed);
    if (result.ok) {
      toast.success(t('settings.bugReport.success'), {
        description: t('settings.bugReport.successDesc'),
      });
      setMessage('');
      onOpenChange(false);
    } else {
      toast.error(t('settings.bugReport.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-5">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Bug size={20} weight="regular" />
            </div>
            <DialogTitle>{t('settings.bugReport.title')}</DialogTitle>
          </div>
          <DialogDescription>{t('settings.bugReport.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('settings.bugReport.placeholder')}
            className="w-full min-h-[120px] rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60"
            maxLength={2000}
            autoFocus
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-10 px-4 rounded-xl border border-border bg-background hover:bg-secondary text-foreground text-sm font-medium transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || message.trim().length < MIN_MESSAGE_LENGTH}
              className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? t('settings.bugReport.sending') : t('settings.bugReport.submit')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
