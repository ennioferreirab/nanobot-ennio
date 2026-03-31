# Video Production Guide

Reference for cinematic shot composition, camera work, and visual storytelling
used by the generate-video skill.

## Shot Sizes

Shot size controls emotional distance between viewer and subject.

| Shot | Framing | Emotional Effect | When to Use |
|------|---------|-----------------|-------------|
| Extreme wide (XWS) | Vast landscape, subject is tiny | Isolation, epic scale | Opening shots, location establishment |
| Wide / establishing (WS) | Full environment visible | Context, orientation | Scene introductions, transitions |
| Full shot (FS) | Subject head to toe | Neutral, observational | Walking, full body action |
| Medium wide (MWS) | Knees up | Casual, group dynamics | Two-person conversations |
| Medium (MS) | Waist up | Conversational, balanced | Dialogue, presentations |
| Medium close-up (MCU) | Chest up | Engagement, intimacy starts | Key dialogue, reactions |
| Close-up (CU) | Face fills frame | Emotion, intensity | Emotional beats, important lines |
| Extreme close-up (XCU) | Single feature (eye, hand) | Tension, detail, drama | Reveals, tension peaks |
| Insert | Object detail | Information, emphasis | Product shots, props, screens |

### Progression Pattern

Build intensity by tightening shots through a scene:

```
WS → MS → MCU → CU
```

This pulls the viewer progressively closer, increasing emotional engagement.
Reverse (CU → WS) creates a reveal or context shift.

## Camera Angles

| Angle | Camera Position | Psychological Effect |
|-------|----------------|---------------------|
| Eye level | Same height as subject | Neutral, relatable |
| Low angle | Below subject, looking up | Power, authority, heroism |
| High angle | Above subject, looking down | Vulnerability, smallness |
| Bird's eye | Directly overhead | Detachment, god's view |
| Worm's eye | Ground level, extreme low | Dramatic, surreal |
| Dutch / canted | Tilted horizon | Unease, disorientation, tension |
| Over-the-shoulder (OTS) | Behind one person toward another | Conversation, connection |
| POV | Subject's viewpoint | Immersion, identification |

## Camera Movement

| Movement | Description | Effect |
|----------|-------------|--------|
| Static | No movement | Stability, observational |
| Pan (left/right) | Camera rotates on axis | Reveals environment, follows action |
| Tilt (up/down) | Camera pivots vertically | Reveals height, scale |
| Dolly (in/out) | Camera moves toward/away | Increasing/decreasing intimacy |
| Tracking / truck | Camera moves alongside subject | Following action, energy |
| Crane / jib | Vertical rise or descent | Epic reveals, establishing scope |
| Handheld | Intentional shake | Documentary feel, urgency, chaos |
| Steadicam | Smooth gliding movement | Dreamlike, exploration |
| Zoom (in/out) | Lens zooms, camera stays put | Emphasis (in) or disorientation (out) |

## Composition for Key Frames

When generating still images as scene takes, apply these principles:

### Rule of Thirds

Place the subject at intersections of the 3x3 grid. Never center unless
intentionally breaking the rule for symmetry.

- Subject's eyes at top-third line
- Key action at intersection points
- Horizon on lower or upper third (never center)

### Leading Lines

Use environmental lines (hallways, roads, table edges) to guide the viewer's
eye toward the subject.

### Depth Layers

Create three depth layers for cinematic look:

1. **Foreground** — something partially in frame (blurred plant, desk edge)
2. **Midground** — the subject (in focus)
3. **Background** — environment context (blurred or sharp per DOF choice)

### Frame Within Frame

Use doorways, windows, arches, or screens to frame the subject within the
image frame. Adds depth and visual interest.

### Negative Space

Leave intentional empty space:
- In the direction the subject is looking (lead room)
- Above the subject in wide shots (head room)
- Opposite the subject for tension/isolation

## Lighting Setups

