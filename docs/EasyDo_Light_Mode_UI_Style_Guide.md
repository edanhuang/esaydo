# EasyDo Light Mode UI Style Guide

EasyDo is a keyboard-first todo and worklog app.

This light mode style should match the EasyDo logo while creating a brighter and more breathable daytime experience. The logo uses deep navy, cream-white, soft lavender, and golden sparkle. In light mode, the interface should keep the same brand personality, but invert the feeling:

- from midnight navy to warm misty cream
- from dark magical focus to bright gentle clarity
- from deep glow to soft sunlight sparkle
- from heavy productivity to lightweight daily flow

The product feeling should be:

- clean and bright
- warm but not childish
- focused but not sterile
- magical but very subtle
- polished like a modern macOS app
- soft, elegant, anime-inspired, and friendly

## Core Design Direction

Use a light-first interface inspired by the EasyDo logo.

The main background should be a warm cream / ivory tone, not pure white. Cards and panels should use slightly elevated warm white surfaces. Primary text should use deep navy instead of black. Accent actions should use a soft golden yellow, inspired by the sparkle in the logo. Secondary highlights should use gentle lavender, inspired by the logo's shadow color.

Avoid:

- pure white backgrounds
- pure black text
- generic SaaS blue
- cold gray enterprise UI
- overly childish pastel candy colors
- heavy gradients
- excessive glassmorphism
- neon effects

The UI should feel like:

> A bright little snap that clears the day.

## Keywords

Use these words to guide the visual direction:

- light
- clean
- warm
- calm
- focused
- magical
- breathable
- soft sunlight
- cream white
- golden sparkle
- lavender shadow
- macOS polished
- anime-inspired simplicity

## Color Palette

Use these colors as design tokens:

```ts
export const easyDoLightTheme = {
  colors: {
    // Core backgrounds
    background: "#FFF9EA",        // warm ivory cream
    backgroundSoft: "#FFF3D6",    // soft warm page surface
    surface: "#FFFFFF",           // cards and panels
    surfaceWarm: "#FFFDF7",       // softer elevated surface
    surfaceHover: "#FFF5DC",      // hover state
    surfaceActive: "#FFF0C2",     // selected / active item

    // Text
    textPrimary: "#121632",       // deep navy, from logo background
    textSecondary: "#4D5278",     // muted navy lavender
    textMuted: "#7B789A",         // soft purple gray
    textDisabled: "#AAA6BE",

    // Brand accents
    primary: "#F5B93F",           // warm golden sparkle
    primaryHover: "#FFD76A",
    primaryActive: "#D99A1F",
    primarySoft: "#FFF0BE",

    // Secondary accents
    lavender: "#B9A7FF",          // logo shadow lavender
    lavenderSoft: "#EEE8FF",
    lavenderSurface: "#F7F3FF",
    violet: "#7C6EE6",

    // Semantic colors, softened for light mode
    success: "#3BAF73",
    successSoft: "#E8F8EF",
    warning: "#D99A1F",
    warningSoft: "#FFF2CC",
    danger: "#E35D6A",
    dangerSoft: "#FFE9EC",
    info: "#3E8EDB",
    infoSoft: "#EAF4FF",

    // Borders and dividers
    border: "#E7DDBF",
    borderSoft: "#F1E8D2",
    borderLavender: "#DDD3FF",

    // Input
    inputBackground: "#FFFFFF",
    inputBorder: "#E2D6B8",
    inputFocus: "#F5B93F",

    // Shadows and glow
    shadowColor: "rgba(18, 22, 50, 0.12)",
    shadowSoft: "rgba(18, 22, 50, 0.08)",
    glowGold: "rgba(245, 185, 63, 0.22)",
    glowLavender: "rgba(185, 167, 255, 0.18)"
  }
}
```

## Tailwind Theme Suggestion

If using Tailwind, extend the theme like this:

```ts
theme: {
  extend: {
    colors: {
      easydoLight: {
        bg: "#FFF9EA",
        bgSoft: "#FFF3D6",
        surface: "#FFFFFF",
        surfaceWarm: "#FFFDF7",
        surfaceHover: "#FFF5DC",
        surfaceActive: "#FFF0C2",

        text: "#121632",
        textSecondary: "#4D5278",
        textMuted: "#7B789A",
        textDisabled: "#AAA6BE",

        gold: "#F5B93F",
        goldHover: "#FFD76A",
        goldActive: "#D99A1F",
        goldSoft: "#FFF0BE",

        lavender: "#B9A7FF",
        lavenderSoft: "#EEE8FF",
        lavenderSurface: "#F7F3FF",
        violet: "#7C6EE6",

        border: "#E7DDBF",
        borderSoft: "#F1E8D2",
        borderLavender: "#DDD3FF",

        success: "#3BAF73",
        successSoft: "#E8F8EF",
        warning: "#D99A1F",
        warningSoft: "#FFF2CC",
        danger: "#E35D6A",
        dangerSoft: "#FFE9EC",
        info: "#3E8EDB",
        infoSoft: "#EAF4FF"
      }
    },
    boxShadow: {
      "easydo-light-card": "0 12px 32px rgba(18, 22, 50, 0.10)",
      "easydo-light-float": "0 18px 48px rgba(18, 22, 50, 0.12)",
      "easydo-light-glow": "0 0 24px rgba(245, 185, 63, 0.20)",
      "easydo-light-lavender": "0 0 28px rgba(185, 167, 255, 0.16)"
    },
    borderRadius: {
      "easydo": "18px",
      "easydo-lg": "24px",
      "easydo-xl": "32px"
    }
  }
}
```

