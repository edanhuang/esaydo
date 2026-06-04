# EasyDo

Local-first Todo + Weekly Worklog desktop MVP.

## Prerequisites

- macOS
- Node.js 20 recommended
  - Install with nvm, Volta, asdf, or your system package manager.
  - `node -v` should report `v20.x`.
- npm
- Rust and Cargo
  - Required by Tauri.
  - If not installed, install through Homebrew before running the Tauri app.
- Tauri CLI
  - Provided by the project dev dependency `@tauri-apps/cli`.

## Recommended Node Version

Use Node 20 before installing dependencies or running local commands:

```bash
nvm use 20
node -v
npm -v
cargo --version
```

## Install

```bash
npm install
```

## Local Development

Run the Vite frontend only:

```bash
npm run dev
```

Run the desktop app through Tauri:

```bash
npm run tauri:dev
```

## Checks

Type-check the frontend:

```bash
npm run check
```

Build the frontend:

```bash
npm run build
```

## OpenSpec

The first-phase MVP change is tracked at:

```text
openspec/changes/implement-first-phase-mvp
```

Use `/opsx:apply` for the implementation phase.
