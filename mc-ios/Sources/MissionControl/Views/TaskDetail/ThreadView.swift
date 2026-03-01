import SwiftUI

struct ThreadView: View {
    @Environment(MessageStore.self) private var messageStore
    let taskId: String

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 4) {
                        if messageStore.messages.isEmpty {
                            emptyState
                        } else {
                            ForEach(messageStore.messages) { message in
                                ThreadMessageView(message: message)
                                    .id(message.id)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .onChange(of: messageStore.messages.count) { _, _ in
                    if let lastId = messageStore.messages.last?.id {
                        withAnimation(.spring(duration: 0.3)) {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()
            ThreadInputView(taskId: taskId)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.largeTitle)
                .foregroundStyle(.tertiary)
            Text("No messages yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Messages between agents will appear here")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }
}
