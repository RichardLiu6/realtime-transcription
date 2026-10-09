import AVFoundation
import AVKit
import CoreMedia
import UIKit

// Floating captions (Picture in Picture) for the iPhone app, while recording.
//
// The page is suspended once the app is in the background, so the captions
// can't come from it: CaptionModel builds sentences from the speech engine's
// messages (Soniox tokens, as NativeSttPlugin receives them) and, while the
// window is showing, translates them itself through the site's
// /api/translate (the user's login cookie, same model and usage as the
// page) — clause by clause, like the page's 分句 engine: a clause is cut at
// punctuation and its translation continues the sentence's, so what is on
// screen is only ever appended to; the part still being spoken gets a
// provisional translation (grey) every 1.5 s. CaptionPip draws the latest
// sentences into frames of an AVSampleBufferDisplayLayer and shows them with
// AVPictureInPictureController (iOS 15+): started by the page's button, or
// automatically when the app leaves the screen while recording. The
// window's skip buttons page back / forward through earlier sentences and
// its play / pause button holds the captions.

// The user's choices (page: 悬浮字幕 settings)
struct CaptionPrefs {
    static let translationSizes: [CGFloat] = [20, 24, 30, 36]
    // 0 小 · 1 中 · 2 大 · 3 特大
    var fontLevel = 1
    // Share of the height for the original: 0 (not shown), 0.2 or 0.4
    var originalShare: CGFloat = 0

    init() {}

    init(_ options: [AnyHashable: Any]) {
        fontLevel = min(3, max(0, (options["fontSize"] as? NSNumber)?.intValue ?? 1))
        let share = CGFloat((options["originalShare"] as? NSNumber)?.doubleValue ?? 0)
        originalShare = [0, 0.2, 0.4].min(by: { abs($0 - share) < abs($1 - share) }) ?? 0
    }
}

struct CaptionConfig {
    let mode: String // two_way | one_way | presentation | transcribe
    let languageA: [String]
    let languageB: String
    // Multilingual: the one translation shown
    let displayLang: String
    let terms: [String]
    let uiLocale: String
    let translateURL: URL
    let autoStart: Bool
    let prefs: CaptionPrefs
    // Interface texts: before the first sentence, browsing back, held
    let waiting: String
    let reviewing: String
    let held: String

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
        autoStart = options["autoStart"] as? Bool ?? true
        prefs = (options["prefs"] as? [AnyHashable: Any]).map(CaptionPrefs.init) ?? CaptionPrefs()
        let labels = options["labels"] as? [String: String] ?? [:]
        waiting = labels["waiting"] ?? ""
        reviewing = labels["reviewing"] ?? ""
        held = labels["held"] ?? ""
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

// What the window shows of one sentence
struct CaptionSentence {
    let original: String
    // Settled translation (never rewritten), then the provisional rest
    let translation: String
    let draft: String
    // No target language: the original is the caption
    let sameLanguage: Bool
    let newSpeaker: Bool
    let live: Bool
}

struct CaptionSnapshot {
    var sentences: [CaptionSentence] = []
    var lastSpeech = Date()
}

// MARK: - Sentences and translations (on the plugin's queue)

final class CaptionModel {
    private final class Sentence {
        let speaker: String?
        let newSpeaker: Bool
        var tokens: [(text: String, lang: String)] = []
        var finished = false
        // Characters of the text already cut into clauses
        var committed = 0
        // Cut, waiting to be translated (sent together, in order)
        var clauses: [String] = []
        // Source and translation settled so far
        var sourceDone = ""
        var translation = ""
        var lang = ""
        var targetDecided = false
        var target: String?
        var translating = false
        var draft = ""
        var draftFor = ""

        init(speaker: String?, newSpeaker: Bool) {
            self.speaker = speaker
            self.newSpeaker = newSpeaker
        }

        var text: String { tokens.map(\.text).joined() }
    }

    private static let kept = 12
    private static let draftEvery: TimeInterval = 1.5

