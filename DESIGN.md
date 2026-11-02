# DESIGN.md: LLM Hardware Matcher

Direction: **the spec board.** The tool is about the parts inside someone's PC, so it borrows the look of the
thing those parts live on: a circuit board. The hardware form is a solder-mask green board with silkscreen
labels (CPU, GPU, RAM) in the order the parts are filled in. Results sit on plain paper below it.
The one bold element is the **writer**: a strip that streams text at the estimated tokens/sec for the chosen
model, so "35 tok/s" becomes something you can feel. Everything else stays quiet.

(No reference sites were compared: the UXKIN library was unavailable when this was written.)

## Color

| Token | Value | Role |
| --- | --- | --- |
| `board` | `#0F3D33` | Hardware board background; primary buttons; the text colour on paper headings |
| `board-raised` | `#16503F` | Inputs and hover states on the board |
| `silk` | `#EAF0E6` | Silkscreen text and outlines on the board |
| `silk-dim` | `#A9C2B4` | Secondary text on the board (≥4.5:1 on `board`) |
| `gold` | `#D2AE4E` | Pad gold: focus rings on the board, the selected state, the writer cursor. Never text on paper |
| `paper` | `#EEF2ED` | Page background |
| `sheet` | `#FAFBF8` | Result rows, the writer strip |
| `ink` | `#1C2B26` | Body text on paper |
| `muted` | `#566A61` | Secondary text on paper (≥4.5:1 on `sheet`) |
| `rule` | `#D3DCD5` | Dividers and input borders on paper |
| `lead` | `#0F3D33` | Headings, links and selected tabs on paper |
| `focus` | `#0F3D33` | Focus ring on paper (gold is used on the board) |

Speed verdicts (text, ruler marks and the left edge of each row):
`instant #1E7A55`, `comfortable #2C6E9E`, `usable #8A5F00`, `slow #B03A2E`, `nofit #7D8A84`.

### Dark theme

Follows the system setting; the header's Theme switch (System / Light / Dark) overrides it per browser.
The board stays green but lifts slightly so it still reads as a separate surface on the dark page.

| Token | Dark value |
| --- | --- |
| `paper` / `sheet` | `#14231E` / `#1B2D27` |
| `board` / `board-raised` | `#18493C` / `#215B4B` |
| `ink` / `muted` / `rule` | `#E3EBE5` / `#9FB4AA` / `#2D453D` |
| `lead` | `#8ED3B4` (mint: green text would vanish on a dark page) |
| `gold` / `focus` | `#D9B85C` / `#D9B85C` |
| Verdicts | `instant #5DC79A`, `comfortable #73B4E6`, `usable #E0B144`, `slow #F08372`, `nofit #8F9D96` |

Every text pair passes 4.5:1 (verdict marks and large figures 3:1) in both themes.

## Typography

One family, **Archivo** (variable, with weight and width axes). Width carries the personality:

| Use | Size / line | Width | Weight |
| --- | --- | --- | --- |
| Page title | 40 / 44 (28 / 32 mobile) | 125 (expanded) | 800 |
| Section heading | 22 / 28 | 112 | 700 |
| Speed figure (tok/s) | 28 / 28 | 125 | 750, tabular numbers |
| Body | 16 / 24 | 100 | 400 |
| Small / meta | 14 / 20 | 100 | 400–500 |
| Table data | 14 / 20 | 88 (semi-condensed) | 450 |
| Silkscreen labels | 13 / 16 | 125 | 700, outlined box, the part's real acronym |

Sentence case everywhere. No all-caps labels, no single-word accent colours in headings.
Commands such as `ollama run …` use the system monospace font. Nothing else does.

## Spacing and layout

4px base: 4, 8, 12, 16, 24, 32, 48, 64. Content width is 1100px with 16px side gutters on mobile.
Everything is left aligned. Sections are separated by 48px of space, not by boxes.

## Shape and depth

- The board: 14px radius with a 1px `silk` outline inset 6px (the board edge). It is the only rounded container.
- Inputs and buttons: 4px radius.
- Result rows: no radius. A 4px verdict-coloured left edge, separated by `rule`.
- No shadows.

## Components

- **Primary button:** `board` background, `silk` text. Hover uses `board-raised`; focus gets a 2px `gold` ring.
- **Secondary button:** transparent with a 1px `board` border.
- **Toggle chips** (use cases): text with a 2px underline in `board` when selected; muted when not.
- **Inputs on the board:** `board-raised` background, `silk` text and a `silk-dim` border. Focus gets a `gold` ring.
- **Speed ruler:** a log scale from 1 to 300 tok/s, with ticks at 5, 10 and 30 (the verdict thresholds) and a marker
  at the estimate. An estimate's ± range is drawn as a band, a measured value as a solid diamond.
- **Writer:** a sheet strip with the model name, the speed figure and streamed sample text with a gold block cursor.
  Under `prefers-reduced-motion` it shows the finished text and the words-per-minute equivalent instead.

## Imagery and icons

No icons or illustrations. Structure comes from the board outline, silkscreen labels and the ruler.

## Motion

Only the writer streams text, and only because that is the information. A row expanding is the one other motion.
