import AVFoundation
import AVKit
import CoreMedia
import UIKit

// Floating captions (Picture in Picture) for the iPhone app, while recording.
//
// The page is suspended once the app is in the background, so the captions
// can't come from it: CaptionModel builds sentences from the speech engine's
// messages (Soniox tokens, as NativeSttPlugin receives them) and, while the
// window is showing, translates each finished sentence itself through the
// site's /api/translate (the user's login cookie, same model and usage as
// the page). CaptionPip draws
// the latest sentences into frames of an AVSampleBufferDisplayLayer and shows
// it with AVPictureInPictureController (iOS 15+): started by the page's
// button, or automatically when the app leaves the screen while recording.

struct CaptionConfig {
    let mode: String // two_way | one_way | presentation | transcribe
    let languageA: [String]
    let languageB: String
    // Multilingual: the one translation shown
    let displayLang: String
    let terms: [String]
    let uiLocale: String
    let translateURL: URL
    // Shown before the first sentence
    let waiting: String
    let autoStart: Bool

    init?(_ options: [AnyHashable: Any]) {
        guard let mode = options["mode"] as? String,
              let urlString = options["translateUrl"] as? String,
              let url = URL(string: urlString) else { return nil }
        self.mode = mode
        languageA = options["languageA"] as? [String] ?? []
        languageB = options["languageB"] as? String ?? ""
        displayLang = options["displayLang"] as? String ?? ""
        terms = options["terms"] as? [String] ?? []
        uiLocale = options["uiLocale"] as? String ?? "zh"
        translateURL = url
        waiting = options["waiting"] as? String ?? ""
        autoStart = options["autoStart"] as? Bool ?? true
    }

    var translates: Bool { mode != "transcribe" }

    // Same rule as the page (lib/meetingLanguages.ts singleTargetLanguage);
    // nil when the sentence is already in that language
    func target(for lang: String) -> String? {
        let target: String
        switch mode {
        case "transcribe": return nil
        case "presentation": target = displayLang
        case "two_way":
            let primaryA = languageA.first.map { $0 == "*" ? "zh" : $0 } ?? "zh"
            target = lang == languageB ? primaryA : languageB
        default: target = languageB
        }
        return target.isEmpty || target == lang ? nil : target
    }
}

struct CaptionLine {
    let original: String
    let translation: String?
    // A translation is on its way
    let pending: Bool
    // Still being spoken
    let live: Bool
}

// MARK: - Sentences and translations (on the plugin's queue)

final class CaptionModel {
    private struct Entry {
        let id: Int
        var text: String
        let lang: String
        var translation: String?
        var pending: Bool
    }

    private static let kept = 8

    private let config: CaptionConfig
    private let queue: DispatchQueue
    private var entries: [Entry] = []
    private var nextId = 1
    // Final tokens of the sentence being spoken
    private var tokens: [(text: String, lang: String)] = []
    private var speaker: String?
    private var interim = ""
    // "auth_token=…" from the web view, for /api/translate
    var cookie: String?
    // Translate only while the window is showing (the page translates the
    // same sentences for itself); when it opens, the sentences on screen
    var showing = false {
        didSet { if showing && !oldValue { translateVisible() } }
    }
    var onChange: (([CaptionLine]) -> Void)?

    init(config: CaptionConfig, queue: DispatchQueue) {
        self.config = config
        self.queue = queue
    }

    // One Soniox message: final tokens arrive once, non-final ones are the
    // current guess and replaced by the next message; <end> ends a sentence,
    // as does a new speaker (like the page's hook)
    func ingest(_ message: String) {
        guard let data = message.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = object["tokens"] as? [[String: Any]] else { return }
        var live = ""
        for token in list {
            guard let text = token["text"] as? String else { continue }
            if (token["translation_status"] as? String) == "translation" { continue }
            let isFinal = token["is_final"] as? Bool ?? false
            let trimmed = text.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("<") && trimmed.hasSuffix(">") {
                if isFinal && trimmed == "<end>" { finalize() }
                continue
            }
            guard isFinal else {
                live += text
                continue
            }
            let tokenSpeaker = (token["speaker"] as? String) ?? (token["speaker"] as? Int).map(String.init)
            if let tokenSpeaker = tokenSpeaker {
                if let current = speaker, current != tokenSpeaker, !tokens.isEmpty { finalize() }
                speaker = tokenSpeaker
            }
            tokens.append((text: text, lang: token["language"] as? String ?? ""))
        }
        interim = live
        if object["finished"] as? Bool == true {
            finalize()
            interim = ""
        }
        emit()
    }