    private let config: CaptionConfig
    private let queue: DispatchQueue
    private var sentences: [Sentence] = []
    private var interim = ""
    private var lastSpeech = Date()
    private var draftTimer: DispatchSourceTimer?
    private var draftInFlight = false
    // For feedback: how translation went this session
    private(set) var requests = 0
    private(set) var failures = 0
    private(set) var totalMs = 0
    // "auth_token=…" from the web view, for /api/translate
    var cookie: String?
    // Translate only while the window is showing (the page translates the
    // same sentences for itself); when it opens, the last sentences
    var showing = false {
        didSet {
            guard showing != oldValue else { return }
            if showing {
                startDrafts()
                translateRecent()
            } else {
                draftTimer?.cancel()
                draftTimer = nil
            }
        }
    }
    var onChange: ((CaptionSnapshot) -> Void)?

    init(config: CaptionConfig, queue: DispatchQueue) {
        self.config = config
        self.queue = queue
    }

    deinit {
        draftTimer?.cancel()
    }

    var stats: [String: Any] {
        ["requests": requests, "failures": failures, "avgMs": requests > 0 ? totalMs / requests : 0]
    }

    private var current: Sentence? {
        guard let last = sentences.last, !last.finished else { return nil }
        return last
    }

    // One Soniox message: final tokens arrive once, non-final ones are the
    // current guess and replaced by the next message; <end> ends a sentence,
    // as does a new speaker (like the page's hook)
    func ingest(_ message: String) {
        guard let data = message.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = object["tokens"] as? [[String: Any]] else { return }
        var live = ""
        var heard = false
        for token in list {
            guard let text = token["text"] as? String else { continue }
            if (token["translation_status"] as? String) == "translation" { continue }
            let isFinal = token["is_final"] as? Bool ?? false
            let trimmed = text.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("<") && trimmed.hasSuffix(">") {
                if isFinal && trimmed == "<end>" { endSentence() }
                continue
            }
            if !trimmed.isEmpty { heard = true }
            guard isFinal else {
                live += text
                continue
            }
            let speaker = (token["speaker"] as? String) ?? (token["speaker"] as? Int).map(String.init)
            if let s = current, let speaker = speaker, let was = s.speaker, was != speaker { endSentence() }
            let sentence = current ?? newSentence(speaker: speaker)
            sentence.tokens.append((text: text, lang: token["language"] as? String ?? ""))
        }
        interim = live
        if heard { lastSpeech = Date() }
        if object["finished"] as? Bool == true {
            endSentence()
            interim = ""
        }
        if let s = current { cut(s) }
        pump()
        emit()
    }

    private func newSentence(speaker: String?) -> Sentence {
        let previous = sentences.last?.speaker
        let sentence = Sentence(speaker: speaker, newSpeaker: previous != nil && speaker != nil && previous != speaker)
        sentences.append(sentence)
        if sentences.count > CaptionModel.kept { sentences.removeFirst(sentences.count - CaptionModel.kept) }
        return sentence
    }

    private func endSentence() {
        guard let s = current else { return }
        s.finished = true
        let text = s.text.trimmingCharacters(in: .whitespacesAndNewlines)
        // A lone "。" belongs to the sentence before
        let marks = CharacterSet.punctuationCharacters.union(.whitespaces).union(.symbols)
        if text.isEmpty || text.unicodeScalars.allSatisfy({ marks.contains($0) }) {
            sentences.removeLast()
            if let previous = sentences.last, !text.isEmpty { previous.tokens.append((text: text, lang: previous.lang)) }
            return
        }
        let rest = String(s.text.dropFirst(s.committed))
        if !rest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { s.clauses.append(rest) }
        s.committed = s.text.count
    }

