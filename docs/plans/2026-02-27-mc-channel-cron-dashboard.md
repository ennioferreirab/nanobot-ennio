# MC Channel + Cron Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a MissionControlChannel so `channel: "mc"` works, integrate ChannelManager into MC gateway for outbound cron delivery, and add channel indicators + editable delivery to the CronJobsModal dashboard UI.

**Architecture:** MissionControlChannel wraps ConvexBridge behind the BaseChannel interface. MC gateway gains a MessageBus + ChannelManager so cron jobs with `deliver: true` can route outbound messages to any configured channel (telegram, mc, etc.). Dashboard gets a `/api/channels` endpoint and editable delivery column.

**Tech Stack:** Python (pydantic, asyncio, loguru), TypeScript/Next.js (React, shadcn/ui), Convex

---

### Task 1: MissionControlConfig in schema.py

**Files:**
- Modify: `nanobot/config/schema.py:168-179`

**Step 1: Add MissionControlConfig class before ChannelsConfig**

Insert before line 168 (`class ChannelsConfig`):

```python
class MissionControlConfig(Base):
    """Mission Control channel configuration."""

    enabled: bool = False
```

**Step 2: Add mc field to ChannelsConfig**

Add after the `qq` field (line 179):

```python
    mc: MissionControlConfig = Field(default_factory=MissionControlConfig)
```

**Step 3: Verify import works**

Run: `uv run python -c "from nanobot.config.schema import ChannelsConfig; c = ChannelsConfig(); print(c.mc.enabled)"`
Expected: `False`

**Step 4: Commit**

```bash
git add nanobot/config/schema.py
git commit -m "feat(config): add MissionControlConfig to ChannelsConfig"
```

---

### Task 2: MissionControlChannel implementation

**Files:**
- Create: `nanobot/channels/mission_control.py`
- Create: `tests/test_mc_channel.py`

**Step 1: Write the failing tests**

Create `tests/test_mc_channel.py`:

```python
"""Tests for MissionControlChannel."""

import asyncio
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

from nanobot.bus.events import OutboundMessage
from nanobot.bus.queue import MessageBus
from nanobot.channels.mission_control import MissionControlChannel


class TestMissionControlChannel:
    """MissionControlChannel unit tests."""

    def test_channel_name_is_mc(self) -> None:
        bus = MessageBus()
        ch = MissionControlChannel(config=MagicMock(), bus=bus)
        assert ch.name == "mc"

    def test_init_without_bridge(self) -> None:
        bus = MessageBus()
        ch = MissionControlChannel(config=MagicMock(), bus=bus)
        assert ch._bridge is None

    def test_init_with_bridge(self) -> None:
        bus = MessageBus()
        bridge = MagicMock()
        ch = MissionControlChannel(config=MagicMock(), bus=bus, bridge=bridge)
        assert ch._bridge is bridge

    @pytest.mark.asyncio
    async def test_send_without_bridge_logs_warning(self) -> None:
        bus = MessageBus()
        ch = MissionControlChannel(config=MagicMock(), bus=bus)
        msg = OutboundMessage(channel="mc", chat_id="task123", content="hello")
        # Should not raise, just log warning
        await ch.send(msg)

    @pytest.mark.asyncio
    async def test_send_with_task_id_posts_to_thread(self) -> None:
        bus = MessageBus()
        bridge = MagicMock()
        bridge.query = MagicMock(return_value={"_id": "task123", "status": "done"})
        bridge.send_message = MagicMock()
        ch = MissionControlChannel(config=MagicMock(), bus=bus, bridge=bridge)

        msg = OutboundMessage(channel="mc", chat_id="task123", content="cron result")
        await ch.send(msg)

        bridge.send_message.assert_called_once()
        call_args = bridge.send_message.call_args
        assert call_args[0][0] == "task123"  # task_id
        assert "cron result" in call_args[0][3]  # content

    @pytest.mark.asyncio
    async def test_send_creates_task_when_no_existing_task(self) -> None:
        bus = MessageBus()
        bridge = MagicMock()
        bridge.query = MagicMock(return_value=None)
        bridge.mutation = MagicMock()
        ch = MissionControlChannel(config=MagicMock(), bus=bus, bridge=bridge)

        msg = OutboundMessage(channel="mc", chat_id="nonexistent", content="hello")
        await ch.send(msg)

        bridge.mutation.assert_called_once()
        call_args = bridge.mutation.call_args
        assert call_args[0][0] == "tasks:create"

    @pytest.mark.asyncio
    async def test_stop_sets_running_false(self) -> None:
        bus = MessageBus()
        ch = MissionControlChannel(config=MagicMock(), bus=bus)
        ch._running = True
        await ch.stop()
        assert ch._running is False
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_mc_channel.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nanobot.channels.mission_control'`

