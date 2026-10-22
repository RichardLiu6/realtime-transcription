import Foundation

// Shared by the app (NativeSttPlugin) and the broadcast extension
// (SampleHandler), which run in separate processes: they talk through files
// in the App Group container.
//
// - config.json   app → extension: engine URL and opening message, written
//                 before the system broadcast picker is shown
// - command.json  app → extension: finish (end-of-audio) or cancel
// - state.json    extension → app: started / closed, audio samples sent
// - messages.txt  extension → app: every engine message, one JSON array
//                 ["<message>"] per line, appended; the app reads from where
//                 it left off (also after being suspended)
enum BroadcastShared {
    static let appGroup = "group.com.americanbestlife.translate"
    static let extensionBundleId = "com.americanbestlife.translate.Broadcast"

    struct Config: Codable {
        var id: String
        var url: String
        var openMessage: String
        var keepaliveMessage: String?
        var sampleRate: Double
        var frameMs: Double
        var createdAt: Date
    }

    struct Command: Codable {
        var id: String
        var cmd: String // "finish" | "cancel"
        var text: String? // end-of-audio as text (R2T2); else an empty binary frame
    }

    struct State: Codable {
        var id: String
        var status: String // "started" | "closed"
        var samples: Int
        var code: Int?
        var reason: String?
    }

    static var container: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    static func url(_ name: String) -> URL? { container?.appendingPathComponent(name) }

    static func write<T: Encodable>(_ value: T, to name: String) {
        guard let url = url(name), let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func read<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        guard let url = url(name), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    static func remove(_ name: String) {
        guard let url = url(name) else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
