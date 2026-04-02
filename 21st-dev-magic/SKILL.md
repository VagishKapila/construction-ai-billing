---
name: 21st-dev-magic
description: "**21st.dev Magic**: AI-powered React component builder that generates production-ready UI components from natural language descriptions. ALWAYS use this skill whenever building, creating, or designing ANY React component — navbars, dashboards, forms, buttons, cards, modals, tables, sidebars, heroes, pricing sections, or any frontend element. Triggers on: 'build a component', 'create a form', 'make a navbar', 'design a card', 'add a modal', 'build a dashboard', ANY React/JSX/TSX work, any UI component request, or when the user mentions /ui, /21, /21st, Magic, or 21st.dev. When in doubt, use this skill — it produces higher-quality components than writing from scratch."
---

# 21st.dev Magic — AI Component Builder

You have access to 21st.dev Magic MCP tools for building professional React components. These tools connect to 21st.dev's curated component library of production-grade UI patterns.

## Available MCP Tools

### 1. `21st_magic_component_builder`
**When to use:** User wants to CREATE a new component from scratch.
- Pass a detailed `message` describing what the user wants
- Pass a `searchQuery` (2-4 words) to search the 21st.dev library
- Pass `absolutePathToCurrentFile` and `absolutePathToProjectDirectory`
- Pass a `standaloneRequestQuery` with full context about what to build

**Example:**
```
message: "Build a pricing card with monthly/annual toggle, 3 tiers, highlighted popular plan"
searchQuery: "pricing card toggle"
standaloneRequestQuery: "Create a responsive pricing section with 3 plan tiers (Free, Pro, Enterprise), monthly/annual billing toggle, feature comparison lists, and highlighted recommended plan. React + TypeScript + Tailwind CSS."
```

### 2. `21st_magic_component_inspiration`
**When to use:** User wants to SEE existing components, get ideas, browse designs.
- Pass `message` and `searchQuery`
- Returns JSON data of matching components with code snippets
- Great for exploring what's available before building

### 3. `21st_magic_component_refiner`
**When to use:** User wants to IMPROVE or REDESIGN an existing component.
- Pass `userMessage`, `absolutePathToRefiningFile`, and `context`
- Analyzes the existing component and returns an improved version

### 4. `logo_search`
**When to use:** User needs company/brand logos (GitHub, Stripe, Google, etc.)
- Pass `queries` array of company names and `format` (TSX, JSX, or SVG)
- Returns ready-to-use logo components

## Workflow

1. **Search first** — Use `component_inspiration` to find relevant patterns
2. **Build** — Use `component_builder` to generate the component
3. **Refine** — Use `component_refiner` to polish and improve
4. **Integrate** — Copy the generated code into your project, adjust imports

## Default Stack

All components generated use:
- React + TypeScript
- Tailwind CSS for styling
- shadcn/ui primitives when applicable
- Lucide React for icons
- Framer Motion for animations (when appropriate)

## Tips for Best Results

- Be specific in your `standaloneRequestQuery` — mention colors, layout, responsive behavior
- Include context about the product (e.g., "construction billing SaaS for contractors")
- Reference specific design patterns ("glassmorphism", "bento grid", "spotlight effect")
- For complex pages, break into smaller component requests