| Setup | Description | Mood |
|-------|-------------|------|
| Three-point | Key + fill + back light | Standard, professional |
| Rembrandt | Triangle of light on cheek | Dramatic, artistic |
| Split | Half face lit, half dark | Mystery, duality |
| Broad | Lit side faces camera | Open, friendly |
| Short | Shadow side faces camera | Moody, slimming |
| Butterfly | Light above, centered | Glamour, beauty |
| Silhouette | Backlit, subject dark | Mystery, dramatic reveal |
| Natural | Window/ambient light | Documentary, authentic |
| Golden hour | Warm, low sun | Romantic, nostalgic |
| Blue hour | Cool, pre-dawn/post-dusk | Melancholy, contemplative |

## Scene Transitions

### Cut Types

| Type | When to Use | Prompt Hint |
|------|-------------|-------------|
| Hard cut | Default, same time/place | — |
| Jump cut | Time compression within same scene | Show slightly different framing |
| Match cut | Connect two ideas visually | Same shape/movement in both shots |
| Smash cut | Jarring contrast | Opposite energy between scenes |
| L-cut / J-cut | Audio leads or trails video | Note in script, not in image |

### Transition Effects

| Effect | When to Use |
|--------|-------------|
| Dissolve | Passage of time, location change |
| Fade to/from black | Beginning/end of acts |
| Wipe | Energetic, playful, retro |
| Iris | Retro/nostalgic callbacks |

## Multi-Actor Composition

When two or more actors appear in a frame:

### Two-person Scenes

| Pattern | Setup | Use |
|---------|-------|-----|
| Shot / reverse shot | Alternate between OTS angles | Conversation |
| Two-shot | Both subjects in one frame | Shared moment, agreement |
| Split frame | Each subject owns half the frame | Opposition, debate |
| Foreground/background | One close, one far | Power dynamics |

### Actor Positioning

- **Same level** — equality, partnership
- **One standing, one sitting** — authority, mentorship
- **Back-to-back** — conflict, tension
- **Side-by-side facing camera** — unity, team presentation
- **One in foreground, one behind** — hierarchy, storytelling layers

## Color Psychology for Scenes

| Color Dominant | Emotion | Scene Type |
|---------------|---------|------------|
| Warm (orange, amber) | Comfort, nostalgia, energy | Home scenes, success moments |
| Cool (blue, teal) | Calm, professional, melancholy | Office, tech, reflective |
| Desaturated | Serious, documentary, gritty | Problems, challenges |
| High saturation | Energy, youth, excitement | Celebrations, reveals |
| Monochrome accent | Focus, sophistication | Key product/message moments |
| Complementary contrast | Tension, visual pop | Conflict, turning points |

## Prompt Engineering for Scene Takes

### Template

```
[ACTOR_DESCRIPTION] [ACTION] in [SETTING].
[SHOT_SIZE] [CAMERA_ANGLE], [FRAMING_COMPOSITION].
[LIGHTING_SETUP], [COLOR_TONE].
[MOOD] atmosphere. [DEPTH_OF_FIELD].
Cinematic still frame, 35mm film look, photorealistic.
```

### Example Prompts by Scene Type

**Dialogue scene:**
```
A professional woman in a navy blazer speaks to camera in a modern office with
floor-to-ceiling windows. Medium close-up, eye level, subject at left third.
Three-point lighting with warm key light, cool fill. Professional yet warm
atmosphere. Shallow depth of field, background softly blurred. Cinematic still
frame, 35mm film look, photorealistic.
```

**Action/movement:**
```
A man in a dark suit walks briskly through a busy corporate lobby, other people
blur past. Medium wide tracking shot, slight low angle. Natural overhead
lighting with warm accents. Purposeful, determined atmosphere. Moderate depth of
field. Motion blur on background figures. Cinematic still frame, 35mm film look.
```

**Product reveal:**
```
Hands carefully place a sleek black device on a white pedestal. Insert shot,
bird's eye angle, centered composition. Clean studio lighting, bright and even.
Minimalist, premium atmosphere. Deep depth of field, everything sharp. Product
photography meets cinema, high contrast, photorealistic.
```

**Emotional beat:**
```
Close-up of a woman's face, slight smile forming, eyes reflecting soft light.
Close-up, eye level, face fills right two-thirds of frame. Rembrandt lighting,
warm golden tone. Hopeful, intimate atmosphere. Very shallow depth of field.
Cinematic still frame, anamorphic lens flare hint, photorealistic.
```
