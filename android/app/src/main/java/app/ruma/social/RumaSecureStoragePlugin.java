package app.ruma.social;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin nativo Capacitor 8 para almacenamiento cifrado en Android Keystore.
 */
@CapacitorPlugin(name = "RumaSecureStorage")
public class RumaSecureStoragePlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.trim().isEmpty() || value == null) {
            call.reject("key y value son requeridos");
            return;
        }
        try {
            RumaKeystoreHelper.putEncrypted(getContext(), key.trim(), value);
            call.resolve();
        } catch (Exception e) {
            call.reject("Error cifrando en Android Keystore: " + e.getMessage());
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.trim().isEmpty()) {
            call.reject("key requerido");
            return;
        }
        String value = RumaKeystoreHelper.getDecrypted(getContext(), key.trim());
        JSObject ret = new JSObject();
        ret.put("value", value);
        call.resolve(ret);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key != null && !key.trim().isEmpty()) {
            RumaKeystoreHelper.remove(getContext(), key.trim());
        }
        call.resolve();
    }
}
