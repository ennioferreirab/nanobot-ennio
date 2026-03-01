import Foundation
import UserNotifications

// MARK: - DeepLinkHandler

/// Handles deep linking from notification taps, exposing a pendingTaskId
/// that navigation views can observe to navigate to the correct task.
@Observable
@MainActor
final class DeepLinkHandler {

    // MARK: - Observable State

    /// Set when a notification is tapped. Navigation views should observe this
    /// and navigate to the task, then clear it by setting it to nil.
    var pendingTaskId: String?

    /// Set to the action identifier (e.g. "APPROVE", "RETRY", "VIEW") when a
    /// notification action button is tapped. Clear after handling.
    var pendingAction: String?

    // MARK: - Notification Response Handling

    /// Extracts the taskId from a notification response's userInfo and
    /// stores it so the UI can navigate to the appropriate task.
    func handleNotificationResponse(_ response: UNNotificationResponse) {
        let userInfo = response.notification.request.content.userInfo
        if let taskId = userInfo["taskId"] as? String {
            pendingTaskId = taskId
        }
    }

    /// Clear pending state after navigation and action handling are complete.
    func clearPendingTaskId() {
        pendingTaskId = nil
        pendingAction = nil
    }
}
