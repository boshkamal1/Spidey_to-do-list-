import AppIntents
import Foundation
import SwiftUI
import WidgetKit

private let firebaseProjectId = "spidy-list"
private let firebaseApiKey = "AIzaSyDhzN0itylZZfDDYzk7NFqs578GegBQw94"

struct SelectWidgetFeedIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Connect Spider Tasks"
    static var description = IntentDescription("Paste the private widget code to show and check off today's missions.")

    @Parameter(title: "Secret widget code", default: "")
    var feedCode: String
}

struct SetMissionCompletionIntent: AppIntent {
    static var title: LocalizedStringResource = "Update Spider Tasks mission"
    static var openAppWhenRun = false

    @Parameter(title: "Secret widget code", default: "")
    var feedCode: String
    @Parameter(title: "Mission ID", default: "")
    var taskId: String
    @Parameter(title: "Completed", default: false)
    var completed: Bool

    init() {
        feedCode = ""
        taskId = ""
        completed = false
    }

    init(feedCode: String, taskId: String, completed: Bool) {
        self.feedCode = feedCode
        self.taskId = taskId
        self.completed = completed
    }

    func perform() async throws -> some IntentResult {
        guard feedCode.range(of: "^[a-fA-F0-9-]{24,40}$", options: .regularExpression) != nil,
              taskId.range(of: "^[a-zA-Z0-9_-]{1,80}$", options: .regularExpression) != nil else {
            throw MissionWriteError.invalidRequest
        }

        var components = URLComponents()
        components.scheme = "https"
        components.host = "firestore.googleapis.com"
        components.path = "/v1/projects/\(firebaseProjectId)/databases/(default)/documents/widgetFeeds/\(feedCode)/completions/\(taskId)"
        components.queryItems = [
            URLQueryItem(name: "key", value: firebaseApiKey),
            URLQueryItem(name: "updateMask.fieldPaths", value: "done")
        ]
        guard let url = components.url else { throw MissionWriteError.invalidRequest }

        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "fields": ["done": ["booleanValue": completed]]
        ])
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw MissionWriteError.updateFailed
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

private enum MissionWriteError: LocalizedError {
    case invalidRequest
    case updateFailed

    var errorDescription: String? {
        switch self {
        case .invalidRequest: return "This widget code or mission ID is invalid."
        case .updateFailed: return "Could not update the mission. Open Spider Tasks and try again."
        }
    }
}

private struct Mission: Identifiable {
    let id: String
    let title: String
    let done: Bool
    let start: String
}

private struct MissionEntry: TimelineEntry {
    let date: Date
    let feedCode: String
    let dayKey: String
    let missions: [Mission]
    let message: String?

    var openCount: Int { missions.filter { !$0.done }.count }
}

