import Foundation

/// Handles deep linking from notification taps, exposing a pendingTaskId
/// that navigation views can observe to navigate to the correct task.
@Observable
@MainActor
final class DeepLinkHandler {

    /// Set when a notification is tapped. Navigation views should observe this
    /// and navigate to the task, then clear it by setting it to nil.
    var pendingTaskId: String?

    /// Set to the action identifier (e.g. "APPROVE", "RETRY", "VIEW") when a
    /// notification action button is tapped. Clear after handling.
    var pendingAction: String?

    /// Clear pending state after navigation and action handling are complete.
    func clearPendingTaskId() {
        pendingTaskId = nil
        pendingAction = nil
    }
}
