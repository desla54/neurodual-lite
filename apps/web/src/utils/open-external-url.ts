/**
 * Open an external URL in a way that's reliable on Capacitor native WebViews.
 *
 * On Android/iOS native, `<a target="_blank">` can be inconsistent depending on OEM WebView/browser
 * policies. We prefer explicit handling and fallback to `window.location.assign()` when `window.open`
 * is blocked.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const openResult = window.open(url, '_blank', 'noopener,noreferrer');
  if (openResult) return;

  window.location.assign(url);
}
