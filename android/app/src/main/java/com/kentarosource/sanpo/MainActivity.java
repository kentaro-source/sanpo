package com.kentarosource.sanpo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Lock the WebView's text zoom to 100% — otherwise it inherits the
        // user's device-wide font-size accessibility setting, which scales
        // every CSS px in the app (the cause of the title overflowing into
        // the dice token in the v1 build screenshots).
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().getSettings().setTextZoom(100);
        }
    }
}