## shadcn/ui Light Theme Mapping

Use this as the light mode theme.

```css
:root {
  --background: 43 100% 96%;
  --foreground: 233 47% 13%;

  --card: 0 0% 100%;
  --card-foreground: 233 47% 13%;

  --popover: 0 0% 100%;
  --popover-foreground: 233 47% 13%;

  --primary: 40 90% 60%;
  --primary-foreground: 233 47% 13%;

  --secondary: 252 100% 96%;
  --secondary-foreground: 244 45% 36%;

  --muted: 42 65% 93%;
  --muted-foreground: 247 16% 54%;

  --accent: 252 100% 92%;
  --accent-foreground: 244 45% 36%;

  --destructive: 354 72% 63%;
  --destructive-foreground: 0 0% 100%;

  --border: 42 42% 83%;
  --input: 42 42% 83%;
  --ring: 40 90% 60%;

  --radius: 1rem;
}
```

If the app supports both dark and light mode, use the light tokens above for `:root` and the deep navy tokens from the dark guide for `.dark`.

## App Layout

The light mode should feel like a warm productivity desk, not a blank document.

Recommended layout direction:

- App background: warm ivory cream
- Sidebar: slightly warmer cream surface
- Main board: clean warm background
- Todo cards: white or warm white, with soft shadows
- Active item: soft gold border or subtle lavender glow
- Completed item: quiet, muted, and elegant
- Important actions: golden sparkle accent
- Secondary actions: lavender accent

Use generous spacing and soft rounded corners.

Recommended border radius:

- Small controls: 10px–12px
- Todo cards: 16px–20px
- Panels / modals: 24px–28px

## Todo Cards

Todo cards should feel light, tactile, and easy to scan.

Default card:

```css
background: #FFFFFF;
border: 1px solid #E7DDBF;
color: #121632;
border-radius: 18px;
box-shadow: 0 10px 26px rgba(18, 22, 50, 0.08);
```

Hover card:

```css
background: #FFFDF7;
border-color: rgba(245, 185, 63, 0.42);
box-shadow: 0 14px 32px rgba(18, 22, 50, 0.11);
transform: translateY(-1px);
```

Selected card:

```css
background: #FFFDF7;
border-color: #F5B93F;
box-shadow:
  0 0 0 1px rgba(245, 185, 63, 0.28),
  0 0 24px rgba(245, 185, 63, 0.16),
  0 12px 32px rgba(18, 22, 50, 0.10);
```

Completed todo:

```css
opacity: 0.62;
text-decoration: line-through;
color: #7B789A;
background: #FFF9EA;
```

## Buttons

Primary buttons should use the golden sparkle color.

```css
background: #F5B93F;
color: #121632;
border-radius: 14px;
font-weight: 650;
box-shadow: 0 8px 20px rgba(245, 185, 63, 0.22);
```

Hover:

```css
background: #FFD76A;
box-shadow: 0 0 20px rgba(245, 185, 63, 0.28);
transform: translateY(-1px);
```

Secondary buttons should be warm white with lavender or soft cream border:

```css
background: #FFFFFF;
color: #4D5278;
border: 1px solid #E7DDBF;
```

Secondary hover:

```css
background: #F7F3FF;
border-color: #DDD3FF;
color: #7C6EE6;
```

Ghost buttons should be very quiet:

```css
background: transparent;
color: #7B789A;
```

Ghost hover:

```css
background: #FFF3D6;
color: #121632;
```

## Inputs

Inputs should feel clean, calm, and slightly warm.

```css
background: #FFFFFF;
border: 1px solid #E2D6B8;
color: #121632;
border-radius: 14px;
```

Focus state:

```css
border-color: #F5B93F;
box-shadow: 0 0 0 3px rgba(245, 185, 63, 0.18);
```

Placeholder:

```css
color: #AAA6BE;
```

Command input variant:

```css
background: #FFFDF7;
border: 1px solid #E7DDBF;
box-shadow: 0 12px 32px rgba(18, 22, 50, 0.10);
```

## Typography

Use a clean modern sans-serif font.

