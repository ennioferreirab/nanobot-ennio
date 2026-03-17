# Mission Control — Apple Native App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a universal SwiftUI app (iPhone + iPad + Mac) that replaces the Next.js dashboard as the primary Mission Control interface, connecting directly to the existing Convex backend via the official Swift SDK.

**Architecture:** The iOS app is a new **client** alongside the existing web dashboard — both share the same Convex backend and Python agent orchestrator. No backend changes required. The app uses the Convex Swift SDK (v0.8.1) for real-time WebSocket subscriptions, `@Observable` classes as the data layer, and `NavigationSplitView` for adaptive layout across iPhone/iPad/Mac.

**Tech Stack:** Swift 6 / SwiftUI / Convex Swift SDK / Swift Package Manager / Xcode 16+

---

## Strategic Decision: Why Native Apple

| Factor | Web (Next.js) | Native (SwiftUI) |
|--------|--------------|-------------------|
| Performance | JS runtime overhead | Native compilation, Metal rendering |
| Real-time | Convex React hooks (good) | Convex Swift SDK + WebSocket (same) |
| Offline | Limited | SwiftData local cache possible |
| Multi-device | Responsive web | Adaptive per platform idiom |
| System integration | None | Notifications, Shortcuts, Widgets, Spotlight |
| Development cost | Exists today | New codebase, but shared backend |

**Strategy: Incremental, read-first, additive.**
- The web app continues working — iOS is a new client, not a replacement
- Build read experiences first (Kanban viewing, task detail), then write operations
- Ship each epic as a usable increment

---

## Architecture Decisions

### AD-1: Convex Connection — Swift SDK Direct

**Decision:** Use the official `convex-swift` SDK (v0.8.1, SPM) for direct WebSocket connection to Convex.

**Rationale:** The SDK wraps the Convex Rust client, providing real-time subscriptions identical to the React hooks. No proxy layer needed. The entire public Convex API surface (queries, mutations) is callable from Swift.

**Rejected:** Next.js API proxy (adds latency, loses real-time, extra infra).

### AD-2: Authentication — Token + Keychain

**Decision:** Adapt the existing `MC_ACCESS_TOKEN` auth to iOS:
1. User enters the access token in a login screen
2. Token is stored securely in iOS Keychain
3. Token is sent as a custom header or used to establish a Convex auth session
4. The existing Next.js API routes for file upload/download remain accessible via HTTP from the iOS app

**Note:** The current web auth uses SHA256(token) in a cookie. For iOS, we can either:
- (a) Call the same `/api/auth` endpoint and manage cookies in URLSession, or
- (b) Hash the token client-side and pass it as a bearer token to a thin auth validation function in Convex

Option (b) is cleaner. Add a Convex query `auth:validate(hashedToken)` that checks against a stored hash.

### AD-3: Data Layer — @Observable + Convex Subscriptions

**Decision:** One `@Observable @MainActor` class per domain, wrapping Convex subscriptions via Combine publishers.

```
ConvexClient (singleton)
  └─ TaskStore (@Observable)     ← subscribe("tasks:listByBoard")
  └─ AgentStore (@Observable)    ← subscribe("agents:list")
  └─ BoardStore (@Observable)    ← subscribe("boards:list")
  └─ MessageStore (@Observable)  ← subscribe("messages:listByTask")
  └─ StepStore (@Observable)     ← subscribe("steps:getByTask")
  └─ ActivityStore (@Observable) ← subscribe("activities:listRecent")
  └─ SettingsStore (@Observable) ← subscribe("settings:list")
```

Each store exposes typed Swift arrays/optionals. Views bind directly. Convex handles the WebSocket lifecycle.

### AD-4: Navigation — Adaptive Split

**Decision:**
- **iPhone (compact):** `TabView` with tabs: Kanban, Agents, Chat, Settings
- **iPad/Mac (regular):** `NavigationSplitView` with sidebar (boards + agents) → Kanban → Task Detail

