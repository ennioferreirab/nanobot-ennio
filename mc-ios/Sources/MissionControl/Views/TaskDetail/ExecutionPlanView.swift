import SwiftUI

struct ExecutionPlanView: View {
    @Environment(StepStore.self) private var stepStore

    var body: some View {
        Group {
            if stepStore.sortedSteps.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(stepStore.sortedSteps) { step in
                            StepCardView(step: step)
                        }
                    }
                    .padding(16)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "list.bullet.clipboard")
                .font(.largeTitle)
                .foregroundStyle(.tertiary)
            Text("No execution plan")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Steps will appear when an agent begins work")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.vertical, 60)
    }
}
