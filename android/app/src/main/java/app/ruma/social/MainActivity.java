package app.ruma.social;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Actividad principal Android de ruma (`app.ruma.social`, Capacitor 8 / API 36).
 * Registra los plugins nativos de almacenamiento seguro (Android Keystore) y subidas Drive en 2.º plano.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RumaSecureStoragePlugin.class);
        registerPlugin(RumaDriveUploadPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
