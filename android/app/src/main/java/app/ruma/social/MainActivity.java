package app.ruma.social;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

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
