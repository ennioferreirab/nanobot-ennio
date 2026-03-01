import SwiftUI

struct CompactTabView: View {
    @SceneStorage("compactTab.selectedTab") private var selectedTab: String = "tasks"

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                KanbanBoardView()
            }
            .tabItem { Label("Tasks", systemImage: "square.grid.2x2") }
            .tag("tasks")

            NavigationStack {
                AgentListView()
            }
            .tabItem { Label("Agents", systemImage: "cpu") }
            .tag("agents")

            NavigationStack {
                ChatPlaceholderView()
            }
            .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
            .tag("chat")

            NavigationStack {
                SettingsView()
            }
            .tabItem { Label("Settings", systemImage: "gear") }
            .tag("settings")
        }
    }
}

// MARK: - Placeholder Views

struct ChatPlaceholderView: View {
    var body: some View {
        ContentUnavailableView(
            "Chat",
            systemImage: "bubble.left.and.bubble.right",
            description: Text("Conversations will appear here")
        )
        .navigationTitle("Chat")
    }
}
