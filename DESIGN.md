# SafeTap interface direction

The interface is a campus operations tool. Use quiet surfaces, strong readable text, and a clear primary action rather than decorative effects.

## Visual system

- Locally served Open Sans, regular/semibold/bold. Source Sans 3 was proposed but could not be fetched in this environment; Open Sans is available locally and includes its license under `public/assets/fonts/`.
- Navy text `#1a2c40`, muted text `#526277`, off-white canvas `#f4f6f8`, white sections, restrained blue actions `#2158b4`.
- Green `#14634c` for confirmed arrivals, amber `#86510d` for missing/pending states, red `#ad3542` for errors. Pair color with text.
- One consistent SVG stroke icon set, subtle borders, 12px section corners, generous spacing, no decorative gradients or movement.
- Four totals in a single strip: still missing, arrived safely, expected students, other arrivals.

## Interaction

Appearance can be switched from the login page or main header using the sun/moon SVG control. First use follows the device's color preference; an explicit light/dark choice is saved locally. Switching appearance must not rerender the scanner or interrupt NFC. Dark mode uses canvas `#101923`, sections `#182432`, text `#e7edf6`, and muted text `#adbdd0`. Print reports retain white paper styling.

Use the shared SVG icon set for navigation, section titles, and meaningful actions such as add, edit, refresh, download, print, and capture. Icons support text labels and must not replace accessible names.

ID photo has distinct **Choose file** and **Take photo** buttons. File selection has no camera capture hint; taking a photo uses the environment-camera capture hint on supported phones. Both inputs use the same on-device recognition and student confirmation flow.

Desktop uses a sidebar; phones use a fixed four-item bottom navigation with safe-area padding. Tables and the schematic scroll inside their containers. Forms use at least 16px input text on phones; main controls have at least 44px height. Visible keyboard focus, a skip link, labelled dialogs, live scan feedback, and reduced-motion support are required.

NFC remains visible regardless of feature availability. Start/stop controls expose reader state. Leaving the scanner or changing methods aborts the NFC reader. Saved scans survive reload through the existing IndexedDB queue, and normalized NFC IDs resolve students in the downloaded list.

## Design guidance provenance

The redesign used published Impeccable operate/craft guidance from `pbakaus/impeccable` as a manual reference. GitHub access from the CLI failed, so the skill was not installed and its automated detector was not run. Do not describe this revision as detector certified.
