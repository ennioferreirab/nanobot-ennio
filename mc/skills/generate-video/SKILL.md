---
name: generate-video
description: "Create a complete video pre-production package: script with timestamps, scene breakdowns, shot compositions, actor profile images (left/right), and scene take images at defined intervals. Uses generate-image for all visuals. Outputs a structured folder ready for external video generation. Use when an agent needs to plan a video, create a storyboard, produce video assets, or prepare a video production package."
---

# Generate Video

Create a complete video pre-production package — script, storyboard, actor
profiles, and scene take images — organized in a production folder ready for
external video generation.

## Overview

This skill produces a **production folder** with everything needed to generate a
video externally:

```
video-production/
  script.md              — Full script with timestamps and directions
  storyboard.json        — Machine-readable scene/shot data
  actors/
    actor-name-left.png  — Left profile
    actor-name-right.png — Right profile
    actor-name-front.png — Front-facing reference
  takes/
    00m00s-scene-01.png  — Key frame at timestamp
    00m30s-scene-02.png  — Key frame at timestamp
    ...
```

## Workflow — Execute in Order

### Phase 1: Script & Timing

Define the video structure before any visuals.

1. **Clarify the brief** — Ask the user for:
   - Video topic/purpose
   - Target duration (in minutes)
   - Intended audience
   - Tone (formal, casual, energetic, cinematic, etc.)
   - Number of actors/characters (names, roles, brief appearance description)
   - Key frame interval (default: every 30 seconds)

2. **Write the timed script** — Create `script.md` with this structure:

```markdown
# Video: [Title]

**Duration:** [X]min | **Tone:** [tone] | **Audience:** [audience]

## Actors

| Actor | Role | Appearance |
|-------|------|------------|
| [Name] | [Role] | [Brief physical description, clothing, style] |

## Scenes

### Scene 1: [Title] — 00:00–00:45

**Setting:** [Location/environment description]
**Mood:** [Emotional tone of the scene]
**Lighting:** [Natural/studio/dramatic/warm/cool]

| Timestamp | Action | Dialogue/Narration | Camera |
|-----------|--------|-------------------|--------|
| 00:00 | [Actor] enters frame from left | "Opening line..." | Wide establishing shot |
| 00:15 | Close-up on [Actor]'s face | "Key line..." | Close-up, shallow DOF |
| 00:30 | [Actor] gestures toward screen | — | Medium shot, slight pan right |

**Transition to next scene:** [Cut/fade/dissolve/wipe]

### Scene 2: [Title] — 00:45–01:30
...
```

Each scene must specify: setting, mood, lighting, timestamped actions with camera directions, and transition type.

### Phase 2: Scene Breakdown

For each scene, document these details in `storyboard.json`:

```json
{
  "title": "Video Title",
  "duration_seconds": 180,
  "key_frame_interval_seconds": 30,
  "actors": [
    {
      "id": "actor-1",
      "name": "Maria",
      "role": "Host",
      "appearance": "Woman, 30s, dark hair pulled back, navy blazer, confident posture",
      "profile_prompt_base": "Professional woman in her 30s, dark hair pulled back in a low bun, wearing a fitted navy blazer over a white blouse, confident expression"
    }
  ],
  "scenes": [
    {
      "id": "scene-01",
      "title": "Introduction",
      "start_seconds": 0,
      "end_seconds": 45,
      "setting": "Modern office with large windows, city skyline in background, morning light",
      "mood": "Welcoming, professional",
      "lighting": "Soft natural light from left, warm tone",
      "color_palette": ["#2C3E50", "#ECF0F1", "#3498DB"],
      "shots": [
        {
          "timestamp_seconds": 0,
          "timestamp_label": "00m00s",
          "action": "Maria stands at center, facing camera, slight smile",
          "camera_angle": "wide establishing shot",
          "camera_movement": "static",
          "framing": "full body, rule of thirds — subject at right third",
          "depth_of_field": "deep — entire room in focus",
          "actors_in_frame": ["actor-1"],
          "actor_positions": {"actor-1": "center-right"},
          "generate_take": true
        },
        {
          "timestamp_seconds": 15,
          "timestamp_label": "00m15s",
          "action": "Maria speaks directly to camera",
          "camera_angle": "medium close-up",
          "camera_movement": "slow dolly in",
          "framing": "shoulders up, centered",
          "depth_of_field": "shallow — background blurred",
          "actors_in_frame": ["actor-1"],
          "actor_positions": {"actor-1": "center"},
          "generate_take": true
        }
      ],
      "transition": "dissolve"
    }
  ]
}
```

**Required fields per shot:**
- `camera_angle` — wide, medium, close-up, extreme close-up, over-the-shoulder, bird's eye, low angle, dutch angle
- `camera_movement` — static, pan left/right, tilt up/down, dolly in/out, tracking, crane, handheld
- `framing` — composition description using rule of thirds, leading lines, symmetry
- `depth_of_field` — deep (everything sharp) or shallow (subject sharp, background blur)
- `actors_in_frame` — which actors appear
- `actor_positions` — where each actor is (left, center, right, background)

### Phase 3: Generate Actor Profiles

For each actor, generate **3 profile images** for character consistency reference.

Use the `generate-image` script with these specific prompts:

```bash
# Right profile (3/4 view facing right)
uv run python .claude/skills/generate-image/scripts/generate_image.py \
  --prompt "Portrait of [APPEARANCE]. Three-quarter view facing right, neutral studio background, soft even lighting, photorealistic, head and shoulders framing, professional headshot style" \
  --aspect 2:3 --size 1K --quality medium \
  --output "[OUTPUT_DIR]/actors/[actor-id]-right.png"

# Left profile (3/4 view facing left)
uv run python .claude/skills/generate-image/scripts/generate_image.py \
  --prompt "Portrait of [APPEARANCE]. Three-quarter view facing left, neutral studio background, soft even lighting, photorealistic, head and shoulders framing, professional headshot style" \
  --aspect 2:3 --size 1K --quality medium \
  --output "[OUTPUT_DIR]/actors/[actor-id]-left.png"

# Front-facing reference
uv run python .claude/skills/generate-image/scripts/generate_image.py \
  --prompt "Portrait of [APPEARANCE]. Front-facing view, direct eye contact, neutral studio background, soft even lighting, photorealistic, head and shoulders framing, professional headshot style" \
  --aspect 2:3 --size 1K --quality medium \
  --output "[OUTPUT_DIR]/actors/[actor-id]-front.png"
```

Replace `[APPEARANCE]` with the actor's `profile_prompt_base` from the storyboard.
Replace `[OUTPUT_DIR]` with the production output directory.

**Important:** Include distinctive details (clothing, accessories, hairstyle) in
every prompt to maximize visual consistency across all images of the same actor.

### Phase 4: Generate Scene Takes

For each shot where `generate_take: true`, generate a key frame image.

Build the prompt by combining scene and shot data:

```
[ACTION DESCRIPTION]. [SETTING]. [CAMERA_ANGLE], [FRAMING].
[LIGHTING]. [MOOD] atmosphere. [DEPTH_OF_FIELD].
Photorealistic, cinematic still frame, 35mm film look.
```

Example:

```bash
uv run python .claude/skills/generate-image/scripts/generate_image.py \
  --prompt "A professional woman in a navy blazer stands at center-right of a modern office with large windows and city skyline. Wide establishing shot, full body, rule of thirds composition. Soft natural light from the left, warm tone. Welcoming professional atmosphere. Deep depth of field, entire room in focus. Photorealistic, cinematic still frame, 35mm film look" \
  --aspect 16:9 --size 1K --quality medium \
  --output "[OUTPUT_DIR]/takes/00m00s-scene-01.png"
```

**Naming convention:** `[TIMESTAMP]-[SCENE_ID].png` — e.g. `00m30s-scene-02.png`

**Aspect ratio for takes:** Always use `16:9` (standard video) unless the user
specifies a different format (9:16 for vertical/stories, 1:1 for square).

### Phase 5: Assembly & Summary

After generating all images, create a `README.md` in the production folder:

```markdown
# Production Package: [Video Title]

**Generated:** [date]
**Duration:** [X]min | **Scenes:** [N] | **Takes:** [N] | **Actors:** [N]

## Contents

- `script.md` — Full timed script with directions
- `storyboard.json` — Machine-readable scene/shot data
- `actors/` — [N] actor profile images (left, right, front per actor)
- `takes/` — [N] key frame images at [interval]s intervals

## How to Use

1. Feed `storyboard.json` to your video generation tool
2. Use `actors/` images as character reference/consistency anchors
3. Use `takes/` images as key frames / style targets
4. Follow `script.md` for timing, dialogue, and transitions

## Scene Map

| Scene | Time | Takes | Description |
|-------|------|-------|-------------|
| Scene 1 | 00:00–00:45 | 3 | [Brief description] |
| Scene 2 | 00:45–01:30 | 2 | [Brief description] |
...
```

## Key Rules

1. **Execute all phases sequentially without stopping for approval.** Write the
   script, generate the storyboard, actor profiles, and scene takes in one
   continuous run.

2. **Use `--quality medium` for all images** — we are in test mode. Switch to
   `high` only if the user explicitly requests production quality.

3. **Maintain actor consistency** — use the exact same appearance description
   across all prompts featuring the same actor. Never vary clothing, hair, or
   distinctive features between images.

4. **One image per key frame interval** — default is every 30 seconds. The user
   can change this. More frequent = more images = higher cost.

5. **Save everything to the task output directory** — use the output path
   provided by the task context, or ask the user where to save.

6. **Camera angle vocabulary** — use cinematic terms consistently:

| Term | Description |
|------|-------------|
| Establishing / wide | Full environment, sets context |
| Medium shot | Waist up, conversational |
| Medium close-up | Chest/shoulders up |
| Close-up | Face fills frame |
| Extreme close-up | Detail (eyes, hands, object) |
| Over-the-shoulder | From behind one person toward another |
| Low angle | Camera below subject, looking up — authority |
| High angle | Camera above subject, looking down — vulnerability |
| Bird's eye | Directly overhead |
| Dutch angle | Tilted horizon — tension, unease |

7. **Transitions vocabulary:**

| Type | Use |
|------|-----|
| Cut | Default, instant change — used for most transitions |
| Dissolve | Passage of time, change of location |
| Fade to black | End of act, dramatic pause |
| Wipe | Energetic, playful tone |
| Match cut | Visual or thematic connection between scenes |

## References

For image prompt engineering best practices, read
[generate-image/references/design-guidelines.md](../generate-image/references/design-guidelines.md).

For detailed shot composition and cinematic framing reference, read
[references/video-production-guide.md](references/video-production-guide.md).