    private func finalize() {
        let text = tokens.map(\.text).joined().trimmingCharacters(in: .whitespacesAndNewlines)
        let lang = CaptionModel.language(of: tokens, text: text)
        tokens = []
        guard !text.isEmpty else { return }
        // A lone "。" belongs to the sentence before
        let marks = CharacterSet.punctuationCharacters.union(.whitespaces).union(.symbols)
        if text.unicodeScalars.allSatisfy({ marks.contains($0) }) {
            if !entries.isEmpty { entries[entries.count - 1].text += text }
            return
        }
        let target = showing ? config.target(for: lang) : nil
        let context = entries.suffix(3).map(\.text)
        let entry = Entry(id: nextId, text: text, lang: lang, translation: nil, pending: target != nil)
        nextId += 1
        entries.append(entry)
        if entries.count > CaptionModel.kept { entries.removeFirst(entries.count - CaptionModel.kept) }
        if let target = target { translate(entry.id, text: text, from: lang, to: target, context: context) }
    }

    private func translateVisible() {
        for i in entries.indices.suffix(3) where entries[i].translation == nil && !entries[i].pending {
            guard let target = config.target(for: entries[i].lang) else { continue }
            entries[i].pending = true
            let context = entries[..<i].suffix(3).map(\.text)
            translate(entries[i].id, text: entries[i].text, from: entries[i].lang, to: target, context: Array(context))
        }
        emit()
    }