The sidebar collapses automatically on iPhone. Task Detail opens as a sheet on iPhone, as a detail column on iPad/Mac.

### AD-5: File Handling — Hybrid

**Decision:** File upload/download continues via the existing Next.js API routes over HTTP. The iOS app calls `POST /api/tasks/{id}/files` and `GET /api/tasks/{id}/files/{subfolder}/{filename}` directly. This avoids duplicating filesystem logic.

**Future:** Migrate to Convex file storage when the file volume justifies it.

### AD-6: Terminal Sessions — Phase 2

**Decision:** Defer terminal emulation to Phase 2. It requires a custom terminal renderer (no native SwiftUI component). The web app remains the primary interface for terminal sessions initially.

---

## Epic Breakdown

### Epic 1: Project Foundation & Convex Connection
> Setup Xcode project, integrate Convex Swift SDK, establish real-time connection, build app skeleton

### Epic 2: Authentication
> Login screen, Keychain storage, session management, auth state propagation

### Epic 3: Core Data Layer
> @Observable stores for all domains, Convex subscription wrappers, Swift model types

### Epic 4: Board & Kanban View
> Board selector, Kanban columns, task cards, search/filtering, pull-to-refresh

### Epic 5: Task Detail
> Multi-tab task detail (thread, execution plan, steps, files, activity), message rendering

### Epic 6: Task Actions
> Create task, change status, approve/deny, retry, drag-drop between columns, file attachments

### Epic 7: Agent Management
> Agent list, agent detail/config, status indicators, enable/disable, agent chat

### Epic 8: Settings & Tags
> Board CRUD, tag management, model tier settings, app preferences

### Epic 9: iPad & Mac Adaptations
> NavigationSplitView polish, keyboard shortcuts, menu bar, hover effects, pointer support

### Epic 10: Push Notifications & System Integration
> Remote notifications for task status changes, Spotlight indexing, Shortcuts support

---

## Epic 1: Project Foundation & Convex Connection

### Story 1.1: Create Xcode Project with SPM Dependencies

**As a** developer,
**I want** a properly configured Xcode project with all dependencies,
**So that** I can start building the MC iOS app.

