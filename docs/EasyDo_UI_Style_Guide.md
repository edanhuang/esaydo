# EasyDo UI Style Guide

EasyDo is a keyboard-first todo and worklog app.

The UI style should match the EasyDo logo: a minimalist anime-inspired snapping hand icon on a deep navy background, with cream-white shapes, soft lavender shadows, and a small golden sparkle.

The product feeling should be:

- calm but powerful
- magical but not childish
- productivity-focused but not corporate
- polished like a modern macOS app
- lightweight, clean, and elegant
- slightly anime-inspired through softness and expression, not through heavy decoration

## Core Design Direction

Use a dark-first interface inspired by the logo.

The main background should be a deep navy / midnight purple tone. Cards and panels should use slightly lighter navy surfaces. Primary text should use warm off-white instead of pure white. Accent actions should use a soft golden yellow, inspired by the sparkle in the logo. Secondary highlights and shadows can use lavender / soft purple, inspired by the hand shading in the logo.

Avoid:

- generic SaaS blue
- pure black and pure white
- heavy gradients
- excessive glassmorphism
- neon cyberpunk
- overly playful cartoon UI

The UI should feel like:

> One snap, tasks are handled.

## Keywords

Use these words to guide the visual direction:

- calm
- focus
- magical
- lightweight
- anime-inspired
- macOS polished
- elegant productivity
- soft glow
- deep navy
- golden sparkle
- lavender shadow
- warm cream

## Color Palette

Use these colors as design tokens:

```ts
export const easyDoTheme = {
  colors: {
    // Core backgrounds
    background: "#090B1F",        // deep midnight navy
    backgroundSoft: "#10132D",    // main app surface
    surface: "#171A3A",           // cards, panels
    surfaceHover: "#202449",      // hover state
    surfaceActive: "#2A2E5A",     // selected / active item

    // Text
    textPrimary: "#FFF8E8",       // warm cream white
    textSecondary: "#C9C4E8",     // soft lavender gray
    textMuted: "#8581A8",         // muted purple gray
    textDisabled: "#5A5775",

    // Brand accents
    primary: "#FFD966",           // golden sparkle
    primaryHover: "#FFE58A",
    primaryActive: "#E9BD3E",

    // Secondary accents
    lavender: "#B9A7FF",          // soft anime shadow purple
    lavenderSoft: "#D8CCFF",
    violet: "#7C6EE6",

    // Semantic colors, keep them soft and harmonious
    success: "#8FE6B0",
    warning: "#FFD166",
    danger: "#FF8F9C",
    info: "#91C8FF",

    // Borders and dividers
    border: "#2B2F55",
    borderSoft: "#1F2343",

    // Input
    inputBackground: "#11142B",
    inputBorder: "#30345F",
    inputFocus: "#FFD966",

    // Shadows
    shadowColor: "rgba(4, 5, 18, 0.55)",
    glowGold: "rgba(255, 217, 102, 0.28)",
    glowLavender: "rgba(185, 167, 255, 0.22)"
  }
}
```

## Tailwind Theme Suggestion

If using Tailwind, extend the theme like this:

```ts
theme: {
  extend: {
    colors: {
      easydo: {
        bg: "#090B1F",
        bgSoft: "#10132D",
        surface: "#171A3A",
        surfaceHover: "#202449",
        surfaceActive: "#2A2E5A",

        cream: "#FFF8E8",
        text: "#FFF8E8",
        textSecondary: "#C9C4E8",
        textMuted: "#8581A8",

        gold: "#FFD966",
        goldHover: "#FFE58A",
        goldActive: "#E9BD3E",

        lavender: "#B9A7FF",
        lavenderSoft: "#D8CCFF",
        violet: "#7C6EE6",

        border: "#2B2F55",
        borderSoft: "#1F2343",

        success: "#8FE6B0",
        warning: "#FFD166",
        danger: "#FF8F9C",
        info: "#91C8FF"
      }
    },
    boxShadow: {
      "easydo-card": "0 16px 40px rgba(4, 5, 18, 0.38)",
      "easydo-glow": "0 0 24px rgba(255, 217, 102, 0.22)",
      "easydo-lavender": "0 0 28px rgba(185, 167, 255, 0.18)"
    },
    borderRadius: {
      "easydo": "18px",
      "easydo-lg": "24px",
      "easydo-xl": "32px"
    }
  }
}
```

## shadcn/ui Theme Mapping

Use dark mode as the primary theme.

Customize shadcn/ui variables instead of using the default neutral palette.

```css
:root {
  --background: 235 55% 8%;
  --foreground: 42 100% 95%;

  --card: 236 43% 16%;
  --card-foreground: 42 100% 95%;

  --popover: 236 43% 16%;
  --popover-foreground: 42 100% 95%;

  --primary: 45 100% 70%;
  --primary-foreground: 235 55% 8%;

  --secondary: 240 37% 24%;
  --secondary-foreground: 250 45% 86%;

  --muted: 238 32% 22%;
  --muted-foreground: 246 22% 58%;

  --accent: 252 100% 83%;
  --accent-foreground: 235 55% 8%;

  --destructive: 354 100% 78%;
  --destructive-foreground: 235 55% 8%;

  --border: 235 33% 25%;
  --input: 235 33% 25%;
  --ring: 45 100% 70%;

  --radius: 1rem;
}
```

