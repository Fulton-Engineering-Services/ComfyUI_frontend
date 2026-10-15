# ADR-THEME-TOKENS-0044: Palettes Own a Small Theme Token Set

Date: 2026-10-15

## Status

Proposed

## Context

After PrimeVue left, `packages/design-system/src/css/style.css` still had 409
custom properties. Light and dark were two hand-mirrored blocks, and a
`.dark-theme` class on `<html>` picked between them. Eighteen files branched on
the palette's `light_theme` flag. The arc, github, nord and solarized palettes
only set the old `comfy_base` variables (`--comfy-menu-bg`, `--fg-color`, and
so on), so every design-system surface stayed charcoal inside them.

A theme author had to know about 101 component tokens per mode. Most were
hover, selected or disabled shades of a handful of colors.

## Decision

A palette is the only thing that changes the theme. It sets 16 values in
`colors.theme`:

| Group      | Tokens                                                         |
| ---------- | -------------------------------------------------------------- |
| Surfaces   | `background`, `card`, `secondary`, `muted`, `accent`           |
| Text       | `foreground`, `muted-foreground`                               |
| Roles      | `primary`, `destructive`, `warning`                            |
| Lines      | `border`, `ring`                                               |
| Node layer | `node-foreground`, `node-header`, `node-border`, `node-shadow` |

Five more are optional and default when absent: `popover` (`background`),
`input` (`accent`), `node` (`card`), `warning-foreground` and `success`.

The names follow shadcn/ui, so themes made with tools such as tweakcn map onto
them directly. The node layer exists because graph nodes sit on the canvas and
need their own contrast.

- `:root` holds the dark theme. `applyPaletteTheme` writes the active palette's
  values inline on `<html>`. There is no `.dark-theme` class, and components
  read tokens instead of `light_theme`. Code that must know the mode (Turnstile,
  media previews, node tinting) reads `colorPaletteStore.colorScheme`.
- A palette without `colors.theme` gets one derived from its `comfy_base` and
  `litegraph_base` colors, so older and custom palettes restyle the whole app.
- Interaction states use a core token with opacity (`secondary/80`,
  `primary/90`, `border/50`) or `accent` and `muted`. They do not get tokens of
  their own.
- `error` and `danger-*` fold into `destructive`.
- Text color and size go on the element that owns them (`body`, the node root,
  widget hosts) and inherit. Tailwind preflight stays off, so form controls
  still set their own.
- The old palette variables live in `_legacy-palette.css`. Six renamed
  variables that custom nodes use stay in `_deprecated-aliases.css`. Both are
  separate imports so they can be deleted on their own.

## Consequences

- A theme author writes 16 values. `dark.json` and `light.json` are the
  reference.
- Adding a token touches the schema, both core palettes, the `:root` defaults,
  the `@theme inline` mapping and the legacy derivation.
- Derived palettes still take `primary`, `destructive`, `ring` and `warning`
  from the dark theme, because `comfy_base` has no equivalent.
- Custom nodes that read a removed variable outside the six aliases lose that
  color.
- The `dark:` variant and `--p-*` variables stay banned. When a component needs
  a different color per mode, it gets a token instead.

## Alternatives considered

- Keep the component tokens and only delete the dead ones. That still leaves
  two mirrored blocks and about 100 names per mode.
- Use CSS `light-dark()` for each token. It removes the class but keeps two
  values per token in the stylesheet, and palettes other than light and dark
  still cannot change them.
