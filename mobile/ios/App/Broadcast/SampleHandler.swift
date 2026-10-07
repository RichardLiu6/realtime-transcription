import ReplayKit
import CoreMedia
import Foundation

// ReplayKit broadcast upload extension: gets what the phone plays (other
// apps' audio — Zoom, Teams, WeChat calls; captured before the earphones, so
// it works with them) and, when the user turns it on in the picker, the
// microphone. Both are mixed to 16 kHz mono PCM16 and streamed to the speech
// engine; the engine's messages go to the app through the App Group
// (BroadcastShared). Video frames are ignored. Memory limit: 50 MB.
class SampleHandler: RPBroadcastSampleHandler {
    // Without audio for this long, send the engine's keepalive
    private static let keepaliveAfter: TimeInterval = 5
    // After end-of-audio, wait this long for the engine to close
    private static let finishTimeout: TimeInterval = 3
    // Keep at most this much unsent audio per source (seconds)
    private static let maxQueued = 2.0

    // All state below is touched on this serial queue only
    private let queue = DispatchQueue(label: "com.americanbestlife.translate.Broadcast")
    private var config: BroadcastShared.Config?
    private var session: URLSession?
    private var task: URLSessionWebSocketTask?
    private var messages: FileHandle?
    private var timer: DispatchSourceTimer?
    private var appQueue: [Float] = []
    private var micQueue: [Float] = []
    private let appResampler = Resampler()
    private let micResampler = Resampler()
    private var frameSamples = 1600
    private var targetRate: Double = 16000
    private var samplesSent = 0
    private var lastAudioAt = Date()
    private var lastStateAt = Date.distantPast
    private var running = false
    private var finishing = false
    private var closed = false

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        // Started from the app (it wrote the connection details just before
        // showing the picker); not from Control Center on its own
        guard let config = BroadcastShared.read(BroadcastShared.Config.self, from: "config.json"),
              Date().timeIntervalSince(config.createdAt) < 120,
              let url = URL(string: config.url) else {
            fail("请在 ABL Translate 里点“开始录音”来开始。Start recording in ABL Translate.")
            return
        }
        queue.async { self.connect(config, url) }
    }

    override func broadcastFinished() {
        // Stopped from the red status bar / Control Center: end-of-audio,
        // then give the engine a moment for its last results
        let done = DispatchSemaphore(value: 0)
        queue.async {
            self.finish(text: nil) { done.signal() }
        }
        _ = done.wait(timeout: .now() + SampleHandler.finishTimeout + 0.5)
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        switch sampleBufferType {
        case .audioApp, .audioMic:
            guard let (mono, rate) = Self.monoSamples(sampleBuffer) else { return }
            let isApp = sampleBufferType == .audioApp
            queue.async {
                guard self.running, !self.finishing else { return }
                let resampler = isApp ? self.appResampler : self.micResampler
                let out = resampler.process(mono, from: rate, to: self.targetRate)
                let limit = Int(self.targetRate * SampleHandler.maxQueued)
                if isApp {
                    self.appQueue.append(contentsOf: out)
                    if self.appQueue.count > limit { self.appQueue.removeFirst(self.appQueue.count - limit) }
                } else {
                    self.micQueue.append(contentsOf: out)
                    if self.micQueue.count > limit { self.micQueue.removeFirst(self.micQueue.count - limit) }
                }
            }
        default:
            break // video
        }
    }

    // MARK: - Engine connection

    private func connect(_ config: BroadcastShared.Config, _ url: URL) {
        self.config = config
        targetRate = config.sampleRate
        frameSamples = max(1, Int(config.sampleRate * config.frameMs / 1000))
        BroadcastShared.remove("command.json")
        if let fileURL = BroadcastShared.url("messages.txt") {
            if !FileManager.default.fileExists(atPath: fileURL.path) {
                FileManager.default.createFile(atPath: fileURL.path, contents: nil)
            }
            messages = try? FileHandle(forWritingTo: fileURL)
            _ = try? messages?.seekToEnd()
        }

        let session = URLSession(configuration: .default)
        let task = session.webSocketTask(with: url)
        self.session = session
        self.task = task
        task.resume()
        task.send(.string(config.openMessage)) { error in
            self.queue.async {
                guard self.task === task else { return }
                if let error = error {
                    self.close(code: 1006, reason: "Connection failed: \(error.localizedDescription)")
                    self.fail("连接语音引擎失败 / Connection failed: \(error.localizedDescription)")
                    return
                }
                self.running = true
                self.lastAudioAt = Date()
                self.writeState("started")
                self.receive(task)
                self.startTimer()
            }
        }
    }

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
                    let wasFinishing = self.finishing
                    self.close(code: code, reason: reason)
                    if !wasFinishing { self.fail("语音引擎断开 / Engine disconnected: \(reason)") }
                }
            }
        }
    }

    // One line per message: a JSON array keeps newlines inside the message
    private func deliver(_ text: String) {
        guard let line = try? JSONSerialization.data(withJSONObject: [text]) else { return }
        messages?.write(line + Data([0x0A]))
    }

    // MARK: - Audio out

    private func startTimer() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 0.1, repeating: 0.1)
        timer.setEventHandler { [weak self] in self?.tick() }
        timer.resume()
        self.timer = timer
    }

    private func tick() {
        guard running else { return }
        if !finishing, let command = BroadcastShared.read(BroadcastShared.Command.self, from: "command.json"),
           command.id == config?.id {
            BroadcastShared.remove("command.json")
            if command.cmd == "cancel" {
                task?.cancel(with: .normalClosure, reason: nil)
                close(code: 1000, reason: "")
                fail("已停止 / Stopped")
                return
            }
            finish(text: command.text) {
                self.fail("已停止录音 / Recording stopped")
            }
            return
        }
        guard !finishing else { return }
        // Whole frames while both sources keep up; what's there after a pause
        var sent = 0
        while max(appQueue.count, micQueue.count) >= frameSamples, sent < 4 {
            sendMixed(frameSamples)
            sent += 1
        }
        if sent == 0, max(appQueue.count, micQueue.count) > 0, Date().timeIntervalSince(lastAudioAt) > 0.3 {
            sendMixed(max(appQueue.count, micQueue.count))
        }
        if let keepalive = config?.keepaliveMessage, Date().timeIntervalSince(lastAudioAt) > SampleHandler.keepaliveAfter {
            task?.send(.string(keepalive)) { _ in }
            lastAudioAt = Date()
        }
        if Date().timeIntervalSince(lastStateAt) >= 1 { writeState("started") }
    }

    // Phone audio + microphone, summed (with earphones they don't overlap;
    // through the speaker the mic also hears the phone — use earphones)
    private func sendMixed(_ count: Int) {
        var out = [Int16](repeating: 0, count: count)
        let a = min(count, appQueue.count)
        let m = min(count, micQueue.count)
        for i in 0..<count {
            var v: Float = 0
            if i < a { v += appQueue[i] }
            if i < m { v += micQueue[i] }
            out[i] = Int16(max(-1, min(1, v)) * 32767)
        }
        appQueue.removeFirst(a)
        micQueue.removeFirst(m)
        let data = out.withUnsafeBufferPointer { Data(buffer: $0) }
        task?.send(.data(data)) { _ in }
        samplesSent += count
        lastAudioAt = Date()
    }

    // MARK: - Ending

    private func finish(text: String?, then done: @escaping () -> Void) {
        guard running, !finishing, let task = task else {
            done()
            return
        }
        finishing = true
        let rest = max(appQueue.count, micQueue.count)
        if rest > 0 { sendMixed(rest) }
        if let text = text {
            task.send(.string(text)) { _ in }
        } else {
            task.send(.data(Data())) { _ in }
        }
        // The engine closes after its last results (receive → close); don't
        // wait forever
        queue.asyncAfter(deadline: .now() + SampleHandler.finishTimeout) {
            if self.task === task {
                task.cancel(with: .normalClosure, reason: nil)
                self.close(code: 1000, reason: "")
            }
            done()
        }
    }

    private func close(code: Int, reason: String) {
        guard !closed else { return }
        closed = true
        running = false
        timer?.cancel()
        timer = nil
        task = nil
        session?.invalidateAndCancel()
        session = nil
        try? messages?.synchronize()
        try? messages?.close()
        messages = nil
        writeState("closed", code: code, reason: reason)
    }

    private func writeState(_ status: String, code: Int? = nil, reason: String? = nil) {
        guard let id = config?.id else { return }
        lastStateAt = Date()
        BroadcastShared.write(BroadcastShared.State(id: id, status: status, samples: samplesSent,
                                                    code: code, reason: reason), to: "state.json")
    }

    private func fail(_ message: String) {
        finishBroadcastWithError(NSError(domain: "ABLTranslate", code: 1,
                                         userInfo: [NSLocalizedDescriptionKey: message]))
    }

    // MARK: - Sample conversion

    // Mono float samples and their rate, from 16-bit or float PCM, any
    // channel count, interleaved or not, either byte order (app audio often
    // comes big-endian)
    private static func monoSamples(_ buffer: CMSampleBuffer) -> ([Float], Double)? {
        guard let format = CMSampleBufferGetFormatDescription(buffer),
              let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(format) else { return nil }
        let asbd = asbdPointer.pointee
        guard asbd.mFormatID == kAudioFormatLinearPCM, asbd.mSampleRate > 0 else { return nil }
        let isFloat = asbd.mFormatFlags & kAudioFormatFlagIsFloat != 0
        let bigEndian = asbd.mFormatFlags & kAudioFormatFlagIsBigEndian != 0
        let nonInterleaved = asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0
        let bits = Int(asbd.mBitsPerChannel)
        let channels = max(1, Int(asbd.mChannelsPerFrame))
        guard (isFloat && bits == 32) || (!isFloat && bits == 16) else { return nil }
        let frames = CMSampleBufferGetNumSamples(buffer)
        guard frames > 0 else { return nil }

        var blockBuffer: CMBlockBuffer?
        var listSize = 0
        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            buffer, bufferListSizeNeededOut: &listSize, bufferListOut: nil, bufferListSize: 0,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: 0, blockBufferOut: nil)
        guard listSize > 0 else { return nil }
        let listMemory = UnsafeMutableRawPointer.allocate(byteCount: listSize,
                                                          alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { listMemory.deallocate() }
        let list = listMemory.bindMemory(to: AudioBufferList.self, capacity: 1)
        guard CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            buffer, bufferListSizeNeededOut: nil, bufferListOut: list, bufferListSize: listSize,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            blockBufferOut: &blockBuffer) == noErr else { return nil }

        let buffers = UnsafeMutableAudioBufferListPointer(list)
        var mono = [Float](repeating: 0, count: frames)
        // One buffer per channel (non-interleaved) or all channels in one
        let streams = nonInterleaved ? buffers.count : 1
        let perBuffer = nonInterleaved ? 1 : channels
        for b in 0..<min(streams, buffers.count) {
            guard let raw = buffers[b].mData else { continue }
            let count = Int(buffers[b].mDataByteSize) / (bits / 8)
            for f in 0..<frames {
                for c in 0..<perBuffer {
                    let index = f * perBuffer + c
                    guard index < count else { break }
                    var v: Float
                    if isFloat {
                        var bitsValue = raw.load(fromByteOffset: index * 4, as: UInt32.self)
                        if bigEndian { bitsValue = bitsValue.byteSwapped }
                        v = Float(bitPattern: bitsValue)
                    } else {
                        var s = raw.load(fromByteOffset: index * 2, as: Int16.self)
                        if bigEndian { s = s.byteSwapped }
                        v = Float(s) / 32768
                    }
                    mono[f] += v
                }
            }
        }
        let scale = 1 / Float(channels)
        for i in 0..<frames { mono[i] *= scale }
        return (mono, asbd.mSampleRate)
    }
}

