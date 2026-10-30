# ToMate design system

The look is "a calm editor with a little Apple": hairline borders, soft but small radii, colours that ease rather than snap, a springy pop only for things that open, and monospace for things that are code-like. Every component uses the same tokens, defined once in `src/app.css`. Change a token and the whole app follows.

## Principles

1. **Quiet by default.** Content first, chrome second. Borders are 1px `--border`; emphasis comes from `--accent`, used sparingly.
2. **One shape language.** Four radii, used by role, never ad hoc.
3. **Motion explains, never decorates.** State changes ease over `--dur`. Only things that open (popovers, dialogs, the notch) use `--ease-spring`.
4. **Monospace means "exact".** Keys, paths, ids, numbers you might copy.
5. **Every colour is themeable.** Components never hard-code colours. Light and dark palettes define the same tokens, and users can override any of them in Settings.

## Tokens

### Shape and motion (`:root`, theme-independent)

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 5px | chips, small buttons, `kbd`, toggles |
| `--r` | 7px | buttons, inputs, list rows, segmented controls |
| `--r-lg` | 10px | cards, panels, grouped lists |
| `--r-xl` | 12px | popovers and dialogs (`.surface`) |
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | every state change |
| `--ease-spring` | `cubic-bezier(0.3, 1.18, 0.5, 1)` | opening things only |
| `--dur` | 140ms | colour, border and shadow transitions |
| `--shadow-sm` | hairline lift | selected segment, small raised controls |
| `--shadow` | soft drop | floating surfaces |
| `--font`, `--mono` | Segoe UI Variable, Cascadia Code | UI text, code-like text |

### Colour (per palette; light shown)

| Group | Tokens |
|---|---|
| Surfaces | `--bg` page, `--panel` cards, `--sidebar` sidebar and tab bar, `--canvas-bg` slide/PDF backdrop |
| Lines and text | `--border`, `--text`, `--muted`, `--bar` (tracks, empty bars) |
| Accent | `--accent`; derived automatically: `--accent-soft`, `--selection`, `--selected`, `--selected-text` |
| States | `--hover`, `--active-line`, `--danger`, `--scrim`, `--toast`, `--toast-text` |
| Code | `--code-bg`, `--code-text` |
| File kinds | `--k-md --k-pdf --k-ppt --k-xls --k-doc --k-img --k-txt` |
| Semantics | `--ev-meeting --ev-deadline --ev-other` (calendar), `--tag-idea --tag-exp --tag-decision --tag-recap` (log tags), `--focus --break --notch-bg` (timer) |

Semantic tokens default to base ones (for example `--ev-meeting: var(--accent)`), so a theme only needs the base set.

## Building blocks

- **`.surface`** (global class): the translucent floating panel, with border, `--r-xl` corners, blur and `--shadow`. Use it for menus, popovers and dialogs instead of styling your own.
- **Segmented control:** a `--hover` track with `--r` corners, and the selected item on `--panel` with `--shadow-sm`.
- **Toggle:** square-cornered (`--r-sm`). Off is `--bg` with a `--muted` knob; on is `--accent` with a white knob. No bounce.
- **Checkbox:** a 15px square with 4px corners, filling with `--accent` and a white tick.
- **Focus:** `:focus-visible` shows a 1px `--accent` outline (set globally; don't remove it).
- **Toast:** bottom centre; errors in `--danger`, stay 8 s, click to dismiss.

## Making a theme

A theme is a set of colour overrides per palette. Users make one in **Settings → Colours**, which stores it in local storage. An agent can also edit `src/app.css` to change the defaults for everyone building from source. Keep contrast: `--text` on `--bg` and white on `--accent` should both stay readable.