    // Clauses end at ，。！？；：…、 or ,.!?;: followed by a space (so 3.5
    // doesn't split); short ones (under 4 CJK characters / 3 words) join the
    // next; 20 units without punctuation are cut at the last space
    private func cut(_ s: Sentence) {
        while true {
            let rest = Array(s.text.dropFirst(s.committed))
            guard !rest.isEmpty else { return }
            var length: Int?
            for i in rest.indices {
                let c = rest[i]
                let mark = "，。！？；：…、".contains(c) || (",.!?;:".contains(c) && i + 1 < rest.count && rest[i + 1].isWhitespace)
                if mark && CaptionModel.longEnough(String(rest[...i])) {
                    length = i + 1
                    break
                }
            }
            if length == nil, CaptionModel.units(String(rest)) >= 20 {
                if let space = rest.lastIndex(where: \.isWhitespace), space > 0 { length = space + 1 } else { length = rest.count }
            }
            guard let n = length else { return }
            s.clauses.append(String(rest[..<n]))
            s.committed += n
        }
    }

    private func decideTarget(_ s: Sentence) {
        guard !s.targetDecided else { return }
        s.lang = CaptionModel.language(of: s.tokens, text: s.text)
        s.target = config.target(for: s.lang)
        s.targetDecided = true
    }

    // Each sentence's clauses go out in order, one request at a time
    private func pump() {
        guard showing else { return }
        for s in sentences where !s.translating && !s.clauses.isEmpty {
            decideTarget(s)
            let next = s.clauses.joined()
            s.clauses = []
            guard let target = s.target else {
                s.sourceDone += next
                continue
            }
            s.translating = true
            let continues = !s.translation.isEmpty
            translate(s, next, to: target, continues: continues, provisional: false) { [weak self] text in
                guard let self = self else { return }
                var part = (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                // A model that restates the sentence so far
                if continues, part.hasPrefix(s.translation) {
                    part = String(part.dropFirst(s.translation.count)).trimmingCharacters(in: .whitespaces)
                }
                if text != nil, part.isEmpty, continues {
                    // Nothing came back: the clause on its own
                    self.translate(s, next, to: target, continues: false, provisional: false) { retry in
                        self.settle(s, next, retry?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "", target)
                    }
                    return
                }
                self.settle(s, next, part, target)
            }
        }
    }

    private func settle(_ s: Sentence, _ source: String, _ part: String, _ target: String) {
        s.sourceDone += source
        s.translation = CaptionModel.join(s.translation, part, target)
        s.translating = false
        s.draft = ""
        s.draftFor = ""
        pump()
        emit()
    }

    // The window opened: the last two sentences (and the one being spoken)
    // get translated; older ones keep only their original
    private func translateRecent() {
        let recent = Set(sentences.suffix(2).map(ObjectIdentifier.init))
        for s in sentences where !recent.contains(ObjectIdentifier(s)) {
            s.clauses = []
        }
        pump()
        emit()
    }

    private func startDrafts() {
        draftTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + CaptionModel.draftEvery, repeating: CaptionModel.draftEvery)
        timer.setEventHandler { [weak self] in self?.draft() }
        timer.resume()
        draftTimer = timer
    }

    // A provisional translation of what is still being said, continuing the
    // settled part; replaced when its clause is translated
    private func draft() {
        guard showing, !draftInFlight, let s = current, !s.translating, s.clauses.isEmpty else { return }
        let tail = (String(s.text.dropFirst(s.committed)) + interim).trimmingCharacters(in: .whitespacesAndNewlines)
        guard CaptionModel.units(tail) >= 2, tail != s.draftFor else { return }
        decideTarget(s)
        guard let target = s.target else { return }
        draftInFlight = true
        translate(s, tail, to: target, continues: !s.translation.isEmpty, provisional: true) { [weak self] text in
            guard let self = self else { return }
            self.draftInFlight = false
            guard let text = text, !s.finished else { return }
            var part = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !s.translation.isEmpty, part.hasPrefix(s.translation) {
                part = String(part.dropFirst(s.translation.count)).trimmingCharacters(in: .whitespaces)
            }
            s.draft = part
            s.draftFor = tail
            self.emit()
        }
    }

