import SwiftUI

struct TaskCardView: View {
    @Environment(TaskStore.self) private var taskStore
    let task: MCTask
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                // Title
                Text(task.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)

                // Assigned agent
                if let agent = task.assignedAgent {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 8, height: 8)
                        Text(agent)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                // Tag chips
                if let tags = task.tags, !tags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) {
                            ForEach(tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.caption2)
                                    .fontWeight(.medium)
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Color.accentColor.opacity(0.75))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }

                // Bottom row: file indicator + favorite star
                HStack {
                    if let files = task.files, !files.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "paperclip")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("\(files.count)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    if task.isFavorite == true {
                        Image(systemName: "star.fill")
                            .font(.caption)
                            .foregroundStyle(.yellow)
                            .symbolEffect(.bounce, value: task.isFavorite)
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .shadow(color: .black.opacity(0.06), radius: 2, x: 0, y: 1)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                Task { await taskStore.toggleFavorite(taskId: task.id) }
            } label: {
                Label(
                    task.isFavorite == true ? "Remove from Favorites" : "Add to Favorites",
                    systemImage: task.isFavorite == true ? "star.slash" : "star"
                )
            }

            Menu("Move to...") {
                ForEach(kanbanStatuses, id: \.self) { status in
                    if status != task.status {
                        Button(statusDisplayName(status)) {
                            Task { await taskStore.updateStatus(taskId: task.id, status: status) }
                        }
                    }
                }
            }

            Divider()

            Button(role: .destructive) {
                Task { await taskStore.softDelete(taskId: task.id) }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private let kanbanStatuses: [TaskStatus] = [
        .inbox, .assigned, .in_progress, .review, .done
    ]

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
}
