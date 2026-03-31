package com.neurodual.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import android.content.Intent;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    private static final String TAG = "NeuroDualJS";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enable WebView remote debugging (accessible via chrome://inspect)
        WebView.setWebContentsDebuggingEnabled(true);

        // Register local plugins (not part of capacitor.plugins.json)
        registerPlugin(ExternalBrowserPlugin.class);

        // Enable edge-to-edge: WebView draws behind status bar and navigation bar.
        // Combined with transparent bars in styles.xml, this lets CSS safe-area-inset-*
        // handle content padding while the app background fills the entire screen.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        // API 35+ enforces edge-to-edge automatically with transparent bars.
        // Only set bar colors on pre-35 to avoid deprecated API warnings.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
        }

        // Disable WebView cache to prevent stale content after app updates
        // Assets are bundled in the APK, no need for WebView caching
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();

            // Normalize text rendering across OEM devices.
            // Some Android builds apply a non-100% text zoom to WebView based on system settings.
            // We keep OS accessibility scaling (handled via CSS rem + user in-app scale) but
            // avoid unexpected OEM text magnification.
            settings.setTextZoom(100);

            // Disable native overscroll stretch effect (Android 12+).
            // CSS overscroll-behavior handles the web layer, but the stretch
            // is rendered at the native View level and needs this flag.
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

            // LOAD_NO_CACHE: Don't use cache, always load from network/local
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
            // Clear existing cache on startup
            webView.clearCache(true);

            // Forward JS console.log/warn/error to Android logcat under "NeuroDualJS" tag
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage msg) {
                    String level;
                    switch (msg.messageLevel()) {
                        case ERROR:
                            level = "E";
                            Log.e(TAG, msg.message() + " [" + msg.sourceId() + ":" + msg.lineNumber() + "]");
                            break;
                        case WARNING:
                            level = "W";
                            Log.w(TAG, msg.message() + " [" + msg.sourceId() + ":" + msg.lineNumber() + "]");
                            break;
                        default:
                            level = "I";
                            Log.i(TAG, msg.message() + " [" + msg.sourceId() + ":" + msg.lineNumber() + "]");
                            break;
                    }
                    return true;
                }
            });
        }
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.w("MainActivity", "SocialLogin plugin handle is null");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.w("MainActivity", "SocialLogin plugin instance mismatch");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Required by ModifiedMainActivityForSocialLoginPlugin interface
    }
}
