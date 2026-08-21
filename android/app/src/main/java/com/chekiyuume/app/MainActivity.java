package com.chekiyuume.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.PrintWriter;
import java.io.StringWriter;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "ChekiYuumeCrash";
    private static final String PREFS_NAME = "ChekiYuumeCrashPrefs";
    private static final String KEY_LAST_CRASH = "last_crash_trace";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Global Uncaught Exception Handler to capture fatal crashes without silent loss
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable throwable) {
                try {
                    StringWriter sw = new StringWriter();
                    PrintWriter pw = new PrintWriter(sw);
                    throwable.printStackTrace(pw);
                    String stackTrace = sw.toString();

                    Log.e(TAG, "FATAL CRASH CAPTURED in thread " + thread.getName() + ":\n" + stackTrace);

                    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(KEY_LAST_CRASH, "Thread: " + thread.getName() + "\n" + stackTrace).commit();
                } catch (Exception e) {
                    Log.e(TAG, "Failed to persist crash trace", e);
                }

                if (defaultHandler != null) {
                    defaultHandler.uncaughtException(thread, throwable);
                }
            }
        });

        super.onCreate(savedInstanceState);
        registerPlugin(Camera2Plugin.class);
        hideSystemUI();

        // Inject NativeCrashReporter interface into WebView
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new CrashReporterInterface(this), "NativeCrashReporter");
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not inject crash reporter", e);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    public static class CrashReporterInterface {
        private final Context context;

        public CrashReporterInterface(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public String getLastCrash() {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getString(KEY_LAST_CRASH, "");
        }

        @JavascriptInterface
        public void clearLastCrash() {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().remove(KEY_LAST_CRASH).apply();
        }
    }
}