    private func translate(_ s: Sentence, _ text: String, to target: String, continues: Bool, provisional: Bool,
                           done: @escaping (String?) -> Void) {
        var body: [String: Any] = ["text": text, "sourceLang": s.lang, "targetLang": target, "uiLocale": config.uiLocale]
        if continues {
            body["continuation"] = ["sourceSoFar": s.sourceDone, "translationSoFar": s.translation]
        } else if let i = sentences.firstIndex(where: { $0 === s }) {
            let context = sentences[..<i].suffix(3).map(\.text)
            if !context.isEmpty { body["context"] = context }
        }
        if !config.terms.isEmpty { body["terms"] = config.terms }
        if provisional { body["provisional"] = true }
        var request = URLRequest(url: config.translateURL, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let cookie = cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        let started = Date()
        URLSession.shared.dataTask(with: request) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let translated = json?["translatedText"] as? String
            self.queue.async {
                self.requests += 1
                self.totalMs += Int(Date().timeIntervalSince(started) * 1000)
                if translated == nil {
                    self.failures += 1
                    NSLog("[pip] translate failed: status=\(status) \(error?.localizedDescription ?? "")")
                }
                done(translated)
            }
        }.resume()
    }

    private func emit() {
        var out: [CaptionSentence] = []
        for s in sentences {
            let original = (s.finished ? s.text : s.text + interim).trimmingCharacters(in: .whitespacesAndNewlines)
            let target = s.targetDecided ? s.target : config.target(for: CaptionModel.language(of: s.tokens, text: original))
            out.append(CaptionSentence(original: original, translation: s.translation, draft: s.draft,
                                       sameLanguage: !config.translates || target == nil,
                                       newSpeaker: s.newSpeaker, live: !s.finished))
        }
        // Heard, but no final word yet
        if current == nil, !interim.trimmingCharacters(in: .whitespaces).isEmpty {
            let lang = CaptionModel.language(of: [], text: interim)
            out.append(CaptionSentence(original: interim.trimmingCharacters(in: .whitespaces), translation: "", draft: "",
                                       sameLanguage: !config.translates || config.target(for: lang) == nil,
                                       newSpeaker: false, live: true))
        }
        onChange?(CaptionSnapshot(sentences: out, lastSpeech: lastSpeech))
    }

    // MARK: Text helpers

    static func join(_ a: String, _ b: String, _ target: String) -> String {
        if a.isEmpty { return b }
        if b.isEmpty { return a }
        return ["zh", "ja", "ko"].contains(target) ? a + b : a + " " + b
    }

    // One unit per CJK character, one per word elsewhere
    static func units(_ text: String) -> Int {
        let cjk = text.unicodeScalars.filter(isCJK).count
        let words = text.split(whereSeparator: { $0.isWhitespace || isCJK($0.unicodeScalars.first!) })
            .filter { $0.contains(where: \.isLetter) }.count
        return cjk + words
    }

    private static func longEnough(_ clause: String) -> Bool {
        let cjk = clause.unicodeScalars.filter(isCJK).count
        return cjk > 0 ? units(clause) >= 4 : units(clause) >= 3
    }

    // The language covering most of the sentence (like the page's hook)
    static func language(of tokens: [(text: String, lang: String)], text: String) -> String {
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

    static func isCJK(_ s: Unicode.Scalar) -> Bool {
        switch s.value {
        case 0x4E00...0x9FFF, 0x3400...0x4DBF, 0x3040...0x30FF, 0xAC00...0xD7AF: return true
        default: return false
        }
    }
}

// MARK: - Picture in Picture (main thread)

final class CaptionPip: NSObject {
    // Frame size in points (drawn at 2x); the window scales it
    private static let size = CGSize(width: 480, height: 270)
    // Quiet for this long: the captions dim; then they clear
    private static let dimAfter: TimeInterval = 6
    private static let clearAfter: TimeInterval = 15

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
    private var snapshot = CaptionSnapshot()
    private var prefs = CaptionPrefs()
    private var translates = true
    private var labels = (waiting: "", reviewing: "", held: "")
    // Browsing: sentences hidden from the end; held: the captions as they were
    private var offset = 0
    private var heldSnapshot: CaptionSnapshot?
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
        // Skip buttons page through earlier sentences
        controller.requiresLinearPlayback = false
        self.controller = controller
    }