Recommended font stack:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  "SF Pro Text",
  "Helvetica Neue",
  Arial,
  sans-serif;
```

Recommended hierarchy:

- App title: 22–26px, 650 weight, deep navy
- Section title: 16–18px, 600 weight
- Todo title/detail: 14–16px, 500 weight
- Metadata: 12–13px, muted lavender gray
- Shortcut hints: 11–12px, monospace or rounded pill style

Do not use pure black. Use deep navy for strong text.

## Icon Style

Icons should match the logo style:

- simple line icons
- rounded stroke caps
- minimal detail
- 1.75px–2px stroke width
- deep navy by default
- muted lavender gray for secondary icons
- gold only for primary or highlight actions

Avoid:

- hard black icons
- sharp technical icons
- overly detailed icons
- colorful icon packs
- childish sticker-style icons

## Tags and Pills

Tags should feel soft and lightweight.

Default tag:

```css
background: #F7F3FF;
color: #7C6EE6;
border: 1px solid #DDD3FF;
border-radius: 999px;
```

Gold tag:

```css
background: #FFF0BE;
color: #8A5E00;
border: 1px solid rgba(245, 185, 63, 0.35);
border-radius: 999px;
```

Muted tag:

```css
background: #FFF3D6;
color: #7B789A;
border: 1px solid #F1E8D2;
border-radius: 999px;
```

## Keyboard Shortcut Hints

EasyDo is keyboard-first, so shortcuts should be visible but not noisy.

Shortcut hint style:

```css
background: #FFF3D6;
border: 1px solid #E7DDBF;
color: #4D5278;
border-radius: 8px;
font-size: 11px;
font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
box-shadow: inset 0 -1px 0 rgba(18, 22, 50, 0.08);
```

Active shortcut hint:

```css
background: #FFF0BE;
border-color: rgba(245, 185, 63, 0.45);
color: #121632;
```

## Micro-interactions

Animations should be subtle, bright, and elegant.

Use:

- 120–180ms transitions
- slight scale or translate on hover
- soft shadow lift on active cards
- tiny gold sparkle when completing a todo
- very subtle lavender glow for focus or selection

Do not overuse animation. The UI should feel responsive, not distracting.

Suggested transition:

```css
transition:
  background-color 160ms ease,
  border-color 160ms ease,
  box-shadow 160ms ease,
  transform 120ms ease,
  color 160ms ease;
```

Completion interaction idea:

When the user completes a todo with a keyboard shortcut, briefly show a tiny golden sparkle near the card or checkbox. In light mode, the sparkle should be warm and soft, like sunlight, not neon.

## Light and Dark Mode Relationship

The light mode should not feel like a different product.

It should share the same DNA as dark mode:

- same gold accent
- same lavender secondary tone
- same rounded macOS-like shapes
- same minimalist anime-inspired softness
- same warm cream identity
- same snapping/sparkle metaphor

Dark mode is “midnight focus magic.”  
Light mode is “daylight clarity magic.”

## Component Implementation Guidance

Before implementing business features, first create the EasyDo light visual system:

1. Light mode Tailwind theme tokens
2. shadcn/ui light theme variables
3. Light AppShell layout
4. Button/Card/Input/TodoCard base components
5. One demo page showing both light and dark mode switch behavior

This prevents the app from accidentally falling back into default shadcn gray styling.

## Recommended Initial Components

Create the following base components first:

- `AppShell`
- `ThemeToggle`
- `Sidebar`
- `TopCommandBar`
- `TodoCard`
- `TodoColumn`
- `PrimaryButton`
- `SecondaryButton`
- `GhostButton`
- `ShortcutHint`
- `TagPill`
- `EmptyState`
- `GlowFocusRing`

## Example UI Prompt for Coding AI

Use the following instruction when asking a coding AI to implement the light mode interface:

```md
Implement EasyDo light mode using the visual style defined in this document.

The UI must match the EasyDo logo direction while creating a bright daytime experience:
warm ivory background, deep navy text, golden sparkle primary accent, soft lavender secondary accent, rounded macOS-like surfaces, subtle shadows, and minimalist anime-inspired softness.

Do not use default shadcn gray styling.
Do not use generic SaaS blue.
Do not use pure black or pure white.
Do not make the UI look like a cold enterprise dashboard.

Start by creating the light theme tokens and base UI components before implementing business features.

Create a demo page showing:
- light sidebar
- todo board
- selected todo card
- completed todo card
- command input
- primary, secondary, and ghost buttons
- shortcut hints
- tag pills
- subtle gold sparkle completion effect
- dark/light mode toggle
```

## Overall Rule

Every UI decision should answer this question:

> Does this feel like the EasyDo logo became a bright, usable daytime app?

The answer should be yes:

- warm ivory
- deep navy
- golden sparkle
- soft lavender
- clean anime-inspired simplicity
- polished macOS productivity feeling
- bright but not sterile
- magical but not childish