## App Layout

The app should use a dark macOS-like layout.

Recommended layout direction:

- Left sidebar: deep navy surface
- Main board area: slightly darker background
- Todo cards: soft rounded rectangles
- Active item: subtle lavender or gold glow
- Completed item: visually quiet, not bright green
- Important actions: gold accent
- Secondary actions: lavender accent

Use large comfortable spacing.

Recommended border radius:

- Small controls: 10px–12px
- Todo cards: 16px–20px
- Panels / modals: 24px–28px

## Todo Cards

Todo cards should feel calm and tactile.

Default card:

```css
background: #171A3A;
border: 1px solid #2B2F55;
color: #FFF8E8;
border-radius: 18px;
box-shadow: 0 12px 30px rgba(4, 5, 18, 0.32);
```

Hover card:

```css
background: #202449;
border-color: rgba(255, 217, 102, 0.32);
transform: translateY(-1px);
```

Selected card:

```css
background: #202449;
border-color: #FFD966;
box-shadow:
  0 0 0 1px rgba(255, 217, 102, 0.35),
  0 0 24px rgba(255, 217, 102, 0.18);
```

Completed todo:

```css
opacity: 0.58;
text-decoration: line-through;
color: #8581A8;
```

## Buttons

Primary buttons should use the golden sparkle color.

```css
background: #FFD966;
color: #090B1F;
border-radius: 14px;
font-weight: 600;
```

Hover:

```css
background: #FFE58A;
box-shadow: 0 0 20px rgba(255, 217, 102, 0.25);
```

Secondary buttons should be dark with lavender or soft border:

```css
background: #171A3A;
color: #C9C4E8;
border: 1px solid #2B2F55;
```

## Inputs

Inputs should feel quiet and focused.

```css
background: #11142B;
border: 1px solid #30345F;
color: #FFF8E8;
border-radius: 14px;
```

Focus state:

```css
border-color: #FFD966;
box-shadow: 0 0 0 3px rgba(255, 217, 102, 0.16);
```

Placeholder:

```css
color: #8581A8;
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

- App title: 22–26px, 650 weight
- Section title: 16–18px, 600 weight
- Todo title/detail: 14–16px, 500 weight
- Metadata: 12–13px, muted lavender gray
- Shortcut hints: 11–12px, monospace or rounded pill style

Text should be clear, calm, and readable.

## Icon Style

Icons should match the logo style:

- simple line icons
- rounded stroke caps
- minimal detail
- 1.75px–2px stroke width
- cream or lavender by default
- gold only for primary/highlight actions

Avoid:

- sharp technical icons
- overly detailed icons
- colorful icon sets
- heavy outlined cartoon icons

## Micro-interactions

Animations should be subtle and elegant.

Use:

- 120–180ms transitions
- slight scale or translate on hover
- soft glow when completing a task
- tiny sparkle animation when a todo is completed, but keep it rare and minimal

Do not overuse animation. The UI should feel responsive, not distracting.

Suggested transition:

```css
transition:
  background-color 160ms ease,
  border-color 160ms ease,
  box-shadow 160ms ease,
  transform 120ms ease;
```

Completion interaction idea:

When the user completes a todo with a keyboard shortcut, briefly show a tiny gold sparkle near the card or checkbox, inspired by the logo.

## Component Implementation Guidance

Before implementing business features, first create the EasyDo visual system:

1. Tailwind theme tokens
2. shadcn/ui theme variables
3. AppShell layout
4. Button/Card/Input/TodoCard base components
5. One demo page showing the final visual direction

This prevents the app from accidentally falling back into the default gray/white shadcn style.

## Recommended Initial Components

Create the following base components first:

- `AppShell`
- `Sidebar`
- `TopCommandBar`
- `TodoCard`
- `TodoColumn`
- `PrimaryButton`
- `SecondaryButton`
- `ShortcutHint`
- `TagPill`
- `EmptyState`
- `GlowFocusRing`

## Example UI Prompt for Coding AI

Use the following instruction when asking a coding AI to implement the interface:

```md
Implement the EasyDo UI using the visual style defined in this document.

The UI must match the logo direction: deep midnight navy background, warm cream text, golden sparkle primary accent, soft lavender secondary accent, rounded macOS-like surfaces, and minimalist anime-inspired softness.

Do not use default shadcn gray styling. Do not use generic SaaS blue. Do not use pure black or pure white.

Start by creating the theme tokens and base UI components before implementing business features.

Create a demo page showing:
- sidebar
- todo board
- selected todo card
- completed todo card
- command input
- primary and secondary buttons
- shortcut hints
- a subtle gold sparkle completion effect
```

## Overall Rule

Every UI decision should answer this question:

> Does this feel like the EasyDo logo became an app?

The answer should be yes:

- dark navy
- cream white
- gold sparkle
- soft lavender shadow
- clean anime-inspired simplicity
- polished macOS productivity feeling
