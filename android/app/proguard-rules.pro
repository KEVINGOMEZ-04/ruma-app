# Reglas R8 / ProGuard para ruma (Capacitor 8 + Plugins Nativos + WorkManager + RevenueCat)

-keep class app.ruma.social.** { *; }
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}

# WorkManager Workers
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# RevenueCat / Google Play Billing v8+
-keep class com.revenuecat.** { *; }
-keep class com.android.billingclient.** { *; }

# SocialLogin / Google Credential Manager
-keep class ee.forgr.capacitor.social.** { *; }

-keepattributes SourceFile,LineNumberTable
