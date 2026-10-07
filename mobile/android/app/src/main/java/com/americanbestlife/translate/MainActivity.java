package com.americanbestlife.translate;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own native plugins, before the bridge starts
        registerPlugin(NativeSttPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
