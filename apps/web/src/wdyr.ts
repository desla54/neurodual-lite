import React from 'react';

if (import.meta.env.DEV && import.meta.env['VITE_WDYR'] === '1') {
  const { default: whyDidYouRender } = await import('@welldone-software/why-did-you-render');
  whyDidYouRender(React, {
    trackAllPureComponents: true,
    trackHooks: true,
    logOnDifferentValues: true,
    collapseGroups: true,
  });
  console.log('[WDYR] why-did-you-render active');
}
