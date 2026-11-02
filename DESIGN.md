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
| `gold` | `#D2AE4E` | Pad gold: focus rings, the selected state, the writer cursor. Never body text on paper |
| `paper` | `#EEF2ED` | Page background |
| `sheet` | `#FAFBF8` | Result rows, the writer strip |
| `ink` | `#1C2B26` | Body text on paper |
| `muted` | `#566A61` | Secondary text on paper (≥4.5:1 on `sheet`) |
| `rule` | `#D3DCD5` | Dividers and input borders on paper |

Speed verdicts (text, ruler marks and the left edge of each row):
`instant #1E7A55`, `comfortable #2C6E9E`, `usable #9A6B05`, `slow #B03A2E`, `nofit #7D8A84`.

Light only, on purpose: the board already supplies the dark surface, and data reads best on paper.

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
