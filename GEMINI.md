# Gemini CLI Project Instructions

This file contains project-specific instructions, conventions, and architectural guidelines for the Gemini CLI agent. 
It helps ensure the agent maintains consistency with the established codebase patterns.

## Project Overview

**Project Name:** course-work
**Description:** A React Three Fiber 3D simulation module designed to control a ground target within an interactive physics environment. It serves as a foundational component for a future drone tracking simulator.

## Technical Stack
- **Framework:** React + Vite
- **3D Rendering:** `three`, `@react-three/fiber`
- **Helpers:** `@react-three/drei`
- **Physics Engine:** `@react-three/rapier`

## Architecture & Conventions

- **Component Structure:** The 3D scene is composed of React components under `src/components/` (e.g., `Target.jsx`, `Environment.jsx`, `Obstacles.jsx`, `CameraControls.jsx`).
- **Physics Integration:** The scene is wrapped in a Rapier `<Physics>` provider. Dynamic objects use `<RigidBody>` to interact physically.
- **Input Handling:** Keyboard controls are abstracted into a custom hook `src/hooks/useKeyboardControls.js`.
- **Styling:** Basic styling for the UI overlay and canvas container is located in `src/App.css` and `src/index.css`.
- **Formatting:** Standard JavaScript ES6+ conventions.

## Common Workflows
- **Development Server:** Run `npm run dev` to start the Vite development server.
- **Building:** Run `npm run build` to create a production build.
