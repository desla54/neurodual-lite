/**
 * Vite Plugin - Dev Logs
 *
 * En mode dev uniquement, expose un endpoint pour écrire des fichiers de log.
 * Permet à l'app d'envoyer les events de session pour debug.
 *
 * Usage: POST /api/dev-log avec { sessionId, events }
 * Crée: logs/session-{timestamp}-{sessionId}.json
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const LOGS_DIR = path.resolve(__dirname, 'logs');

export function devLogsPlugin(): Plugin {
  return {
    name: 'dev-logs',
    apply: 'serve', // Only in dev mode

    configureServer(server) {
      // Ensure logs directory exists
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }

      server.middlewares.use('/api/dev-log', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const { sessionId, events, summary } = data;

            if (!sessionId || !events) {
              res.statusCode = 400;
              res.end('Missing sessionId or events');
              return;
            }

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `session-${timestamp}-${sessionId.slice(0, 8)}.json`;
            const filepath = path.join(LOGS_DIR, filename);

            // Write log file
            const logData = {
              sessionId,
              timestamp: Date.now(),
              eventsCount: events.length,
              events,
              summary,
            };

            fs.writeFileSync(filepath, JSON.stringify(logData, null, 2));

            console.log(`[dev-logs] Session logged: ${filename}`);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, filename }));
          } catch (error) {
            console.error('[dev-logs] Error:', error);
            res.statusCode = 500;
            res.end('Internal error');
          }
        });
      });
    },
  };
}
