import type { DeepLinkPort } from '@neurodual/logic';
import { setupDeepLinkHandler } from '../lifecycle/deep-link-handler';

export const deepLinkAdapter: DeepLinkPort = {
  setupDeepLinkHandler: async (navigate) => setupDeepLinkHandler(navigate),
};