private struct MissionProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> MissionEntry {
        MissionEntry(date: .now, feedCode: "", dayKey: localDayKey(), missions: [], message: "Today's missions")
    }

    func snapshot(for configuration: SelectWidgetFeedIntent, in context: Context) async -> MissionEntry {
        await load(code: configuration.feedCode)
    }

    func timeline(for configuration: SelectWidgetFeedIntent, in context: Context) async -> Timeline<MissionEntry> {
        let entry = await load(code: configuration.feedCode)
        return Timeline(entries: [entry], policy: .after(Date.now.addingTimeInterval(20 * 60)))
    }

    private func load(code rawCode: String) async -> MissionEntry {
        let code = rawCode.trimmingCharacters(in: .whitespacesAndNewlines)
        let today = localDayKey()
        guard code.range(of: "^[a-fA-F0-9-]{24,40}$", options: .regularExpression) != nil else {
            return MissionEntry(date: .now, feedCode: code, dayKey: today, missions: [], message: "Add your code in widget settings")
        }

        var components = URLComponents()
        components.scheme = "https"
        components.host = "firestore.googleapis.com"
        components.path = "/v1/projects/\(firebaseProjectId)/databases/(default)/documents/widgetFeeds/\(code)"
        components.queryItems = [URLQueryItem(name: "key", value: firebaseApiKey)]
        guard let url = components.url else {
            return MissionEntry(date: .now, feedCode: code, dayKey: today, missions: [], message: "Could not build the feed address")
        }

        do {
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return MissionEntry(date: .now, feedCode: code, dayKey: today, missions: [], message: "Open Spider Tasks and sign in to refresh")
            }
            guard
                let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                let fields = root["fields"] as? [String: Any]
            else {
                return MissionEntry(date: .now, feedCode: code, dayKey: today, missions: [], message: "No widget data yet. Open Spider Tasks")
            }

            let feedDay = (fields["day"] as? [String: Any])?["stringValue"] as? String ?? ""
            guard feedDay == today else {
                return MissionEntry(date: .now, feedCode: code, dayKey: today, missions: [], message: "Open Spider Tasks to refresh today's missions")
            }

            let values = ((fields["tasks"] as? [String: Any])?["arrayValue"] as? [String: Any])?["values"] as? [[String: Any]] ?? []
            let missions = values.compactMap { value -> Mission? in
                guard
                    let map = value["mapValue"] as? [String: Any],
                    let taskFields = map["fields"] as? [String: Any],
                    let id = (taskFields["id"] as? [String: Any])?["stringValue"] as? String,
                    let title = (taskFields["title"] as? [String: Any])?["stringValue"] as? String
                else { return nil }
                let done = (taskFields["done"] as? [String: Any])?["booleanValue"] as? Bool ?? false
                let start = (taskFields["start"] as? [String: Any])?["stringValue"] as? String ?? ""
                return Mission(id: id, title: title, done: done, start: start)
            }
            let overrides = await withTaskGroup(of: (String, Bool?).self, returning: [String: Bool].self) { group in
                for mission in missions {
                    group.addTask {
                        (mission.id, await fetchMissionCompletion(feedCode: code, taskId: mission.id))
                    }
                }
                var result: [String: Bool] = [:]
                for await (id, done) in group {
                    if let done { result[id] = done }
                }
                return result
            }
            let currentMissions = missions.map { mission in
                Mission(id: mission.id, title: mission.title, done: overrides[mission.id] ?? mission.done, start: mission.start)
            }
            return MissionEntry(date: .now, feedCode: code, dayKey: today, missions: currentMissions, message: nil)
        } catch {
            return MissionEntry(date: .now, feedCode: code, dayKey: today, missions: [], message: "Connect to the internet to refresh")
        }
    }
}

