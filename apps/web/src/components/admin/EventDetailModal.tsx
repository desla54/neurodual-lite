/**
 * EventDetailModal - Full JSON view of an event
 *
 * Features:
 * - Formatted JSON with syntax highlighting
 * - Copy to clipboard (JSON, ID)
 * - Event type header with color
 */

import type { GameEvent } from '@neurodual/logic';
import { Button, Card } from '@neurodual/ui';
import { X, Copy, Check } from '@phosphor-icons/react';
import { useState, useCallback, type ReactNode } from 'react';
import { EVENT_COLORS, EVENT_SHORT_LABELS } from './event-columns';

// =============================================================================
// Types
// =============================================================================

interface EventDetailModalProps {
  event: GameEvent;
  onClose: () => void;
}

// =============================================================================
// JSON Syntax Highlighting
// =============================================================================

function highlightJSON(json: string): ReactNode {
  // Tokenize then render as React text/spans (no innerHTML) to avoid XSS if JSON contains "<...>".
  const tokenRe =
    /("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\btrue\b|\bfalse\b|\bnull\b|[{}[\],:]|\s+/g;

  const tokens: string[] = [];
  for (const match of json.matchAll(tokenRe)) tokens.push(match[0]);

  function isWhitespace(token: string): boolean {
    return /^\s+$/.test(token);
  }

  function isKeyToken(index: number): boolean {
    const token = tokens[index];
    if (!token?.startsWith('"')) return false;
    for (let i = index + 1; i < tokens.length; i++) {
      const next = tokens[i];
      if (!next || isWhitespace(next)) continue;
      return next === ':';
    }
    return false;
  }

  return tokens.map((token, idx) => {
    if (isWhitespace(token)) return token;

    if (token.startsWith('"')) {
      const className = isKeyToken(idx) ? 'text-blue-400' : 'text-amber-400';
      return (
        <span key={idx} className={className}>
          {token}
        </span>
      );
    }

    if (/^-?\d/.test(token)) {
      return (
        <span key={idx} className="text-emerald-400">
          {token}
        </span>
      );
    }

    if (token === 'true' || token === 'false') {
      return (
        <span key={idx} className="text-purple-400">
          {token}
        </span>
      );
    }

    if (token === 'null') {
      return (
        <span key={idx} className="text-red-400">
          {token}
        </span>
      );
    }

    return (
      <span key={idx} className="text-slate-200">
        {token}
      </span>
    );
  });
}

// =============================================================================
// Component
// =============================================================================

export function EventDetailModal({ event, onClose }: EventDetailModalProps): ReactNode {
  const [copiedField, setCopiedField] = useState<'json' | 'id' | null>(null);

  const handleCopy = useCallback(async (text: string, field: 'json' | 'id') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, []);

  const eventColor = EVENT_COLORS[event.type] ?? 'bg-gray-500';
  const eventLabel = EVENT_SHORT_LABELS[event.type] ?? event.type;
  const jsonString = JSON.stringify(event, null, 2);
  const timestamp = new Date(event.timestamp).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-overlay-padding bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-1 rounded text-sm font-bold text-white ${eventColor}`}>
              {eventLabel}
            </span>
            <span className="text-sm text-muted-foreground">{event.type}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Meta info */}
        <div className="py-3 border-b border-border/50 space-y-2">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Timestamp:</span>
              <span className="ml-2 font-mono">{timestamp}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Epoch:</span>
              <span className="ml-2 font-mono">{event.timestamp}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">ID:</span>
            <span className="font-mono text-4xs bg-surface px-1.5 py-0.5 rounded">{event.id}</span>
            <button
              type="button"
              onClick={() => handleCopy(event.id, 'id')}
              className="p-1 hover:bg-surface rounded transition-colors"
              title="Copy ID"
            >
              {copiedField === 'id' ? (
                <Check size={12} className="text-green-400" />
              ) : (
                <Copy size={12} className="text-muted-foreground" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Session:</span>
            <span className="font-mono text-4xs bg-surface px-1.5 py-0.5 rounded">
              {event.sessionId}
            </span>
          </div>
        </div>

        {/* JSON content */}
        <div className="flex-1 overflow-y-auto py-3">
          <div className="bg-[#1a1a2e] rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <pre className="m-0 leading-relaxed whitespace-pre-wrap break-words">
              {highlightJSON(jsonString)}
            </pre>
          </div>
        </div>

        {/* Footer actions */}
        <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleCopy(jsonString, 'json')}
            className="gap-1.5"
          >
            {copiedField === 'json' ? (
              <>
                <Check size={14} className="text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy size={14} />
                Copy JSON
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
