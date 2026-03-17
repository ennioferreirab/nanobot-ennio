# MC Channel + Cron Dashboard Enhancements

**Date:** 2026-02-27
**Status:** Approved

## Problem

1. Cron jobs with `channel: "mc"` fail silently — the ChannelManager has no MC handler
2. The MC gateway (`gateway.py`) has no ChannelManager, so cron jobs with external channels (e.g., `channel: "telegram"`) can't deliver outside Convex
3. The CronJobsModal in the dashboard doesn't show which channels are available or allow editing job delivery channels

## Solution

### 1. MissionControlChannel

New channel implementation that bridges the ChannelManager to Convex.

**File:** `nanobot/channels/mission_control.py`

```python
class MissionControlChannel(BaseChannel):
    name = "mc"

    def __init__(self, config, bus, bridge=None):
        super().__init__(config, bus)
        self._bridge = bridge

    async def start(self):
        self._running = True
        while self._running:
            await asyncio.sleep(1)

    async def stop(self):
        self._running = False

    async def send(self, msg: OutboundMessage):
        # Post to task thread if chat_id is a task_id, else create new task
```

**Config:** `MissionControlConfig(enabled=False)` in `schema.py`, added to `ChannelsConfig`.

### 2. ChannelManager in MC Gateway

**Changes to `gateway.py:run_gateway()`:**
- Load config, create `MessageBus`, create `ChannelManager`
- Register `MissionControlChannel` with bridge access via new `register_channel()` method
- Run ChannelManager outbound dispatcher as background task
- Cron callback: when `deliver=True`, publish notification `OutboundMessage` to the specified channel

**Note:** The MC gateway runs agents via TaskExecutor (not inline). When `deliver=True`:
- A notification is sent to the external channel immediately (e.g., "Cron [name] triggered")
- The full agent response goes to the Convex task thread
- Full response delivery to external channels is deferred to Phase 2

**ChannelManager changes (`manager.py`):**
- New method `register_channel(name, channel)` for programmatic channel registration

### 3. Dashboard: Channel Indicators + Edit Channel Per Job

**New API endpoint: `GET /api/channels`**
- Reads `~/.nanobot/config.json`
- Returns `{ channels: ["telegram", "mc", ...] }` (enabled channels only)

**New API endpoint: `PATCH /api/cron/[jobId]`**
- Updates `payload.channel` and `payload.to` on an existing job
- Atomic write (tmp file + rename)

**CronJobsModal.tsx changes:**
- Header (right side): Badges showing enabled channels
- Delivery column: Clickable dropdown to change job's channel (from enabled list)
- "To" field: Inline editable text input

## Files Changed

### Python Backend
- `nanobot/channels/mission_control.py` (NEW)
- `nanobot/config/schema.py` (add MissionControlConfig to ChannelsConfig)
- `nanobot/channels/manager.py` (add register_channel method + mc init)
- `nanobot/mc/gateway.py` (add ChannelManager, bus, update cron callback)
- `nanobot/channels/__init__.py` (export MissionControlChannel)

### Dashboard
- `dashboard/app/api/channels/route.ts` (NEW)
- `dashboard/app/api/cron/[jobId]/route.ts` (add PATCH handler)
- `dashboard/components/CronJobsModal.tsx` (channel badges + editable delivery)

## Out of Scope
- Full agent response delivery to external channels from MC gateway (Phase 2)
- YouTube Summarizer cron cleanup (no jobs exist to clean)
- Channel creation/configuration UI
