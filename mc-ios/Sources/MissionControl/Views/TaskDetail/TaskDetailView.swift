import SwiftUI

enum TaskDetailTab: String, CaseIterable {
    case thread = "Thread"
    case plan = "Plan"
    case files = "Files"
    case activity = "Activity"
}

struct TaskDetailView: View {
    @Environment(TaskStore.self) private var taskStore
    @Environment(MessageStore.self) private var messageStore
    @Environment(StepStore.self) private var stepStore
    @Environment(ActivityStore.self) private var activityStore
    @Environment(\.dismiss) private var dismiss

    let task: MCTask
    @State private var selectedTab: TaskDetailTab = .thread

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                headerSection

                Picker("Tab", selection: $selectedTab) {
                    ForEach(TaskDetailTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

                Divider()

                tabContent
                    .animation(.spring(duration: 0.3), value: selectedTab)
            }
            .navigationTitle(task.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") { dismiss() }
                }
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    toolbarActions
                }
            }
        }
        .task {
            messageStore.setTask(task.id)
            stepStore.setTask(task.id)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(statusDisplayName(task.status))
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(statusColor(task.status))
                    .clipShape(Capsule())

                if let agent = task.assignedAgent {
                    HStack(spacing: 4) {
                        Image(systemName: "cpu")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(agent)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                if task.isFavorite == true {
                    Image(systemName: "star.fill")
                        .foregroundStyle(.yellow)
                        .font(.caption)
                }
            }

            if let description = task.description, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Tab Content

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case .thread:
            ThreadView(taskId: task.id)
        case .plan:
            ExecutionPlanView()
        case .files:
            FilesTabView(task: task)
        case .activity:
            ActivityTabView(taskId: task.id)
        }
    }

    // MARK: - Toolbar Actions

    @ViewBuilder
    private var toolbarActions: some View {
        if task.status == .review {
            Button {
                Task { await taskStore.updateStatus(taskId: task.id, status: .done) }
            } label: {
                Image(systemName: "checkmark")
                    .foregroundStyle(.green)
            }
            .accessibilityLabel("Approve task")
        }

        if task.status == .in_progress || task.status == .assigned {
            Button {
                Task { await taskStore.updateStatus(taskId: task.id, status: .review) }
            } label: {
                Image(systemName: "pause")
                    .foregroundStyle(.orange)
            }
            .accessibilityLabel("Pause task")
        }

        if task.status == .failed || task.status == .crashed {
            Button {
                Task { await taskStore.updateStatus(taskId: task.id, status: .ready) }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .foregroundStyle(.blue)
            }
            .accessibilityLabel("Retry task")
        }

        Button(role: .destructive) {
            Task {
                await taskStore.softDelete(taskId: task.id)
                dismiss()
            }
        } label: {
            Image(systemName: "trash")
                .foregroundStyle(.red)
        }
        .accessibilityLabel("Delete task")
    }

    // MARK: - Helpers

    private func statusDisplayName(_ status: TaskStatus) -> String {
        switch status {
        case .inbox: return "Inbox"
        case .assigned: return "Assigned"
        case .in_progress: return "In Progress"
        case .review: return "Review"
        case .done: return "Done"
        case .planning: return "Planning"
        case .ready: return "Ready"
        case .failed: return "Failed"
        case .retrying: return "Retrying"
        case .crashed: return "Crashed"
        case .deleted: return "Deleted"
        }
    }

    private func statusColor(_ status: TaskStatus) -> Color {
        switch status {
        case .inbox: return .purple
        case .assigned: return .cyan
        case .in_progress: return .blue
        case .review: return .orange
        case .done: return .green
        case .failed, .crashed: return .red
        case .retrying: return .yellow
        case .planning, .ready: return .gray
        case .deleted: return .gray
        }
    }
}
