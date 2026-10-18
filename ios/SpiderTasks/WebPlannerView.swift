import SwiftUI
import UIKit
import WebKit
import UserNotifications
import WidgetKit

struct WebPlannerView: UIViewRepresentable {
    private let siteURL = URL(string: "https://spidy-list.web.app")!

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "spiderPlannerState")
        controller.add(context.coordinator, name: "spiderNotificationPermission")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 10.0 / 255.0, green: 7.0 / 255.0, blue: 16.0 / 255.0, alpha: 1)
        context.coordinator.webView = webView
        webView.load(URLRequest(url: siteURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        private var lastPlannerSignature = ""
        private var lastPlannerPayload: [String: Any]?
        private var widgetReloadWorkItem: DispatchWorkItem?
        private let center = UNUserNotificationCenter.current()

        override init() {
            super.init()
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(appWillEnterForeground),
                name: UIApplication.willEnterForegroundNotification,
                object: nil
            )
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case "spiderPlannerState":
                guard let payload = message.body as? [String: Any] else { return }
                scheduleNotifications(from: payload)
                queueWidgetReload()
            case "spiderNotificationPermission":
                requestNotificationPermission()
            default:
                break
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            refreshNotificationAuthorization()
        }

        @objc private func appWillEnterForeground() {
            refreshNotificationAuthorization()
        }

        private func refreshNotificationAuthorization(permissionEvent: String? = nil) {
            center.getNotificationSettings { [weak self] settings in
                guard let self else { return }
                let granted = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
                self.dispatchPermissionEvent("spiderNativeNotificationStatus", granted: granted)
                if let permissionEvent {
                    self.dispatchPermissionEvent(permissionEvent, granted: granted)
                }
                if granted, let payload = self.lastPlannerPayload {
                    self.lastPlannerSignature = ""
                    self.scheduleNotifications(from: payload)
                }
            }
        }

        private func requestNotificationPermission() {
            center.requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] _, _ in
                self?.refreshNotificationAuthorization(permissionEvent: "spiderNativeNotificationPermission")
            }
        }

        private func queueWidgetReload() {
            widgetReloadWorkItem?.cancel()
            let workItem = DispatchWorkItem {
                WidgetCenter.shared.reloadTimelines(ofKind: "SpiderTasksTodayWidget")
            }
            widgetReloadWorkItem = workItem
            DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: workItem)
        }

        private func dispatchPermissionEvent(_ name: String, granted: Bool) {
            DispatchQueue.main.async { [weak self] in
                self?.webView?.evaluateJavaScript(
                    "window.dispatchEvent(new CustomEvent('\(name)', { detail: { granted: \(granted ? "true" : "false") } }));",
                    completionHandler: nil
                )
            }
        }

        private func scheduleNotifications(from payload: [String: Any]) {
            lastPlannerPayload = payload
            guard let preferences = payload["notifications"] as? [String: Any] else { return }
            let enabled = preferences["enabled"] as? Bool ?? false
            guard enabled else {
                lastPlannerSignature = "disabled"
                center.removeAllPendingNotificationRequests()
                return
            }
            guard let weeks = payload["weeks"] as? [String: Any] else { return }
            guard let signatureData = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) else { return }
            let signature = signatureData.base64EncodedString()
            guard signature != lastPlannerSignature else { return }
            lastPlannerSignature = signature

            center.getNotificationSettings { [weak self] settings in
                guard let self else { return }
                let authorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
                guard authorized else {
                    self.center.removeAllPendingNotificationRequests()
                    self.dispatchPermissionEvent("spiderNativeNotificationStatus", granted: false)
                    return
                }

                let lead = preferences["lead"] as? Int ?? 10
                let message = preferences["message"] as? String ?? "suitup"
                let custom = preferences["custom"] as? String ?? ""
                let title = self.notificationTitle(style: message, custom: custom)
                let now = Date()
                var calendar = Calendar(identifier: .gregorian)
                calendar.timeZone = .current
                let startOfToday = calendar.startOfDay(for: now)
                var requests: [(Date, UNNotificationRequest)] = []

                for (weekKey, weekValue) in weeks {
                    guard let weekStart = self.date(forDayKey: weekKey),
                          let week = weekValue as? [String: Any],
                          let days = week["days"] as? [[Any]] else { continue }

                    for (index, tasks) in days.prefix(7).enumerated() {
                        guard let taskDay = calendar.date(byAdding: .day, value: index, to: weekStart),
                              taskDay >= startOfToday,
                              taskDay <= (calendar.date(byAdding: .day, value: 7, to: startOfToday) ?? startOfToday) else { continue }

                        for value in tasks {
                            guard let task = value as? [String: Any],
                                  !(task["d"] as? Bool ?? false),
                                  let id = task["id"] as? String,
                                  let taskTitle = task["t"] as? String,
                                  let time = task["at"] as? String,
                                  let startDate = self.date(for: time, on: taskDay) else { continue }

                            let alertDate = startDate.addingTimeInterval(TimeInterval(-lead * 60))
                            guard alertDate > now else { continue }
                            var components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: alertDate)
                            components.timeZone = .current

                            let content = UNMutableNotificationContent()
                            content.title = title
                            content.body = lead == 0 ? "\(taskTitle) starts now." : "\(taskTitle) starts at \(time) — in \(lead) minutes."
                            content.sound = .default
                            let requestId = "spider-\(weekKey)-\(index)-\(id)"
                            let request = UNNotificationRequest(
                                identifier: requestId,
                                content: content,
                                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
                            )
                            requests.append((alertDate, request))
                        }
                    }
                }

                let sortedRequests = requests.sorted { $0.0 < $1.0 }.prefix(64).map(\.1)
                self.center.removeAllPendingNotificationRequests()
                for request in sortedRequests {
                    self.center.add(request, withCompletionHandler: nil)
                }
            }
        }

        private func notificationTitle(style: String, custom: String) -> String {
            switch style {
            case "friendly": return "Your friendly neighborhood reminder."
            case "leap": return "Leap into action."
            case "custom": return custom.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Spider-sense is tingling." : custom
            default: return "Suit up, Miles — mission time."
            }
        }

        private func date(forDayKey key: String) -> Date? {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = .current
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.date(from: key)
        }

        private func date(for time: String, on day: Date) -> Date? {
            let parts = time.split(separator: ":").compactMap { Int($0) }
            guard parts.count == 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { return nil }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = .current
            var components = calendar.dateComponents([.year, .month, .day], from: day)
            components.hour = parts[0]
            components.minute = parts[1]
            return calendar.date(from: components)
        }
    }
}
