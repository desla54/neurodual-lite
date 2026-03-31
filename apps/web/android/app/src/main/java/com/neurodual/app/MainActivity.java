package com.neurodual.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NeuroDualJS";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enable WebView remote debugging (accessible via chrome://inspect)
        WebView.setWebContentsDebuggingEnabled(true);

        // Register local plugins (not part of capacitor.plugins.json)
        registerPlugin(ExternalBrowserPlugin.class);

        // Enable edge-to-edge: WebView draws behind status bar and navigation bar.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
        }

        // Disable WebView cache to prevent stale content after app updates
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
            webView.clearCache(true);

            // Forward JS console.log/warn/error to Android logcat under "NeuroDualJS" tag
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage msg) {
                    switch (msg.messageLevel()) {
                        case ERROR:
                            Log.e(TAG, msg.message() + " [" + msg.sourceId() + ":" + msg.lineNumber() + "]");
                            break;
                        case WARNING:
                            Log.w(TAG, msg.message() + " [" + msg.sourceId() + ":" + msg.lineNumber() + "]");
                            break;
                        default:
                            Log.i(TAG, msg.message() + " [" + msg.sourceId() + ":" + msg.lineNumber() + "]");
                            break;
                    }
                    return true;
                }
            });
        }
    }
}