**Step 3: Write the implementation**

Create `nanobot/channels/mission_control.py`:

```python
"""Mission Control channel — bridges outbound messages to Convex task threads."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from loguru import logger

from nanobot.channels.base import BaseChannel
from nanobot.bus.events import OutboundMessage

if TYPE_CHECKING:
    from nanobot.bus.queue import MessageBus


class MissionControlChannel(BaseChannel):
    """Channel that delivers messages to Convex via the ConvexBridge.

    When ``send()`` is called:
    - If ``msg.chat_id`` resolves to an existing task, post to its thread.
    - Otherwise, create a new task with the message content as title.
    """

    name: str = "mc"

    def __init__(self, config: Any, bus: "MessageBus", bridge: Any | None = None):
        super().__init__(config, bus)
        self._bridge = bridge

    async def start(self) -> None:
        """MC channel has no inbound listener — keep alive until stopped."""
        self._running = True
        while self._running:
            await asyncio.sleep(1)

    async def stop(self) -> None:
        self._running = False

    async def send(self, msg: OutboundMessage) -> None:
        """Send an outbound message to Convex."""
        if not self._bridge:
            logger.warning("[mc-channel] No bridge configured — message dropped")
            return

        task_id = msg.chat_id
        try:
            task = await asyncio.to_thread(
                self._bridge.query, "tasks:getById", {"task_id": task_id}
            )
        except Exception:
            logger.warning("[mc-channel] Failed to query task %s", task_id)
            task = None

        if task:
            try:
                await asyncio.to_thread(
                    self._bridge.send_message,
                    task_id,
                    "Cron",
                    "system",
                    msg.content,
                    "system",
                )
                logger.info("[mc-channel] Posted to task thread %s", task_id)
            except Exception:
                logger.exception("[mc-channel] Failed to post to task %s", task_id)
        else:
            try:
                await asyncio.to_thread(
                    self._bridge.mutation,
                    "tasks:create",
                    {"title": msg.content[:200]},
                )
                logger.info("[mc-channel] Created new task for message")
            except Exception:
                logger.exception("[mc-channel] Failed to create task")
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_mc_channel.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add nanobot/channels/mission_control.py tests/test_mc_channel.py
git commit -m "feat(channels): add MissionControlChannel with tests"
```

---

### Task 3: ChannelManager — register_channel method + mc init

**Files:**
- Modify: `nanobot/channels/manager.py:26-33` (add register_channel), `nanobot/channels/manager.py:128-138` (add mc init after qq)
- Modify: `nanobot/channels/__init__.py`
- Create: `tests/test_channel_manager_mc.py`

**Step 1: Write failing test**

Create `tests/test_channel_manager_mc.py`:

```python
"""Tests for ChannelManager.register_channel and MC channel init."""

from unittest.mock import MagicMock

import pytest

from nanobot.bus.queue import MessageBus
from nanobot.channels.manager import ChannelManager
from nanobot.channels.base import BaseChannel


class FakeChannel(BaseChannel):
    name = "fake"

    async def start(self):
        self._running = True

    async def stop(self):
        self._running = False

    async def send(self, msg):
        pass


class TestRegisterChannel:
    def test_register_channel_adds_to_dict(self) -> None:
        config = MagicMock()
        # Disable all channels in config so _init_channels is a no-op
        for ch_name in ("telegram", "whatsapp", "discord", "feishu",
                        "mochat", "dingtalk", "email", "slack", "qq", "mc"):
            getattr(config.channels, ch_name).enabled = False

        bus = MessageBus()
        mgr = ChannelManager(config, bus)

        fake = FakeChannel(config=MagicMock(), bus=bus)
        mgr.register_channel("fake", fake)

        assert "fake" in mgr.channels
        assert mgr.get_channel("fake") is fake

    def test_register_channel_appears_in_enabled_list(self) -> None:
        config = MagicMock()
        for ch_name in ("telegram", "whatsapp", "discord", "feishu",
                        "mochat", "dingtalk", "email", "slack", "qq", "mc"):
            getattr(config.channels, ch_name).enabled = False

        bus = MessageBus()
        mgr = ChannelManager(config, bus)
        fake = FakeChannel(config=MagicMock(), bus=bus)
        mgr.register_channel("fake", fake)

        assert "fake" in mgr.enabled_channels
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_channel_manager_mc.py -v`
Expected: FAIL — `AttributeError: 'ChannelManager' object has no attribute 'register_channel'`

**Step 3: Add register_channel to ChannelManager**

In `nanobot/channels/manager.py`, add method after `__init__` (after line 33):

```python
    def register_channel(self, name: str, channel: BaseChannel) -> None:
        """Register a channel programmatically (e.g., MC channel with bridge)."""
        self.channels[name] = channel
        logger.info("Registered channel: {}", name)
```

**Step 4: Add MC channel init in _init_channels**

In `nanobot/channels/manager.py`, add after the QQ block (after line 138):

```python
        # Mission Control channel (no external deps — just config flag)
        if self.config.channels.mc.enabled:
            try:
                from nanobot.channels.mission_control import MissionControlChannel
                self.channels["mc"] = MissionControlChannel(
                    self.config.channels.mc, self.bus
                )
                logger.info("Mission Control channel enabled")
            except ImportError as e:
                logger.warning("Mission Control channel not available: {}", e)
```

**Step 5: Update __init__.py exports**

In `nanobot/channels/__init__.py`, add:

```python
from nanobot.channels.mission_control import MissionControlChannel

__all__ = ["BaseChannel", "ChannelManager", "MissionControlChannel"]
```

**Step 6: Run tests**

Run: `uv run pytest tests/test_channel_manager_mc.py tests/test_mc_channel.py -v`
Expected: All PASS

**Step 7: Commit**

```bash
git add nanobot/channels/manager.py nanobot/channels/__init__.py tests/test_channel_manager_mc.py
git commit -m "feat(channels): add register_channel method and MC channel init"
```

---

### Task 4: Integrate ChannelManager into MC gateway

**Files:**
- Modify: `nanobot/mc/gateway.py:875-978` (run_gateway function)

**Step 1: Add ChannelManager + MessageBus to run_gateway**

In `nanobot/mc/gateway.py`, inside `run_gateway()`, after the imports at line 883, add:

```python
    from nanobot.config.loader import load_config
    from nanobot.bus.queue import MessageBus
    from nanobot.channels.manager import ChannelManager
    from nanobot.channels.mission_control import MissionControlChannel
```

After `logger.info("[gateway] Agent Gateway started")` (line 885), add:

```python
    # Channel manager for outbound cron delivery
    config = load_config()
    bus = MessageBus()
    channels = ChannelManager(config, bus)

    # Register MC channel with bridge access
    mc_channel = MissionControlChannel(config.channels.mc, bus, bridge=bridge)
    channels.register_channel("mc", mc_channel)

    if channels.enabled_channels:
        logger.info("[gateway] Channels enabled: %s", ", ".join(channels.enabled_channels))
```

**Step 2: Update on_cron_job to also publish outbound when deliver=True**

Replace the `on_cron_job` function (lines 959-975) with:

```python
    async def on_cron_job(job: CronJob) -> str | None:
        """Re-queue the originating task (if linked) or create a new task when a cron job fires.

        Additionally, if the job has deliver=True and a channel, publish a
        notification to that channel via the ChannelManager.
        """
        logger.info("[gateway] Cron job '%s' fired", job.name)
        try:
            if job.payload.task_id:
                await _requeue_cron_task(bridge, job.payload.task_id, job.payload.message)
            else:
                await asyncio.to_thread(
                    bridge.mutation,
                    "tasks:create",
                    {"title": job.payload.message},
                )
        except Exception:
            logger.exception("[gateway] Failed to handle cron job '%s'", job.name)

        # Deliver notification to external channel if configured
        if job.payload.deliver and job.payload.to and job.payload.channel:
            try:
                from nanobot.bus.events import OutboundMessage

                await bus.publish_outbound(OutboundMessage(
                    channel=job.payload.channel,
                    chat_id=job.payload.to,
                    content=f"\U0001f514 Cron triggered: {job.payload.message}",
                ))
            except Exception:
                logger.exception(
                    "[gateway] Failed to deliver cron notification to %s",
                    job.payload.channel,
                )

        return None
```

**Step 3: Start ChannelManager as background task**

Before `await stop_event.wait()` (line 1024), add:

```python
    channel_task = asyncio.create_task(channels.start_all())
```

And in the cancellation block (after line 1038), add:

```python
    channel_task.cancel()
```

And in the for-loop that awaits cancelled tasks, add `channel_task` to the tuple.

**Step 4: Run existing tests to verify no regressions**

Run: `uv run pytest tests/ -v --ignore=tests/test_docker.sh -x`
Expected: All PASS

**Step 5: Commit**

```bash
git add nanobot/mc/gateway.py
git commit -m "feat(gateway): integrate ChannelManager for outbound cron delivery"
```

---

### Task 5: Dashboard — /api/channels endpoint

**Files:**
- Create: `dashboard/app/api/channels/route.ts`

**Step 1: Create the endpoint**

Create `dashboard/app/api/channels/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export async function GET() {
  const configPath = join(homedir(), ".nanobot", "config.json");
  try {
    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content) as {
      channels?: Record<string, { enabled?: boolean }>;
    };

    const channels = config.channels ?? {};
    const enabled = Object.entries(channels)
      .filter(([, cfg]) => cfg.enabled === true)
      .map(([name]) => name);

    // MC is always available as a channel option
    if (!enabled.includes("mc")) {
      enabled.push("mc");
    }

    return NextResponse.json({ channels: enabled });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ channels: ["mc"] });
    }
    return NextResponse.json(
      { error: "Failed to read config" },
      { status: 500 },
    );
  }
}
```

**Step 2: Verify endpoint compiles**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx tsc --noEmit --strict dashboard/app/api/channels/route.ts 2>&1 || echo "Check errors above"`

If tsc fails due to project config, just verify syntax by reading the file.

**Step 3: Commit**

```bash
git add dashboard/app/api/channels/route.ts
git commit -m "feat(api): add /api/channels endpoint for enabled channel list"
```

---

### Task 6: Dashboard — PATCH /api/cron/[jobId] for channel editing

**Files:**
- Modify: `dashboard/app/api/cron/[jobId]/route.ts`

**Step 1: Add PATCH handler after the DELETE handler**

Append to `dashboard/app/api/cron/[jobId]/route.ts`:

```typescript
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const storePath = join(homedir(), ".nanobot", "cron", "jobs.json");
  const tmpPath = `${storePath}.tmp`;

  let body: { channel?: string | null; to?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const content = await readFile(storePath, "utf-8");
    if (!content.trim()) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const data = JSON.parse(content) as {
      version?: number;
      jobs?: Array<{
        id: string;
        payload?: { channel?: string | null; to?: string | null };
        updatedAtMs?: number;
      }>;
    };
    const jobs = data.jobs ?? [];
    const job = jobs.find((j) => j.id === jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!job.payload) {
      job.payload = {};
    }
    if ("channel" in body) job.payload.channel = body.channel ?? null;
    if ("to" in body) job.payload.to = body.to ?? null;
    job.updatedAtMs = Date.now();

    const updated = JSON.stringify(data, null, 2);
    await writeFile(tmpPath, updated, "utf-8");
    await rename(tmpPath, storePath);

    return NextResponse.json({ success: true, job });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    try {
      await unlink(tmpPath);
    } catch {}
    return NextResponse.json(
      { error: "Failed to update cron job" },
      { status: 500 },
    );
  }
}
```

**Step 2: Commit**

```bash
git add dashboard/app/api/cron/[jobId]/route.ts
git commit -m "feat(api): add PATCH handler for editing cron job channel/to"
```

---

### Task 7: Dashboard — CronJobsModal channel badges + editable delivery

**Files:**
- Modify: `dashboard/components/CronJobsModal.tsx`

**Step 1: Add state and fetch for enabled channels**

At the top of the `CronJobsModal` function (after the existing `useState` lines ~line 131), add:

```typescript
  const [enabledChannels, setEnabledChannels] = useState<string[]>([]);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [editChannel, setEditChannel] = useState<string>("");
  const [editTo, setEditTo] = useState<string>("");
  const [saving, setSaving] = useState(false);