// Linear-interpolation resampler that carries its position across buffers;
// a box filter over one output period first, so 48 kHz → 16 kHz doesn't alias
final class Resampler {
    private var position: Double = 0 // in input samples; -1 = the previous buffer's last
    private var previous: Float = 0

    func process(_ input: [Float], from rate: Double, to target: Double) -> [Float] {
        guard !input.isEmpty else { return [] }
        if rate == target { return input }
        let step = rate / target
        var x = input
        let width = Int(step.rounded())
        if width > 1 {
            var sum: Float = 0
            var filtered = [Float](repeating: 0, count: x.count)
            for i in 0..<x.count {
                sum += x[i]
                if i >= width { sum -= x[i - width] }
                filtered[i] = sum / Float(min(i + 1, width))
            }
            x = filtered
        }
        var out: [Float] = []
        out.reserveCapacity(Int(Double(x.count) / step) + 2)
        let last = Double(x.count - 1)
        while position <= last {
            let i = Int(position.rounded(.down))
            let frac = Float(position - Double(i))
            let a = i < 0 ? previous : x[i]
            let b = i + 1 < x.count ? x[i + 1] : a
            out.append(a + (b - a) * frac)
            position += step
        }
        position -= Double(x.count)
        previous = x[x.count - 1]
        return out
    }
}