private struct MissionWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MissionEntry

    private var nextMission: Mission? { entry.missions.first(where: { !$0.done }) }

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                if let task = nextMission {
                    Button(intent: completionIntent(for: task)) {
                        Label("\(entry.openCount) missions today", systemImage: "bolt.fill")
                    }
                } else {
                    Label("\(entry.openCount) missions today", systemImage: "bolt.fill")
                }
            case .accessoryCircular:
                if let task = nextMission {
                    Button(intent: completionIntent(for: task)) {
                        VStack(spacing: 0) {
                            Image(systemName: "bolt.fill").font(.system(size: 11, weight: .bold))
                            Text("\(entry.openCount)").font(.system(size: 20, weight: .black, design: .rounded))
                        }
                    }
                    .buttonStyle(.plain)
                    .widgetLabel("Mark next mission done")
                } else {
                    ZStack {
                        AccessoryWidgetBackground()
                        VStack(spacing: 0) {
                            Image(systemName: "bolt.fill").font(.system(size: 11, weight: .bold))
                            Text("\(entry.openCount)").font(.system(size: 20, weight: .black, design: .rounded))
                        }
                    }
                    .widgetLabel("Missions")
                }
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 3) {
                    Text("MILES · TODAY").font(.system(size: 11, weight: .heavy, design: .rounded))
                    if let message = entry.message {
                        Text(message).font(.caption2).lineLimit(2)
                    } else if let task = nextMission {
                        Button(intent: completionIntent(for: task)) {
                            VStack(alignment: .leading, spacing: 2) {
                                Label(task.title, systemImage: "circle").font(.caption).lineLimit(1)
                                Text("\(entry.openCount) left").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text(entry.missions.isEmpty ? "No missions today" : "All missions clear")
                            .font(.caption).lineLimit(1)
                    }
                }
            default:
                mainWidget
            }
        }
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(red: 0.08, green: 0.07, blue: 0.12), Color(red: 0.24, green: 0.03, blue: 0.09)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        .foregroundStyle(.white)
    }

    @ViewBuilder
    private var mainWidget: some View {
        if family == .systemSmall {
            VStack(alignment: .leading, spacing: 5) {
                header
                Spacer(minLength: 0)
                Text("\(entry.openCount)")
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .foregroundStyle(Color(red: 1, green: 0.23, blue: 0.31))
                if let task = nextMission, entry.message == nil {
                    Button(intent: completionIntent(for: task)) {
                        Label(task.title, systemImage: "circle")
                            .font(.caption.weight(.semibold))
                            .lineLimit(2)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text(entry.message ?? (entry.missions.isEmpty ? "No missions today" : "All missions clear"))
                        .font(.caption.weight(.semibold))
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
        } else {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    header
                    Spacer(minLength: 0)
                    Text("\(entry.openCount)")
                        .font(.system(size: 38, weight: .black, design: .rounded))
                        .foregroundStyle(Color(red: 1, green: 0.23, blue: 0.31))
                    Text(entry.message ?? (entry.openCount == 1 ? "mission left" : "missions left"))
                        .font(.caption.weight(.semibold))
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(entry.missions.prefix(4)) { mission in
                        Button(intent: completionIntent(for: mission)) {
                            HStack(alignment: .firstTextBaseline, spacing: 5) {
                                Image(systemName: mission.done ? "checkmark.circle.fill" : "circle")
                                    .font(.caption2)
                                    .foregroundStyle(mission.done ? Color.cyan : Color.white.opacity(0.7))
                                Text(mission.title)
                                    .font(.caption.weight(.medium))
                                    .lineLimit(1)
                                    .strikethrough(mission.done)
                                Spacer(minLength: 0)
                                if !mission.start.isEmpty {
                                    Text(mission.start).font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.white.opacity(0.7))
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    if entry.missions.isEmpty, entry.message == nil {
                        Text("No missions planned today").font(.caption).foregroundStyle(.white.opacity(0.75))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(15)
        }
    }

    private var header: some View {
        HStack(spacing: 5) {
            Image(systemName: "bolt.fill").foregroundStyle(Color(red: 1, green: 0.23, blue: 0.31))
            Text("TODAY").font(.system(size: 11, weight: .black, design: .rounded)).tracking(1)
        }
    }

    private func completionIntent(for mission: Mission) -> SetMissionCompletionIntent {
        SetMissionCompletionIntent(feedCode: entry.feedCode, taskId: mission.id, completed: !mission.done)
    }
}

@main
struct SpiderTasksWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "SpiderTasksTodayWidget",
            intent: SelectWidgetFeedIntent.self,
            provider: MissionProvider()
        ) { entry in
            MissionWidgetView(entry: entry)
        }
        .configurationDisplayName("Spider Tasks Today")
        .description("See today's missions on your Home Screen or Lock Screen.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

private func localDayKey() -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: .now)
}

private func fetchMissionCompletion(feedCode: String, taskId: String) async -> Bool? {
    var components = URLComponents()
    components.scheme = "https"
    components.host = "firestore.googleapis.com"
    components.path = "/v1/projects/\(firebaseProjectId)/databases/(default)/documents/widgetFeeds/\(feedCode)/completions/\(taskId)"
    components.queryItems = [URLQueryItem(name: "key", value: firebaseApiKey)]
    guard let url = components.url else { return nil }
    do {
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let document = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let fields = document["fields"] as? [String: Any] else { return nil }
        return (fields["done"] as? [String: Any])?["booleanValue"] as? Bool
    } catch {
        return nil
    }
}