**Acceptance Criteria:**
1. Xcode project created at `mc-ios/` in the repo root
2. Deployment target: iOS 17.0, macOS 14.0
3. SPM dependencies added: `convex-swift` (https://github.com/get-convex/convex-swift)
4. App target configured for iPhone + iPad + Mac (Catalyst or native)
5. Bundle ID: `com.nanobot.mc` (or user-specified)
6. Project builds and runs on simulator showing a placeholder screen

**Tasks:**
- [ ] Create Xcode project with SwiftUI app lifecycle
- [ ] Add Convex Swift SDK via SPM
- [ ] Configure deployment targets (iOS 17, macOS 14)
- [ ] Add Mac support (Designed for iPad or Mac Catalyst)
- [ ] Verify clean build on iPhone and iPad simulators

---

### Story 1.2: Establish Convex Client Connection

**As a** developer,
**I want** a singleton ConvexClient that connects to our Convex backend,
**So that** all stores can subscribe to real-time data.

**Acceptance Criteria:**
1. `ConvexClientManager` singleton wraps `ConvexClient` from the SDK
2. Convex deployment URL loaded from environment or config
3. Connection status exposed as `@Observable` property (connected/disconnected/error)
4. Client auto-reconnects on network changes
5. Connection status visible in UI (e.g., status bar indicator)

**Tasks:**
- [ ] Create `ConvexClientManager.swift` as `@Observable @MainActor` singleton
- [ ] Configure with deployment URL from `Info.plist` or environment
- [ ] Expose connection state (`.connected`, `.disconnected`, `.connecting`, `.error`)
- [ ] Add a `ConnectionStatusView` component showing real-time connection health
- [ ] Test connection on device/simulator

---

### Story 1.3: Build App Navigation Skeleton

**As a** user,
**I want** adaptive navigation that works on iPhone, iPad, and Mac,
**So that** I can navigate the app naturally on any device.

**Acceptance Criteria:**
1. iPhone: `TabView` with 4 tabs (Tasks, Agents, Chat, Settings) using SF Symbols
2. iPad/Mac: `NavigationSplitView` with sidebar (Boards, Agents sections) + detail
3. Navigation adapts automatically based on `horizontalSizeClass`
4. All tabs/sections show placeholder views with correct titles
5. Tab selection persists across app lifecycle

**Tasks:**
- [ ] Create `AppRootView.swift` with size class detection
- [ ] Build `CompactTabView` for iPhone (4 tabs with SF Symbol icons)
- [ ] Build `SplitNavView` for iPad/Mac with sidebar sections
- [ ] Create placeholder views for each section
- [ ] Test on iPhone SE, iPhone Pro Max, iPad, and Mac

---

## Epic 2: Authentication

### Story 2.1: Login Screen & Token Validation

**As a** user,
**I want** to enter my MC access token to authenticate,
**So that** I can access my Mission Control data securely.

**Acceptance Criteria:**
1. Login screen with secure text field for access token
2. Token validated against the backend (call a Convex query or the `/api/auth` endpoint)
3. On success: token stored in iOS Keychain, navigate to main app
4. On failure: show error message, clear field
5. App checks Keychain on launch and skips login if valid token exists

**Tasks:**
- [ ] Create `LoginView.swift` with SecureField and login button
- [ ] Create `KeychainManager.swift` for secure token storage (Security framework)
- [ ] Create `AuthManager.swift` (`@Observable`) with login/logout/checkSession
- [ ] Wire auth state to `AppRootView` (show login or main app)
- [ ] Handle token expiration / invalid token gracefully

---

### Story 2.2: Logout & Session Management

**As a** user,
**I want** to log out and clear my session,
**So that** my data is secure when I'm done.

**Acceptance Criteria:**
1. Logout button in Settings
2. Logout clears Keychain token and resets app state
3. All Convex subscriptions are torn down on logout
4. App returns to login screen immediately

**Tasks:**
- [ ] Add logout action to `AuthManager`
- [ ] Tear down `ConvexClientManager` subscriptions on logout
- [ ] Reset all `@Observable` stores to empty state
- [ ] Add logout button to Settings tab with confirmation alert

---

## Epic 3: Core Data Layer

### Story 3.1: Swift Model Types

**As a** developer,
**I want** Swift types matching the Convex schema,
**So that** I can work with type-safe data throughout the app.

**Acceptance Criteria:**
1. Swift structs for: `MCTask`, `MCStep`, `MCMessage`, `MCAgent`, `MCBoard`, `MCActivity`, `MCSkill`, `MCTag`, `MCChat`, `MCSetting`, `MCTerminalSession`
2. All structs conform to `Identifiable`, `Codable`, `Hashable`
3. Enums for: `TaskStatus` (11 values), `StepStatus` (7 values), `TrustLevel`, `AgentStatus`, `MessageType`, `ActivityEventType`
4. Types decode correctly from Convex JSON responses

**Tasks:**
- [ ] Create `Models/` directory with one file per domain type
- [ ] Define all enums with raw string values matching Convex schema
- [ ] Define all structs with Codable conformance
- [ ] Write unit tests for JSON decoding from sample Convex responses

---

### Story 3.2: TaskStore — Real-Time Task Subscriptions

**As a** developer,
**I want** a reactive TaskStore that subscribes to Convex tasks,
**So that** the Kanban board updates in real-time.

**Acceptance Criteria:**
1. `TaskStore` is `@Observable @MainActor`
2. Subscribes to `tasks:listByBoard(boardId)` via Convex Swift SDK
3. Exposes `tasks: [MCTask]` that updates in real-time
4. Supports board switching (re-subscribes when board changes)
5. Exposes computed properties: `tasksByStatus: [TaskStatus: [MCTask]]` for Kanban columns
6. Mutations: `createTask()`, `toggleFavorite()`, `updateStatus()`, `softDelete()`

**Tasks:**
- [ ] Create `TaskStore.swift` with Convex subscription
- [ ] Implement board-aware subscription lifecycle
- [ ] Add computed `tasksByStatus` dictionary
- [ ] Add mutation methods calling Convex public mutations
- [ ] Test real-time updates (add task in web → appears in iOS)

---

### Story 3.3: AgentStore — Agent List & Status

**As a** developer,
**I want** a reactive AgentStore for agent data,
**So that** the agent sidebar updates in real-time.

**Acceptance Criteria:**
1. `AgentStore` is `@Observable @MainActor`
2. Subscribes to `agents:list`
3. Exposes `agents: [MCAgent]`, `systemAgents`, `registeredAgents`, `remoteAgents` (computed)
4. Mutations: `updateConfig()`, `setEnabled()`, `softDelete()`, `restore()`

**Tasks:**
- [ ] Create `AgentStore.swift` with Convex subscription
- [ ] Add computed filtered lists (system, registered, remote, deleted)
- [ ] Add mutation methods
- [ ] Test agent status changes reflect in real-time

---

### Story 3.4: BoardStore, MessageStore, StepStore, ActivityStore

**As a** developer,
**I want** reactive stores for all remaining domains,
**So that** the entire app has real-time data access.

**Acceptance Criteria:**
1. `BoardStore`: subscribes to `boards:list`, exposes boards, default board, mutations (create, update, delete, setDefault)
2. `MessageStore`: subscribes to `messages:listByTask(taskId)`, re-subscribes when task changes, mutations (sendThreadMessage, postComment)
3. `StepStore`: subscribes to `steps:getByTask(taskId)`, exposes steps sorted by order
4. `ActivityStore`: subscribes to `activities:listRecent`, exposes recent activities

**Tasks:**
- [ ] Create `BoardStore.swift`
- [ ] Create `MessageStore.swift` with task-aware subscription
- [ ] Create `StepStore.swift` with task-aware subscription
- [ ] Create `ActivityStore.swift`
- [ ] Inject all stores via `@Environment` from app root

---

## Epic 4: Board & Kanban View

### Story 4.1: Board Selector

**As a** user,
**I want** to switch between boards,
**So that** I can view different workspaces.

**Acceptance Criteria:**
1. Board selector in navigation bar / sidebar header
2. Shows all boards with display names
3. Default board selected on launch
4. Switching boards triggers TaskStore re-subscription
5. Current board persisted in UserDefaults

**Tasks:**
- [ ] Create `BoardSelectorView` (Menu or Picker depending on platform)
- [ ] Wire to `BoardStore.boards` and `TaskStore.setBoard()`
- [ ] Persist selected board ID in UserDefaults
- [ ] Restore last board on app launch

---

### Story 4.2: Kanban Board with Columns

**As a** user,
**I want** to see my tasks organized in a Kanban board,
**So that** I can quickly understand task status at a glance.

**Acceptance Criteria:**
1. Five columns: Inbox, Assigned, In Progress, Review, Done
2. Each column has a colored header matching web app (violet, cyan, blue, amber, green)
3. Columns scroll horizontally on iPhone, show side-by-side on iPad/Mac
4. Each column scrolls vertically for its tasks
5. Task count shown per column
6. Pull-to-refresh triggers re-fetch

**Tasks:**
- [ ] Create `KanbanBoardView` with horizontal ScrollView (iPhone) / HStack (iPad)
- [ ] Create `KanbanColumnView` with colored header, count badge, and vertical task list
- [ ] Wire to `TaskStore.tasksByStatus`
- [ ] Add pull-to-refresh
- [ ] Style columns with HIG-compliant colors and materials

---

### Story 4.3: Task Card

**As a** user,
**I want** to see task cards with key information,
**So that** I can identify tasks quickly.

**Acceptance Criteria:**
1. Card shows: title, assigned agent (with status dot), tags (colored chips), favorite indicator
2. File attachment indicator (paperclip + count) if files exist
3. Tapping card opens Task Detail
4. Long-press shows context menu (favorite, delete, move status)
5. Cards use system materials for depth

**Tasks:**
- [ ] Create `TaskCardView` with title, agent badge, tags, file indicator
- [ ] Add `.contextMenu` with quick actions
- [ ] Add tap gesture → open TaskDetailView
- [ ] Style with `.background(.regularMaterial)` and rounded corners
- [ ] Add favorite star with `.symbolEffect(.bounce)`

---

### Story 4.4: Task Search & Filtering

**As a** user,
**I want** to search tasks by title or tags,
**So that** I can find specific tasks quickly.

**Acceptance Criteria:**
1. Search bar at top of Kanban view (`.searchable` modifier)
2. Free-text search calls `tasks:search(query, boardId)`
3. Tag filter chips below search bar
4. Results update in real-time as user types (with debounce)
5. Clear search returns to full board view

**Tasks:**
- [ ] Add `.searchable(text:)` modifier to KanbanBoardView
- [ ] Implement debounced search calling `tasks:search`
- [ ] Create `TagFilterBar` with horizontal scroll of tag chips
- [ ] Wire search/filter state to TaskStore

---

## Epic 5: Task Detail

### Story 5.1: Task Detail Sheet with Tab Navigation

**As a** user,
**I want** to see full task details in a multi-tab view,
**So that** I can inspect threads, plans, steps, files, and activity.

**Acceptance Criteria:**
1. iPhone: presented as `.sheet` with drag-to-dismiss
2. iPad/Mac: presented in detail column of NavigationSplitView
3. Five tabs: Thread, Plan, Steps, Files, Activity (using segmented picker or TabView)
4. Task title and status badge in header
5. Quick actions in toolbar: approve, pause, retry, delete

**Tasks:**
- [ ] Create `TaskDetailView` with tab selection state
- [ ] Create header with title, status badge, assigned agent
- [ ] Add `.toolbar` with contextual action buttons
- [ ] Route tab selection to child views
- [ ] Implement sheet presentation for iPhone, column for iPad

---

### Story 5.2: Thread Tab — Messages & Chat

**As a** user,
**I want** to see the task thread with all messages,
**So that** I can follow the conversation between agents and users.

**Acceptance Criteria:**
1. Messages displayed chronologically with author avatar, name, timestamp
2. Agent messages show agent icon + role
3. Step completion messages show structured content with artifacts
4. User messages aligned differently from agent messages
5. Auto-scroll to bottom on new messages
6. Input field at bottom with send button

**Tasks:**
- [ ] Create `ThreadView` with ScrollViewReader for auto-scroll
- [ ] Create `ThreadMessageView` with author differentiation (agent vs user vs system)
- [ ] Create `ThreadInputView` with text field + send button
- [ ] Wire to `MessageStore` for real-time updates
- [ ] Handle `sendThreadMessage` mutation on send

---

### Story 5.3: Execution Plan Tab

**As a** user,
**I want** to see the execution plan as a visual step graph,
**So that** I can understand task decomposition and dependencies.

**Acceptance Criteria:**
1. Steps displayed as cards in execution order
2. Dependencies shown (step X blocked by step Y)
3. Status indicators per step (planned, running, completed, crashed)
4. Assigned agent shown per step
5. Tappable steps show detail (description, error message if crashed)

**Tasks:**
- [ ] Create `ExecutionPlanView` with vertical step list
- [ ] Create `StepCardView` with status indicator, agent badge, dependency lines
- [ ] Wire to `StepStore` for real-time step status updates
- [ ] Add detail popover/sheet on step tap

---

### Story 5.4: Files Tab & Activity Tab

**As a** user,
**I want** to view attached files and activity history,
**So that** I can access task artifacts and audit trail.

**Acceptance Criteria:**
1. Files tab: list of attachments with icon, name, size
2. Tap file → preview (Quick Look or in-app viewer for images/PDFs/text)
3. Activity tab: chronological event log with timestamp, event type, description
4. Activity events use appropriate SF Symbols per event type

**Tasks:**
- [ ] Create `FilesTabView` with file list and download via HTTP
- [ ] Integrate `QuickLookPreview` for file viewing
- [ ] Create `ActivityTabView` with event list
- [ ] Wire to `ActivityStore`

---

## Epic 6: Task Actions

### Story 6.1: Create Task

**As a** user,
**I want** to create new tasks from my iPhone/iPad/Mac,
**So that** I can add work items on the go.

**Acceptance Criteria:**
1. "+" button in toolbar opens task creation sheet
2. Fields: title (required), description (optional), board, assigned agent, trust level, tags
3. Agent picker shows available agents for selected board
4. Submit calls `tasks:create` mutation
5. New task appears in Kanban immediately (via real-time subscription)
6. Sheet dismisses on success

**Tasks:**
- [ ] Create `CreateTaskView` as a form sheet
- [ ] Add agent picker filtered by board's `enabledAgents`
- [ ] Add tag multi-selector
- [ ] Wire submit to `TaskStore.createTask()`
- [ ] Add loading state and error handling

---

### Story 6.2: Task Status Actions

**As a** user,
**I want** to approve, pause, retry, and manage task status,
**So that** I can control task execution from my device.

**Acceptance Criteria:**
1. Approve button (for tasks in review/hitl_pending)
2. Pause button (for in_progress tasks)
3. Resume button (for paused tasks)
4. Retry button (for crashed tasks)
5. Deny with feedback (text input alert)
6. All actions call appropriate Convex mutations
7. Confirmation alerts for destructive actions

**Tasks:**
- [ ] Create `TaskActionsMenu` with contextual actions based on task status
- [ ] Implement each action calling the corresponding mutation
- [ ] Add confirmation dialogs for deny/delete
- [ ] Add feedback input for deny action
- [ ] Show success/failure feedback (haptic + toast)

---

## Epic 7: Agent Management

### Story 7.1: Agent List & Detail

**As a** user,
**I want** to view and manage my agents,
**So that** I can monitor agent status and configure them.

**Acceptance Criteria:**
1. Agent list grouped by category (System, Registered, Remote)
2. Status indicator per agent (active=green, idle=gray, crashed=red)
3. Tap agent → detail view with name, role, model, skills, status
4. Enable/disable toggle per agent
5. Delete with confirmation (soft delete)

**Tasks:**
- [ ] Create `AgentListView` with grouped sections
- [ ] Create `AgentDetailView` with config display
- [ ] Add enable/disable toggle calling `agents:setEnabled`
- [ ] Add delete with swipe action calling `agents:softDeleteAgent`
- [ ] Wire to `AgentStore`

---

### Story 7.2: Agent Chat

**As a** user,
**I want** to chat directly with an agent,
**So that** I can ask questions or give instructions outside of task context.

**Acceptance Criteria:**
1. Chat view accessible from agent detail
2. Message list with user/agent differentiation
3. Input field with send button
4. Messages update in real-time via `chats:listByAgent` subscription
5. Agent responses appear as they are posted

**Tasks:**
- [ ] Create `AgentChatView` with message list + input
- [ ] Create `ChatStore` (`@Observable`) with agent-specific subscription
- [ ] Wire send to `chats:send` mutation
- [ ] Add real-time subscription for incoming agent responses

---

## Epic 8: Settings & Tags

### Story 8.1: Settings Screen

**As a** user,
**I want** to manage boards, tags, and app preferences,
**So that** I can customize my MC experience.

**Acceptance Criteria:**
1. Board management: create, edit, delete, set default
2. Tag management: create/delete tags with color picker
3. Model tier settings: view and edit model tier mappings
4. App section: logout, connection status, about
5. Grouped list with navigation links

**Tasks:**
- [ ] Create `SettingsView` with Form/List sections
- [ ] Create `BoardSettingsView` with CRUD
- [ ] Create `TagSettingsView` with color picker
- [ ] Create `ModelTierSettingsView`
- [ ] Wire all to respective stores and mutations

---

## Epic 9: iPad & Mac Adaptations

### Story 9.1: NavigationSplitView Polish

**As an** iPad/Mac user,
**I want** a proper multi-column layout,
**So that** I can see boards, tasks, and details simultaneously.

**Acceptance Criteria:**
1. Three-column layout on iPad Pro landscape: Sidebar (boards+agents) → Kanban → Task Detail
2. Two-column on iPad portrait: Sidebar → Kanban (detail as sheet)
3. Sidebar collapsible with toolbar button
4. Column widths appropriate per content
5. Smooth transitions between layouts on rotation

**Tasks:**
- [ ] Refine `NavigationSplitView` with `columnVisibility` control
- [ ] Set ideal column widths with `.navigationSplitViewColumnWidth`
- [ ] Test all iPad sizes and orientations
- [ ] Add Mac-specific toolbar style

---

### Story 9.2: Keyboard Shortcuts & Menu Bar

**As a** Mac/iPad user,
**I want** keyboard shortcuts for common actions,
**So that** I can work efficiently with a keyboard.

**Acceptance Criteria:**
1. `Cmd+N`: New task
2. `Cmd+F`: Focus search
3. `Cmd+1-4`: Switch tabs/sections
4. `Cmd+R`: Refresh
5. `Delete/Backspace`: Delete selected task (with confirmation)
6. Mac menu bar with File, Edit, View menus
7. iPad keyboard shortcut overlay (hold Cmd)

**Tasks:**
- [ ] Add `.keyboardShortcut()` modifiers to toolbar buttons
- [ ] Create `Commands` group for Mac menu bar
- [ ] Add keyboard shortcut discoverability on iPad
- [ ] Test with hardware keyboard on iPad and Mac

---

## Epic 10: Notifications & System Integration

### Story 10.1: Push Notifications

**As a** user,
**I want** push notifications when tasks change status,
**So that** I stay informed without keeping the app open.

**Acceptance Criteria:**
1. Notification permission requested on first launch
2. Notifications for: task completed, task crashed, task needs approval (HITL)
3. Tapping notification deep-links to the specific task
4. Notification categories with quick actions (Approve, View)

**Tasks:**
- [ ] Set up push notification entitlement and capability
- [ ] Create Convex action or HTTP endpoint for push notification dispatch
- [ ] Implement `UNUserNotificationCenter` delegate
- [ ] Add deep linking from notification to task detail
- [ ] Configure notification categories and actions

**Note:** This requires a server-side push notification service (APNs). Options: Convex action with APNs integration, or a separate notification worker.

---

## Implementation Priority & Dependencies

```
Epic 1 (Foundation)
  └─► Epic 2 (Auth) ──► ALL subsequent epics depend on auth
        └─► Epic 3 (Data Layer)
              ├─► Epic 4 (Kanban) ──► Epic 6 (Task Actions)
              ├─► Epic 5 (Task Detail)
              ├─► Epic 7 (Agent Mgmt)
              └─► Epic 8 (Settings)
                    └─► Epic 9 (iPad/Mac Polish)
                          └─► Epic 10 (Notifications)
```

### Recommended Sprint Breakdown

| Sprint | Epics | Deliverable |
|--------|-------|-------------|
| **Sprint 1** | Epic 1 + 2 | App connects to Convex, user can authenticate |
| **Sprint 2** | Epic 3 + 4 | Kanban board with real-time tasks, search |
| **Sprint 3** | Epic 5 + 6 | Task detail with thread, create/manage tasks |
| **Sprint 4** | Epic 7 + 8 | Agent management, settings, tags |
| **Sprint 5** | Epic 9 + 10 | iPad/Mac polish, notifications |

Each sprint delivers a shippable increment. After Sprint 2, the app is already usable for read-only task monitoring.

---

## File Structure (Target)

```
mc-ios/
├── MCApp.swift                     # App entry point
├── Info.plist
├── Assets.xcassets/
├── Package.swift                   # SPM (or .xcodeproj)
│
├── Core/
│   ├── ConvexClientManager.swift   # Convex singleton
│   ├── AuthManager.swift           # Auth + Keychain
│   ├── KeychainManager.swift       # Keychain wrapper
│   └── ConnectionStatusView.swift
│
├── Models/
│   ├── MCTask.swift
│   ├── MCStep.swift
│   ├── MCMessage.swift
│   ├── MCAgent.swift
│   ├── MCBoard.swift
│   ├── MCActivity.swift
│   ├── MCTag.swift
│   ├── MCChat.swift
│   ├── MCSetting.swift
│   └── Enums.swift                 # TaskStatus, StepStatus, etc.
│
├── Stores/
│   ├── TaskStore.swift
│   ├── AgentStore.swift
│   ├── BoardStore.swift
│   ├── MessageStore.swift
│   ├── StepStore.swift
│   ├── ActivityStore.swift
│   ├── ChatStore.swift
│   └── SettingsStore.swift
│
├── Views/
│   ├── App/
│   │   ├── AppRootView.swift       # Auth gate + navigation
│   │   ├── CompactTabView.swift    # iPhone tabs
│   │   └── SplitNavView.swift      # iPad/Mac split
│   │
│   ├── Auth/
│   │   └── LoginView.swift
│   │
│   ├── Kanban/
│   │   ├── KanbanBoardView.swift
│   │   ├── KanbanColumnView.swift
│   │   ├── TaskCardView.swift
│   │   ├── BoardSelectorView.swift
│   │   └── TagFilterBar.swift
│   │
│   ├── TaskDetail/
│   │   ├── TaskDetailView.swift
│   │   ├── ThreadView.swift
│   │   ├── ThreadMessageView.swift
│   │   ├── ThreadInputView.swift
│   │   ├── ExecutionPlanView.swift
│   │   ├── StepCardView.swift
│   │   ├── FilesTabView.swift
│   │   └── ActivityTabView.swift
│   │
│   ├── Tasks/
│   │   ├── CreateTaskView.swift
│   │   └── TaskActionsMenu.swift
│   │
│   ├── Agents/
│   │   ├── AgentListView.swift
│   │   ├── AgentDetailView.swift
│   │   └── AgentChatView.swift
│   │
│   └── Settings/
│       ├── SettingsView.swift
│       ├── BoardSettingsView.swift
│       ├── TagSettingsView.swift
│       └── ModelTierSettingsView.swift
│
└── Tests/
    ├── ModelDecodingTests.swift
    ├── TaskStoreTests.swift
    └── AuthManagerTests.swift
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Convex Swift SDK limitations | High | SDK is v0.8.1, actively maintained. Test subscription edge cases early (Sprint 1) |
| Auth token flow complexity | Medium | Start with simplest approach (token in Keychain), iterate if needed |
| File upload/download from iOS | Medium | Reuse existing Next.js API routes via HTTP — proven path |
| Terminal session support | Low | Deferred to Phase 2. Web app covers this use case |
| Convex subscription memory leaks | Medium | Follow SDK patterns exactly, test with Instruments in Sprint 2 |
| Real-time sync conflicts | Low | Convex handles this server-side — same as web app |

---

## Testing Strategy

- **Unit Tests:** Model decoding, store logic, auth flow
- **UI Tests:** Navigation flows, task creation, status changes
- **Integration Tests:** Convex connection, subscription lifecycle, mutation round-trips
- **Manual Testing:** Real-time sync (change on web → verify on iOS), all device sizes, dark mode, Dynamic Type
- **Instruments:** Memory leaks, CPU usage during sustained subscriptions, network profiling
