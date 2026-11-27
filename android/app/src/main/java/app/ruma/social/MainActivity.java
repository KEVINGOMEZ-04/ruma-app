package app.ruma.social;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

/**
 * Actividad principal Android de ruma (`app.ruma.social`, Capacitor 8 / API 36).
 * Registra los plugins nativos de almacenamiento seguro (Android Keystore) y subidas Drive en 2.º plano,
 * e implementa ModifiedMainActivityForSocialLoginPlugin para habilitar scopes personalizados de Google Drive (`drive.file`).
 */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RumaSecureStoragePlugin.class);
        registerPlugin(RumaDriveUploadPlugin.class);
        super.onCreate(savedInstanceState);
        configureSystemBars();
    }

    /** Barras de sistema oscuras (MIUI / Redmi Note 8) con iconos claros. */
    private void configureSystemBars() {
        Window window = getWindow();
        int darkBg = Color.parseColor("#0E071D");
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            WindowCompat.setDecorFitsSystemWindows(window, true);
            window.setStatusBarColor(darkBg);
            window.setNavigationBarColor(darkBg);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin login handle is null");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Requerido por @capgo/capacitor-social-login para autorizar el scope `drive.file` en Android
    }
}