    // A new recording: no sentences yet
    func reset(_ config: CaptionConfig) {
        labels = (config.waiting, config.reviewing, config.held)
        translates = config.translates
        prefs = config.prefs
        snapshot = CaptionSnapshot()
        offset = 0
        heldSnapshot = nil
        controller?.canStartPictureInPictureAutomaticallyFromInline = config.autoStart
        controller?.invalidatePlaybackState()
        draw()
    }

    func setAutoStart(_ on: Bool) {
        controller?.canStartPictureInPictureAutomaticallyFromInline = on
    }

    func setPrefs(_ prefs: CaptionPrefs) {
        self.prefs = prefs
        draw()
    }

    func update(_ snapshot: CaptionSnapshot) {
        self.snapshot = snapshot
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
            drawCaptions(in: size, context: context.cgContext)
        }
        guard let sample = CaptionPip.sampleBuffer(from: image) else { return }
        if displayLayer.status == .failed { displayLayer.flush() }
        displayLayer.enqueue(sample)
    }

    private func drawCaptions(in size: CGSize, context: CGContext) {
        let pad: CGFloat = 12
        let base = heldSnapshot ?? snapshot
        let sentences = Array(base.sentences.dropLast(offset))
        let browsing = offset > 0 || heldSnapshot != nil
        let quiet = browsing ? 0 : Date().timeIntervalSince(base.lastSpeech)
        let mainSize = CaptionPrefs.translationSizes[prefs.fontLevel]
        let mainFont = UIFont.systemFont(ofSize: mainSize, weight: .semibold)
        let smallFont = UIFont.systemFont(ofSize: round(mainSize * 0.7))

        if sentences.isEmpty || quiet > CaptionPip.clearAfter {
            let text = NSAttributedString(string: labels.waiting, attributes: [
                .font: smallFont, .foregroundColor: UIColor(white: 0.7, alpha: 1),
            ])
            let height = text.boundingRect(with: CGSize(width: size.width - pad * 2, height: .greatestFiniteMagnitude),
                                           options: [.usesLineFragmentOrigin], context: nil).height
            text.draw(with: CGRect(x: pad, y: (size.height - height) / 2, width: size.width - pad * 2, height: height),
                      options: [.usesLineFragmentOrigin], context: nil)
            return
        }

        let dim: CGFloat = quiet > CaptionPip.dimAfter ? 0.45 : 1
        let white = UIColor(white: 1, alpha: dim)
        let grey = UIColor(white: 0.62, alpha: dim)
        var mainRect = CGRect(x: pad, y: pad * 0.6, width: size.width - pad * 2, height: size.height - pad * 1.2)

        // The original, if chosen: its share at the top, latest lines
        if translates && prefs.originalShare > 0 {
            let height = (size.height * prefs.originalShare).rounded()
            let originals = paragraph(sentences, font: smallFont) { s in [(s.original, grey)] }
            drawBottom(originals, in: CGRect(x: pad, y: pad * 0.5, width: size.width - pad * 2, height: height - pad * 0.7),
                       lineHeight: smallFont.lineHeight + 2, context: context)
            context.setFillColor(UIColor(white: 0.22, alpha: 1).cgColor)
            context.fill(CGRect(x: pad, y: height, width: size.width - pad * 2, height: 1))
            mainRect = CGRect(x: pad, y: height + pad * 0.4, width: size.width - pad * 2, height: size.height - height - pad)
        }

        let captions = paragraph(sentences, font: mainFont) { s in
            if s.sameLanguage || !self.translates { return [(s.original, s.live ? grey : white)] }
            var parts: [(String, UIColor)] = [(s.translation, white), (s.draft, grey)]
            if s.translation.isEmpty && s.draft.isEmpty && s.live { parts.append(("…", grey)) }
            return parts
        }
        drawBottom(captions, in: mainRect, lineHeight: mainFont.lineHeight + 2, context: context)

        if browsing {
            let tag = offset > 0 ? "\(labels.reviewing) \(offset)" : labels.held
            let text = NSAttributedString(string: " \(tag) ", attributes: [
                .font: UIFont.systemFont(ofSize: 13, weight: .medium), .foregroundColor: UIColor.white,
                .backgroundColor: UIColor(red: 0.18, green: 0.37, blue: 0.63, alpha: 1),
            ])
            let width = text.size().width
            text.draw(at: CGPoint(x: size.width - width - 6, y: 5))
        }
    }