    private func translate(_ id: Int, text: String, from lang: String, to target: String, context: [String]) {
        var body: [String: Any] = ["text": text, "sourceLang": lang, "targetLang": target, "uiLocale": config.uiLocale]
        if !context.isEmpty { body["context"] = context }
        if !config.terms.isEmpty { body["terms"] = config.terms }
        var request = URLRequest(url: config.translateURL, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let cookie = cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let translated = (json?["translatedText"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            if translated == nil {
                NSLog("[pip] translate failed: status=\(status) \(error?.localizedDescription ?? "")")
            }
            self.queue.async {
                guard let i = self.entries.firstIndex(where: { $0.id == id }) else { return }
                self.entries[i].pending = false
                self.entries[i].translation = translated?.isEmpty == false ? translated : nil
                self.emit()
            }
        }.resume()
    }

    private func emit() {
        var lines = entries.map {
            CaptionLine(original: $0.text, translation: $0.translation, pending: $0.pending, live: false)
        }
        let speaking = (tokens.map(\.text).joined() + interim).trimmingCharacters(in: .whitespacesAndNewlines)
        if !speaking.isEmpty {
            lines.append(CaptionLine(original: speaking, translation: nil, pending: false, live: true))
        }
        onChange?(lines)
    }

    // The language covering most of the sentence: one unit per CJK
    // character, one per word elsewhere (like the page's hook)
    private static func language(of tokens: [(text: String, lang: String)], text: String) -> String {
        var units: [String: Int] = [:]
        for (i, token) in tokens.enumerated() where !token.lang.isEmpty {
            let cjk = token.text.unicodeScalars.filter(isCJK).count
            let words = (i == 0 || token.text.hasPrefix(" ")) && token.text.contains(where: \.isLetter) ? 1 : 0
            units[token.lang, default: 0] += cjk > 0 ? cjk : words
        }
        if let best = units.max(by: { $0.value < $1.value }), best.value > 0 { return best.key }
        let letters = text.unicodeScalars.filter { !CharacterSet.whitespaces.contains($0) }
        let cjk = letters.filter(isCJK).count
        return !letters.isEmpty && Double(cjk) / Double(letters.count) > 0.2 ? "zh" : "en"
    }

    private static func isCJK(_ s: Unicode.Scalar) -> Bool {
        switch s.value {
        case 0x4E00...0x9FFF, 0x3400...0x4DBF, 0x3040...0x30FF, 0xAC00...0xD7AF: return true
        default: return false
        }
    }
}

// MARK: - Picture in Picture (main thread)

final class CaptionPip: NSObject {
    // Frame size in points (drawn at 2x): small enough that the text stays
    // readable in the default PiP window; pinch it larger for more
    private static let size = CGSize(width: 480, height: 270)
    private static let translationFont = UIFont.systemFont(ofSize: 24, weight: .semibold)
    private static let originalFont = UIFont.systemFont(ofSize: 18)

    // The simulator has no PiP: there the frame is shown in a corner of the
    // screen instead, to check the captions while developing
    #if targetEnvironment(simulator)
    static var supported: Bool { true }
    private static let preview = true
    #else
    static var supported: Bool { AVPictureInPictureController.isPictureInPictureSupported() }
    private static let preview = false
    #endif

    // The layer must be in the window for PiP; a 2-point view in a corner
    private let hostView = UIView(frame: CGRect(x: 0, y: 0, width: 2, height: 2))
    private let displayLayer = AVSampleBufferDisplayLayer()
    private var controller: AVPictureInPictureController?
    private var lines: [CaptionLine] = []
    private var waiting = ""
    private var translates = true
    private var drawScheduled = false
    private var refresh: Timer?
    private var startTries = 0
    var onActive: ((Bool) -> Void)?

    // The simulator preview is always on screen
    var isActive: Bool { CaptionPip.preview || (controller?.isPictureInPictureActive ?? false) }

    func attach(to view: UIView) {
        if hostView.superview !== view {
            if CaptionPip.preview {
                hostView.frame = CGRect(x: 8, y: 110, width: 288, height: 162)
                hostView.autoresizingMask = []
            } else {
                hostView.frame = CGRect(x: 0, y: view.bounds.height - 2, width: 2, height: 2)
                hostView.autoresizingMask = [.flexibleTopMargin]
            }
            hostView.isUserInteractionEnabled = false
            view.addSubview(hostView)
        }
        guard controller == nil else { return }
        displayLayer.frame = hostView.bounds
        displayLayer.videoGravity = .resizeAspect
        hostView.layer.addSublayer(displayLayer)
        let source = AVPictureInPictureController.ContentSource(sampleBufferDisplayLayer: displayLayer, playbackDelegate: self)
        let controller = AVPictureInPictureController(contentSource: source)
        controller.delegate = self
        controller.requiresLinearPlayback = true
        self.controller = controller
    }

    // A new recording: no lines yet
    func reset(waiting: String, translates: Bool, autoStart: Bool) {
        self.waiting = waiting
        self.translates = translates
        lines = []
        controller?.canStartPictureInPictureAutomaticallyFromInline = autoStart
        draw()
    }

    func setAutoStart(_ on: Bool) {
        controller?.canStartPictureInPictureAutomaticallyFromInline = on
    }

    func update(_ lines: [CaptionLine]) {
        self.lines = lines
        // At most a few frames a second
        guard !drawScheduled else { return }
        drawScheduled = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            self.drawScheduled = false
            self.draw()
        }
    }

    // Right after the layer is set up PiP may not be possible yet: retry briefly
    func start(_ done: @escaping (Bool) -> Void) {
        guard let controller = controller else { return done(false) }
        if controller.isPictureInPictureActive { return done(true) }
        draw()
        if controller.isPictureInPicturePossible {
            startTries = 0
            controller.startPictureInPicture()
            return done(true)
        }
        startTries += 1
        guard startTries < 10 else {
            startTries = 0
            return done(false)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.start(done) }
    }

    func stop() {
        controller?.stopPictureInPicture()
    }

    // MARK: Drawing

    private func draw() {
        let size = CaptionPip.size
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(white: 0.07, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            drawText(in: size)
        }
        guard let sample = CaptionPip.sampleBuffer(from: image) else { return }
        if displayLayer.status == .failed { displayLayer.flush() }
        displayLayer.enqueue(sample)
    }

    // Newest at the bottom; older sentences move up and off the top
    private func drawText(in size: CGSize) {
        let pad: CGFloat = 14
        let width = size.width - pad * 2
        if lines.isEmpty {
            let text = NSAttributedString(string: waiting, attributes: [
                .font: CaptionPip.originalFont, .foregroundColor: UIColor(white: 0.7, alpha: 1),
            ])
            let rect = text.boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude),
                                         options: [.usesLineFragmentOrigin], context: nil)
            text.draw(with: CGRect(x: pad, y: (size.height - rect.height) / 2, width: width, height: rect.height),
                      options: [.usesLineFragmentOrigin], context: nil)
            return
        }
        var bottom = size.height - pad
        for line in lines.reversed() {
            let parts = attributed(line)
            let heights = parts.map {
                ceil($0.boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude),
                                     options: [.usesLineFragmentOrigin], context: nil).height)
            }
            let total = heights.reduce(0, +) + CGFloat(max(0, parts.count - 1)) * 2
            var y = bottom - total
            for (part, height) in zip(parts, heights) {
                part.draw(with: CGRect(x: pad, y: y, width: width, height: height),
                          options: [.usesLineFragmentOrigin], context: nil)
                y += height + 2
            }
            bottom -= total + 10
            if bottom < 0 { break }
        }
    }

    // Translating modes: the original small and grey, the translation large;
    // transcribe-only: the original large
    private func attributed(_ line: CaptionLine) -> [NSAttributedString] {
        let white = UIColor.white
        let grey = UIColor(white: 0.72, alpha: 1)
        let dim = UIColor(white: 0.55, alpha: 1)
        // Transcribe-only, or a sentence already in the target language: the
        // original is what there is to read
        guard translates, line.live || line.pending || line.translation != nil else {
            return [NSAttributedString(string: line.original, attributes: [
                .font: CaptionPip.translationFont, .foregroundColor: line.live ? grey : white,
            ])]
        }
        var parts = [NSAttributedString(string: line.original, attributes: [
            .font: CaptionPip.originalFont, .foregroundColor: line.live ? dim : grey,
        ])]
        if let translation = line.translation {
            parts.append(NSAttributedString(string: translation, attributes: [
                .font: CaptionPip.translationFont, .foregroundColor: white,
            ]))
        } else if line.pending {
            parts.append(NSAttributedString(string: "…", attributes: [
                .font: CaptionPip.translationFont, .foregroundColor: dim,
            ]))
        }
        return parts
    }

    private static func sampleBuffer(from image: UIImage) -> CMSampleBuffer? {
        guard let cgImage = image.cgImage else { return nil }
        let width = cgImage.width
        let height = cgImage.height
        let attributes: [String: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        ]
        var pixelBuffer: CVPixelBuffer?
        guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA,
                                  attributes as CFDictionary, &pixelBuffer) == kCVReturnSuccess,
              let pixels = pixelBuffer else { return nil }
        CVPixelBufferLockBaseAddress(pixels, [])
        let context = CGContext(data: CVPixelBufferGetBaseAddress(pixels), width: width, height: height,
                                bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pixels),
                                space: CGColorSpaceCreateDeviceRGB(),
                                bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        context?.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        CVPixelBufferUnlockBaseAddress(pixels, [])
        guard context != nil else { return nil }

        var format: CMVideoFormatDescription?
        CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pixels,
                                                     formatDescriptionOut: &format)
        guard let formatDescription = format else { return nil }
        var timing = CMSampleTimingInfo(duration: .invalid,
                                        presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
                                        decodeTimeStamp: .invalid)
        var sample: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pixels,
                                                 formatDescription: formatDescription, sampleTiming: &timing,
                                                 sampleBufferOut: &sample)
        guard let sampleBuffer = sample else { return nil }
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true),
           CFArrayGetCount(attachments) > 0 {
            let dictionary = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(dictionary,
                                 Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                                 Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
        }
        return sampleBuffer
    }
}

extension CaptionPip: AVPictureInPictureSampleBufferPlaybackDelegate {
    func pictureInPictureController(_ controller: AVPictureInPictureController, setPlaying playing: Bool) {}

    // Live: no timeline, no play / pause
    func pictureInPictureControllerTimeRangeForPlayback(_ controller: AVPictureInPictureController) -> CMTimeRange {
        CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
    }

    func pictureInPictureControllerIsPlaybackPaused(_ controller: AVPictureInPictureController) -> Bool { false }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    didTransitionToRenderSize newRenderSize: CMVideoDimensions) {}

    func pictureInPictureController(_ controller: AVPictureInPictureController, skipByInterval skipInterval: CMTime,
                                    completion completionHandler: @escaping () -> Void) {
        completionHandler()
    }
}

extension CaptionPip: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        // A fresh frame now and then, so the window never shows a stale or empty layer
        refresh?.invalidate()
        refresh = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.draw() }
        onActive?(true)
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        refresh?.invalidate()
        refresh = nil
        onActive?(false)
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    failedToStartPictureInPictureWithError error: Error) {
        NSLog("[pip] failed to start: \(error.localizedDescription)")
        onActive?(false)
    }

    // The window's "back to app" button
    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
        completionHandler(true)
    }
}
