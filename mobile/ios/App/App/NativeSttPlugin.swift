import Foundation
import AVFoundation
import Capacitor

// Native speech-engine connection for the app (JS side: lib/native/stt.ts
// in the web app). The microphone (AVAudioEngine) and the WebSocket to the
// engine (Soniox or R2T2) live here, so recording continues with the screen
// locked or another app in front (Info.plist: UIBackgroundModes audio). The
// page gets every engine message numbered; messages that arrive while the
// page is suspended are kept and handed over by drain().
@objc(NativeSttPlugin)
public class NativeSttPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeSttPlugin"
    public let jsName = "NativeStt"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drain", returnType: CAPPluginReturnPromise),
    ]

    // Messages kept for drain() (a long meeting sends a few per second)
    private static let maxKept = 20000
    // Without audio (an interruption) for this long, send a keepalive
    private static let keepaliveAfter: TimeInterval = 5
    // After end-of-audio, wait this long for the engine to close
    private static let finishTimeout: TimeInterval = 3

    // All state below is touched on this serial queue only
    private let queue = DispatchQueue(label: "com.americanbestlife.translate.NativeStt")
    private var session: URLSession?
    private var task: URLSessionWebSocketTask?
    private let engine = AVAudioEngine()
    private var tapInstalled = false
    private var pending: [Int16] = []
    private var frameSamples = 1600
    private var targetRate: Double = 16000
    private var processing = false
    private var keepaliveMessage: String?
    private var samplesSent = 0
    private var lastAudioAt = Date()
    private var seq = 0
    private var kept: [(seq: Int, data: String)] = []
    private var running = false
    private var finishing = false
    private var timer: DispatchSourceTimer?
    private var finishWork: DispatchWorkItem?

    override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(audioInterrupted(_:)),
                           name: AVAudioSession.interruptionNotification, object: nil)
        center.addObserver(self, selector: #selector(audioChanged(_:)),
                           name: AVAudioSession.routeChangeNotification, object: nil)
        center.addObserver(self, selector: #selector(audioChanged(_:)),
                           name: .AVAudioEngineConfigurationChange, object: engine)
        center.addObserver(self, selector: #selector(audioChanged(_:)),
                           name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
    }

    // MARK: - JS API

    @objc func start(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString),
              let openMessage = call.getString("openMessage") else {
            call.reject("Missing url or openMessage")
            return
        }
        let sampleRate = call.getDouble("sampleRate") ?? 16000
        let frameMs = call.getDouble("frameMs") ?? 100
        let processing = call.getBool("audioProcessing") ?? false
        let keepalive = call.getString("keepaliveMessage")

        requestMicrophone { granted in
            self.queue.async {
                guard granted else {
                    call.reject("麦克风权限被拒绝，请在系统设置中允许 ABL Translate 使用麦克风 / Microphone access denied")
                    return
                }
                guard !self.running, self.task == nil else {
                    call.reject("Already recording")
                    return
                }
                self.targetRate = sampleRate
                self.frameSamples = max(1, Int(sampleRate * frameMs / 1000))
                self.processing = processing
                self.keepaliveMessage = keepalive
                self.pending = []
                self.samplesSent = 0
                self.seq = 0
                self.kept = []
                self.finishing = false

                let session = URLSession(configuration: .default)
                let task = session.webSocketTask(with: url)
                self.session = session
                self.task = task
                task.resume()
                // Queued until the connection is open; fails if it can't open
                task.send(.string(openMessage)) { error in
                    self.queue.async {
                        guard self.task === task else { return } // cancelled meanwhile
                        if let error = error {
                            self.teardown()
                            call.reject("Connection failed: \(error.localizedDescription)")
                            return
                        }
                        do {
                            try self.startAudio()
                        } catch {
                            task.cancel(with: .normalClosure, reason: nil)
                            self.teardown()
                            call.reject("Microphone: \(error.localizedDescription)")
                            return
                        }
                        self.running = true
                        self.lastAudioAt = Date()
                        self.receive(task)
                        self.startTimer()
                        call.resolve()
                    }
                }
            }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        let text = call.getString("text")
        queue.async {
            guard self.running, !self.finishing, let task = self.task else {
                call.resolve()
                return
            }
            self.finishing = true
            self.stopAudio()
            // The last partial frame, then end-of-audio
            if !self.pending.isEmpty {
                self.sendSamples(self.pending)
                self.pending = []
            }
            if let text = text {
                task.send(.string(text)) { _ in }
            } else {
                task.send(.data(Data())) { _ in }
            }
            // The engine closes after its last results; don't wait forever
            let work = DispatchWorkItem {
                guard self.task === task else { return }
                task.cancel(with: .normalClosure, reason: nil)
                self.closed(code: 1000, reason: "")
            }
            self.finishWork = work
            self.queue.asyncAfter(deadline: .now() + NativeSttPlugin.finishTimeout, execute: work)
            call.resolve()
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        queue.async {
            self.task?.cancel(with: .normalClosure, reason: nil)
            self.teardown()
            call.resolve()
        }
    }

    @objc func drain(_ call: CAPPluginCall) {
        let after = call.getInt("after") ?? 0
        queue.async {
            let messages = self.kept
                .filter { $0.seq > after }
                .map { ["seq": $0.seq, "data": $0.data] as [String: Any] }
            call.resolve(["messages": messages])
        }
    }

    // MARK: - WebSocket

    private func receive(_ task: URLSessionWebSocketTask) {
        task.receive { result in
            self.queue.async {
                guard self.task === task else { return }
                switch result {
                case .success(let message):
                    switch message {
                    case .string(let text):
                        self.deliver(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) { self.deliver(text) }
                    @unknown default:
                        break
                    }
                    self.receive(task)
                case .failure(let error):
                    let code = task.closeCode == .invalid ? (self.finishing ? 1000 : 1006) : task.closeCode.rawValue
                    var reason = ""
                    if let data = task.closeReason { reason = String(data: data, encoding: .utf8) ?? "" }
                    if reason.isEmpty && code == 1006 { reason = error.localizedDescription }
                    self.closed(code: code, reason: reason)
                }
            }
        }
    }

    private func deliver(_ text: String) {
        seq += 1
        kept.append((seq: seq, data: text))
        if kept.count > NativeSttPlugin.maxKept { kept.removeFirst(kept.count - NativeSttPlugin.maxKept) }
        notifyListeners("message", data: ["seq": seq, "data": text])
    }

    private func closed(code: Int, reason: String) {
        guard task != nil else { return }
        teardown()
        notifyListeners("closed", data: ["code": code, "reason": reason])
    }

    // Stop everything without telling the page
    private func teardown() {
        stopAudio()
        timer?.cancel()
        timer = nil
        finishWork?.cancel()
        finishWork = nil
        task = nil
        session?.invalidateAndCancel()
        session = nil
        running = false
        finishing = false
        pending = []
    }

    private func startTimer() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { [weak self] in
            guard let self = self, self.running else { return }
            self.notifyListeners("progress", data: ["samples": self.samplesSent])
            if let keepalive = self.keepaliveMessage, !self.finishing,
               Date().timeIntervalSince(self.lastAudioAt) > NativeSttPlugin.keepaliveAfter {
                self.task?.send(.string(keepalive)) { _ in }
                self.lastAudioAt = Date()
            }
        }
        timer.resume()
        self.timer = timer
    }

    // MARK: - Audio

    private func requestMicrophone(_ done: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: done)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(done)
        }
    }

    // Raw audio by default (.measurement: no voice processing, which can
    // drop quiet or distant speakers); the 降噪 setting uses .voiceChat
    private func startAudio() throws {
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord,
                                     mode: processing ? .voiceChat : .measurement,
                                     options: [.allowBluetooth, .defaultToSpeaker, .mixWithOthers])
        try audioSession.setActive(true)

        let input = engine.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0, inFormat.channelCount > 0 else {
            throw NSError(domain: "NativeStt", code: 1, userInfo: [NSLocalizedDescriptionKey: "No microphone input"])
        }
        guard let outFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: targetRate,
                                            channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: inFormat, to: outFormat) else {
            throw NSError(domain: "NativeStt", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unsupported audio format"])
        }
        if tapInstalled { input.removeTap(onBus: 0) }
        // Runs on an audio thread; the converter is only used there
        input.installTap(onBus: 0, bufferSize: 4096, format: inFormat) { [weak self] buffer, _ in
            guard let self = self else { return }
            let ratio = outFormat.sampleRate / buffer.format.sampleRate
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
            guard let out = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: capacity) else { return }
            var consumed = false
            var error: NSError?
            converter.convert(to: out, error: &error) { _, status in
                if consumed {
                    status.pointee = .noDataNow
                    return nil
                }
                consumed = true
                status.pointee = .haveData
                return buffer
            }
            guard error == nil, out.frameLength > 0, let channel = out.int16ChannelData else { return }
            let samples = Array(UnsafeBufferPointer(start: channel[0], count: Int(out.frameLength)))
            self.queue.async { self.append(samples) }
        }
        tapInstalled = true
        engine.prepare()
        try engine.start()
    }

    private func stopAudio() {
        if tapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        if engine.isRunning { engine.stop() }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func append(_ samples: [Int16]) {
        guard running, !finishing else { return }
        pending.append(contentsOf: samples)
        while pending.count >= frameSamples {
            let frame = Array(pending.prefix(frameSamples))
            pending.removeFirst(frameSamples)
            sendSamples(frame)
        }
    }

    private func sendSamples(_ samples: [Int16]) {
        guard let task = task else { return }
        // PCM s16le (iOS is little-endian)
        let data = samples.withUnsafeBufferPointer { Data(buffer: $0) }
        task.send(.data(data)) { _ in }
        samplesSent += samples.count
        lastAudioAt = Date()
    }

    // A phone call or another app took the microphone: resume when it ends
    @objc private func audioInterrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw), type == .ended else { return }
        restartAudio()
    }

    // Headphones / Bluetooth plugged in or out, or the audio system reset:
    // the input format may have changed, so set the microphone up again
    @objc private func audioChanged(_ note: Notification) {
        restartAudio()
    }

    private func restartAudio() {
        queue.async {
            guard self.running, !self.finishing else { return }
            if self.engine.isRunning && self.tapInstalled { return }
            self.stopAudio()
            do {
                try self.startAudio()
            } catch {
                self.notifyListeners("error", data: ["message": "Microphone: \(error.localizedDescription)"])
            }
        }
    }
}
