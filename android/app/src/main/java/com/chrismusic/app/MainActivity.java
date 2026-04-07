package com.chrismusic.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YouTubeNativePlugin.class);
        registerPlugin(ExoPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
