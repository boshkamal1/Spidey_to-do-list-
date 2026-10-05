import SwiftUI

@main
struct SpiderTasksApp: App {
    var body: some Scene {
        WindowGroup {
            WebPlannerView()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
        }
    }
}