    // Sentences flow on; a new speaker starts a new line with "– "
    private func paragraph(_ sentences: [CaptionSentence], font: UIFont,
                           parts: (CaptionSentence) -> [(String, UIColor)]) -> NSAttributedString {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = 2
        style.lineBreakMode = .byWordWrapping
        let out = NSMutableAttributedString()
        func add(_ text: String, _ color: UIColor) {
            out.append(NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: style]))
        }
        for (i, sentence) in sentences.enumerated() {
            let pieces = parts(sentence).filter { !$0.0.isEmpty }
            guard !pieces.isEmpty else { continue }
            if sentence.newSpeaker {
                if out.length > 0 { add("\n", .white) }
                add("– ", pieces[0].1)
            } else if i > 0, out.length > 0, let last = out.string.unicodeScalars.last,
                      !CaptionModel.isCJK(last), !"。！？，、".unicodeScalars.contains(last) {
                add(" ", .white)
            }
            for (text, color) in pieces { add(text, color) }
        }
        return out
    }

    // Bottom-aligned, whole lines only: the latest text stays visible
    private func drawBottom(_ text: NSAttributedString, in rect: CGRect, lineHeight: CGFloat, context: CGContext) {
        guard text.length > 0 else { return }
        let height = ceil(text.boundingRect(with: CGSize(width: rect.width, height: .greatestFiniteMagnitude),
                                            options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil).height)
        let lines = max(1, floor(rect.height / lineHeight))
        let visible = min(height, lines * lineHeight)
        context.saveGState()
        context.clip(to: CGRect(x: rect.minX, y: rect.maxY - visible, width: rect.width, height: visible))
        text.draw(with: CGRect(x: rect.minX, y: rect.maxY - height, width: rect.width, height: height),
                  options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        context.restoreGState()
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
    // Pause holds the captions where they are; play goes back to live
    func pictureInPictureController(_ controller: AVPictureInPictureController, setPlaying playing: Bool) {
        if playing {
            heldSnapshot = nil
            offset = 0
        } else {
            heldSnapshot = snapshot
        }
        controller.invalidatePlaybackState()
        draw()
    }

    // A long finite range, so the window offers its skip buttons
    func pictureInPictureControllerTimeRangeForPlayback(_ controller: AVPictureInPictureController) -> CMTimeRange {
        CMTimeRange(start: .zero, duration: CMTime(value: 24 * 3600, timescale: 1))
    }

    func pictureInPictureControllerIsPlaybackPaused(_ controller: AVPictureInPictureController) -> Bool {
        heldSnapshot != nil
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    didTransitionToRenderSize newRenderSize: CMVideoDimensions) {}

    // ⏪ one sentence back, ⏩ one forward; forward past the latest returns to live
    func pictureInPictureController(_ controller: AVPictureInPictureController, skipByInterval skipInterval: CMTime,
                                    completion completionHandler: @escaping () -> Void) {
        let count = (heldSnapshot ?? snapshot).sentences.count
        if skipInterval.seconds < 0 {
            offset = min(offset + 1, max(0, count - 1))
        } else if offset > 0 {
            offset -= 1
        } else {
            heldSnapshot = nil
            controller.invalidatePlaybackState()
        }
        draw()
        completionHandler()
    }
}

extension CaptionPip: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        // A fresh frame every second: dimming, and never a stale or empty layer
        refresh?.invalidate()
        refresh = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.draw() }
        onActive?(true)
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        refresh?.invalidate()
        refresh = nil
        offset = 0
        heldSnapshot = nil
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
