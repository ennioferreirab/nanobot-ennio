import Foundation
import SwiftUI
import UserNotifications

// MARK: - Notification Category Identifiers

private enum NotificationCategory {
    static let taskNeedsApproval = "TASK_NEEDS_APPROVAL"
    static let taskCompleted = "TASK_COMPLETED"
    static let taskCrashed = "TASK_CRASHED"
}

// MARK: - Notification Action Identifiers

private enum NotificationAction {
    static let approve = "APPROVE"
    static let view = "VIEW"
    static let retry = "RETRY"
}

// MARK: - NotificationManager

@Observable
@MainActor
final class NotificationManager: NSObject {

    // MARK: - Observable State

    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined

    // MARK: - Deep Link Handler

    /// Wired by MCApp so that notification taps can drive navigation.
    var deepLinkHandler: DeepLinkHandler?

    // MARK: - Private State (tracking previous task statuses for transition detection)

    private var previousStatuses: [String: TaskStatus] = [:]

    // MARK: - Init

    override init() {
        super.init()
        registerCategories()
        UNUserNotificationCenter.current().delegate = self
        Task { await refreshAuthorizationStatus() }
    }

    // MARK: - Permission

    var hasPermission: Bool {
        authorizationStatus == .authorized || authorizationStatus == .provisional
    }

    func refreshAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }

    @discardableResult
    func requestPermission() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .sound, .badge]
            )
            await refreshAuthorizationStatus()
            return granted
        } catch {
            return false
        }
    }

    // MARK: - Category Registration

    private func registerCategories() {
        let approveAction = UNNotificationAction(
            identifier: NotificationAction.approve,
            title: "Approve",
            options: [.foreground]
        )
        let viewAction = UNNotificationAction(
            identifier: NotificationAction.view,
            title: "View",
            options: [.foreground]
        )
        let retryAction = UNNotificationAction(
            identifier: NotificationAction.retry,
            title: "Retry",
            options: [.foreground]
        )

        let needsApprovalCategory = UNNotificationCategory(
            identifier: NotificationCategory.taskNeedsApproval,
            actions: [approveAction, viewAction],
            intentIdentifiers: [],
            options: []
        )
        let completedCategory = UNNotificationCategory(
            identifier: NotificationCategory.taskCompleted,
            actions: [viewAction],
            intentIdentifiers: [],
            options: []
        )
        let crashedCategory = UNNotificationCategory(
            identifier: NotificationCategory.taskCrashed,
            actions: [retryAction, viewAction],
            intentIdentifiers: [],
            options: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            needsApprovalCategory,
            completedCategory,
            crashedCategory
        ])
    }

    // MARK: - Schedule Local Notification

    func scheduleLocalNotification(
        title: String,
        body: String,
        taskId: String,
        category: String
    ) {
        guard hasPermission else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.categoryIdentifier = category
        content.userInfo = ["taskId": taskId]
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "\(category)-\(taskId)-\(UUID().uuidString)",
            content: content,
            trigger: nil // deliver immediately
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Status Change Monitoring

    /// Call this whenever the task list updates to fire notifications for status transitions.
    /// Only fires when the app is in the background.
    func checkForStatusChanges(tasks: [MCTask], scenePhase: ScenePhase) {
        // Only notify when app is backgrounded
        guard scenePhase == .background else {
            // Update previousStatuses silently so we track the current state
            // even when in foreground (avoids spurious notifications on resume)
            for task in tasks {
                previousStatuses[task.id] = task.status
            }
            return
        }

        for task in tasks {
            let current = task.status
            let previous = previousStatuses[task.id]

            // Only fire for genuine transitions (skip initial load)
            if let previous, previous != current {
                switch current {
                case .review:
                    scheduleLocalNotification(
                        title: "Task Needs Approval",
                        body: "\"\(task.title)\" is waiting for your approval.",
                        taskId: task.id,
                        category: NotificationCategory.taskNeedsApproval
                    )
                case .done:
                    scheduleLocalNotification(
                        title: "Task Completed",
                        body: "\"\(task.title)\" has been completed.",
                        taskId: task.id,
                        category: NotificationCategory.taskCompleted
                    )
                case .crashed, .failed:
                    scheduleLocalNotification(
                        title: "Task Crashed",
                        body: "\"\(task.title)\" has crashed or failed.",
                        taskId: task.id,
                        category: NotificationCategory.taskCrashed
                    )
                default:
                    break
                }
            }

            previousStatuses[task.id] = current
        }

        // Prune entries for tasks no longer in the list to prevent unbounded growth
        let currentIds = Set(tasks.map(\.id))
        previousStatuses = previousStatuses.filter { currentIds.contains($0.key) }
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show banner + sound even when app is in foreground
        completionHandler([.banner, .sound])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        // Extract Sendable values before hopping to MainActor to avoid data races.
        let taskId = response.notification.request.content.userInfo["taskId"] as? String
        let actionIdentifier = response.actionIdentifier
        let pendingAction: String? = actionIdentifier == UNNotificationDefaultActionIdentifier
            ? nil
            : actionIdentifier
        Task { @MainActor [weak self] in
            guard let self, let taskId else { return }
            self.deepLinkHandler?.pendingTaskId = taskId
            self.deepLinkHandler?.pendingAction = pendingAction
        }
        completionHandler()
    }
}
