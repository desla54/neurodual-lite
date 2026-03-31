import { registerPlugin } from '@capacitor/core';

export interface ExternalBrowserPlugin {
  open(options: { url: string }): Promise<{ opened: boolean }>;
}

export const ExternalBrowser = registerPlugin<ExternalBrowserPlugin>('ExternalBrowser');
