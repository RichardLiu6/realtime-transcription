package com.americanbestlife.translate;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.PowerManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayDeque;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

/**
 * Native speech-engine connection for the app (JS side: lib/native/stt.ts in
 * the web app). The microphone (AudioRecord) and the WebSocket to the engine
 * (Soniox or R2T2) live here, kept running with the screen off by a
 * foreground service (TranscriptionService, ongoing notification) and a
 * partial wake lock. The page gets every engine message numbered; messages
 * that arrive while the page is paused are kept and handed over by drain().
 */
@CapacitorPlugin(
    name = "NativeStt",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NativeSttPlugin extends Plugin {
    // Messages kept for drain() (a long meeting sends a few per second)
    private static final int MAX_KEPT = 20000;
    // Without audio for this long, send a keepalive
    private static final long KEEPALIVE_AFTER_MS = 5000;
    // After end-of-audio, wait this long for the engine to close
    private static final long FINISH_TIMEOUT_MS = 3000;

    private final Object lock = new Object();
    private final OkHttpClient http = new OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    // Guarded by lock
    private WebSocket socket;
    private Thread audioThread;
    private volatile boolean capturing;
    private boolean running;
    private boolean finishing;
    private int seq;
    private final ArrayDeque<JSObject> kept = new ArrayDeque<>();
    private ScheduledFuture<?> timer;
    private ScheduledFuture<?> finishTimeout;
    private PowerManager.WakeLock wakeLock;

    private volatile long samplesSent;
    private volatile long lastAudioAt;
    private String keepaliveMessage;

    // MARK: JS API

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "microphone", "notifications" }, call, "permissionsDone");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void permissionsDone(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("麦克风权限被拒绝，请在系统设置中允许 ABL Translate 使用麦克风 / Microphone access denied");
            return;
        }
        begin(call);
    }

    private void begin(final PluginCall call) {
        final String url = call.getString("url");
        final String openMessage = call.getString("openMessage");
        if (url == null || openMessage == null) {
            call.reject("Missing url or openMessage");
            return;
        }
        final int sampleRate = call.getInt("sampleRate", 16000);
        final int frameMs = call.getInt("frameMs", 100);
        final boolean processing = Boolean.TRUE.equals(call.getBoolean("audioProcessing", false));
        final String title = call.getString("notificationTitle", "ABL Translate");
        final String text = call.getString("notificationText", "");

        synchronized (lock) {
            if (running || socket != null) {
                call.reject("Already recording");
                return;
            }
            seq = 0;
            kept.clear();
            samplesSent = 0;
            finishing = false;
            keepaliveMessage = call.getString("keepaliveMessage");
            final boolean[] answered = { false };
            Request request = new Request.Builder().url(url).build();
            socket = http.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket ws, Response response) {
                    synchronized (lock) {
                        if (socket != ws) return; // cancelled meanwhile
                        ws.send(openMessage);
                        try {
                            startForeground(title, text);
                            startAudio(ws, sampleRate, frameMs, processing);
                        } catch (Exception e) {
                            ws.cancel();
                            teardown();
                            answered[0] = true;
                            call.reject("Microphone: " + e.getMessage());
                            return;
                        }
                        running = true;
                        lastAudioAt = System.currentTimeMillis();
                        startTimer();
                        answered[0] = true;
                        call.resolve();
                    }
                }

                @Override
                public void onMessage(WebSocket ws, String message) {
                    synchronized (lock) {
                        if (socket != ws) return;
                        deliver(message);
                    }
                }

                @Override
                public void onMessage(WebSocket ws, ByteString bytes) {
                    onMessage(ws, bytes.utf8());
                }

                @Override
                public void onClosing(WebSocket ws, int code, String reason) {
                    ws.close(code, null);
                    synchronized (lock) {
                        if (socket != ws) return;
                        closed(code, reason);
                    }
                }

                @Override
                public void onFailure(WebSocket ws, Throwable t, Response response) {
                    synchronized (lock) {
                        if (socket != ws) return;
                        if (!answered[0]) {
                            answered[0] = true;
                            teardown();
                            call.reject("Connection failed: " + t.getMessage());
                            return;
                        }
                        closed(finishing ? 1000 : 1006, finishing ? "" : String.valueOf(t.getMessage()));
                    }
                }
            });
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        final String text = call.getString("text");
        synchronized (lock) {
            final WebSocket ws = socket;
            if (!running || finishing || ws == null) {
                call.resolve();
                return;
            }
            finishing = true;
            stopAudio();
            if (text != null) ws.send(text);
            else ws.send(ByteString.EMPTY);
            finishTimeout = scheduler.schedule(() -> {
                synchronized (lock) {
                    if (socket != ws) return;
                    ws.cancel();
                    closed(1000, "");
                }
            }, FINISH_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        }
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        synchronized (lock) {
            if (socket != null) socket.cancel();
            teardown();
        }
        call.resolve();
    }

    @PluginMethod
    public void drain(PluginCall call) {
        int after = call.getInt("after", 0);
        JSArray messages = new JSArray();
        synchronized (lock) {
            for (JSObject m : kept) {
                if (m.getInteger("seq", 0) > after) messages.put(m);
            }
        }
        JSObject result = new JSObject();
        result.put("messages", messages);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (lock) {
            if (socket != null) socket.cancel();
            teardown();
        }
        scheduler.shutdownNow();
    }

    // MARK: Messages (call with lock held)

    private void deliver(String text) {
        seq++;
        JSObject m = new JSObject();
        m.put("seq", seq);
        m.put("data", text);
        kept.addLast(m);
        while (kept.size() > MAX_KEPT) kept.removeFirst();
        notifyListeners("message", m);
    }

    private void closed(int code, String reason) {
        if (socket == null) return;
        teardown();
        JSObject e = new JSObject();
        e.put("code", code);
        e.put("reason", reason == null ? "" : reason);
        notifyListeners("closed", e);
    }

    // Stop everything without telling the page
    private void teardown() {
        stopAudio();
        if (timer != null) timer.cancel(false);
        timer = null;
        if (finishTimeout != null) finishTimeout.cancel(false);
        finishTimeout = null;
        socket = null;
        running = false;
        finishing = false;
        stopForeground();
    }

    private void startTimer() {
        timer = scheduler.scheduleWithFixedDelay(() -> {
            synchronized (lock) {
                if (!running) return;
                JSObject p = new JSObject();
                p.put("samples", samplesSent);
                notifyListeners("progress", p);
                if (keepaliveMessage != null && !finishing && socket != null
                    && System.currentTimeMillis() - lastAudioAt > KEEPALIVE_AFTER_MS) {
                    socket.send(keepaliveMessage);
                    lastAudioAt = System.currentTimeMillis();
                }
            }
        }, 1, 1, TimeUnit.SECONDS);
    }

    // MARK: Audio

    // Raw audio by default (VOICE_RECOGNITION: tuned for speech recognition,
    // no echo cancellation); the 降噪 setting uses VOICE_COMMUNICATION
    @SuppressLint("MissingPermission") // checked in start()
    private void startAudio(final WebSocket ws, final int sampleRate, int frameMs, boolean processing) {
        final int frameSamples = Math.max(1, sampleRate * frameMs / 1000);
        int minBuffer = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBuffer <= 0) throw new IllegalStateException("Unsupported audio format");
        final AudioRecord record = new AudioRecord(
            processing ? MediaRecorder.AudioSource.VOICE_COMMUNICATION : MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            Math.max(minBuffer, frameSamples * 2 * 4)
        );
        if (record.getState() != AudioRecord.STATE_INITIALIZED) {
            record.release();
            throw new IllegalStateException("No microphone input");
        }
        record.startRecording();
        capturing = true;
        audioThread = new Thread(() -> {
            short[] frame = new short[frameSamples];
            ByteBuffer bytes = ByteBuffer.allocate(frameSamples * 2).order(ByteOrder.LITTLE_ENDIAN);
            try {
                while (capturing) {
                    int filled = 0;
                    while (capturing && filled < frameSamples) {
                        int n = record.read(frame, filled, frameSamples - filled);
                        if (n < 0) throw new IllegalStateException("AudioRecord error " + n);
                        filled += n;
                    }
                    if (filled == 0) continue;
                    bytes.clear();
                    for (int i = 0; i < filled; i++) bytes.putShort(frame[i]);
                    ws.send(ByteString.of(bytes.array(), 0, filled * 2));
                    samplesSent += filled;
                    lastAudioAt = System.currentTimeMillis();
                }
            } catch (Exception e) {
                JSObject err = new JSObject();
                err.put("message", "Microphone: " + e.getMessage());
                notifyListeners("error", err);
            } finally {
                try {
                    record.stop();
                } catch (Exception ignored) {
                    // already stopped
                }
                record.release();
            }
        }, "NativeStt-audio");
        audioThread.start();
    }

    private void stopAudio() {
        capturing = false;
        Thread t = audioThread;
        audioThread = null;
        if (t != null && t != Thread.currentThread()) {
            try {
                t.join(500);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    // MARK: Foreground service + wake lock

    private void startForeground(String title, String text) {
        Context context = getContext();
        Intent intent = new Intent(context, TranscriptionService.class);
        intent.putExtra(TranscriptionService.EXTRA_TITLE, title);
        intent.putExtra(TranscriptionService.EXTRA_TEXT, text);
        ContextCompat.startForegroundService(context, intent);
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (pm != null && wakeLock == null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ABLTranslate:transcription");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(6 * 60 * 60 * 1000L); // a long meeting at most
        }
    }

    private void stopForeground() {
        Context context = getContext();
        context.stopService(new Intent(context, TranscriptionService.class));
        if (wakeLock != null) {
            if (wakeLock.isHeld()) wakeLock.release();
            wakeLock = null;
        }
    }
}