```

In the `useEffect` (line 133), after the `fetch("/api/cron")` block, add a parallel fetch for channels:

```typescript
    fetch("/api/channels")
      .then((res) => res.ok ? res.json() as Promise<{ channels: string[] }> : { channels: [] })
      .then((data) => {
        if (!cancelled) setEnabledChannels(data.channels);
      })
      .catch(() => {});
```

**Step 2: Add channel badges to the header**

In the `DialogHeader` (line 180), after the `DialogTitle`, add channel badges before the close button:

```tsx
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base font-medium">
              Scheduled Cron Jobs
            </DialogTitle>
            <div className="flex items-center gap-1 ml-4">
              {enabledChannels.map((ch) => (
                <Badge key={ch} variant="outline" className="text-[10px] px-1.5 py-0">
                  {ch}
                </Badge>
              ))}
            </div>
          </div>
```

**Step 3: Make Delivery column editable**

Replace the Delivery `<td>` (lines 271-275) with:

```tsx
                    <td className="py-2 pr-4 text-muted-foreground text-xs">
                      {editingJob === job.id ? (
                        <div className="flex flex-col gap-1">
                          <select
                            className="text-xs border rounded px-1 py-0.5 bg-background"
                            value={editChannel}
                            onChange={(e) => setEditChannel(e.target.value)}
                          >
                            <option value="">— none —</option>
                            {enabledChannels.map((ch) => (
                              <option key={ch} value={ch}>{ch}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            className="text-xs border rounded px-1 py-0.5 bg-background w-24"
                            placeholder="to"
                            value={editTo}
                            onChange={(e) => setEditTo(e.target.value)}
                          />
                          <div className="flex gap-1">
                            <button
                              className="text-[10px] text-green-600 hover:underline disabled:opacity-50"
                              disabled={saving}
                              onClick={async () => {
                                setSaving(true);
                                try {
                                  const res = await fetch(`/api/cron/${job.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      channel: editChannel || null,
                                      to: editTo || null,
                                    }),
                                  });
                                  if (res.ok) {
                                    setJobs((prev) =>
                                      prev.map((j) =>
                                        j.id === job.id
                                          ? {
                                              ...j,
                                              payload: {
                                                ...j.payload,
                                                channel: editChannel || null,
                                                to: editTo || null,
                                              },
                                            }
                                          : j,
                                      ),
                                    );
                                    setEditingJob(null);
                                  }
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              {saving ? "..." : "save"}
                            </button>
                            <button
                              className="text-[10px] text-muted-foreground hover:underline"
                              onClick={() => setEditingJob(null)}
                            >
                              cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="hover:underline text-left"
                          onClick={() => {
                            setEditingJob(job.id);
                            setEditChannel(job.payload.channel ?? "");
                            setEditTo(job.payload.to ?? "");
                          }}
                        >
                          {job.payload.channel && job.payload.to
                            ? `${job.payload.channel} \u2192 ${job.payload.to}`
                            : "\u2014"}
                        </button>
                      )}
                    </td>
```

**Step 4: Verify build**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx next build 2>&1 | tail -20`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add dashboard/components/CronJobsModal.tsx
git commit -m "feat(dashboard): add channel badges and editable delivery to CronJobsModal"
```

---

### Task 8: Integration smoke test

**Step 1: Run all Python tests**

Run: `uv run pytest tests/ -v --ignore=tests/test_docker.sh -x`
Expected: All PASS

**Step 2: Run dashboard tests**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All PASS (or pre-existing failures only)

**Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: integration fixups for MC channel feature"
```
