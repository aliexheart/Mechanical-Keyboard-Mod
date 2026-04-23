# ThockBoard — Desktop App

Real mechanical keyboard sounds for your Mac. System-wide — plays in every app.

## Setup (5 minutes)

### Step 1 — Install Node.js
Download and install from https://nodejs.org (click the "LTS" button).
You only need to do this once.

### Step 2 — Open Terminal in this folder
Right-click the `thockboard-app` folder → "New Terminal at Folder"
(or open Terminal and type: `cd ` then drag the folder into the window)

### Step 3 — Install dependencies
```
npm install
npm install uiohook-napi
```
This downloads Electron (~100MB) and the global key capture library.
Takes 1-2 minutes the first time.

### Step 4 — Run it
```
npm start
```

ThockBoard opens. Click "Start typing" to unlock audio, then type anywhere —
in VS Code, Safari, Slack, anywhere — and you'll hear the switch sounds.

---

## Grant Accessibility Permission (first run only)

macOS will show a popup asking for Accessibility access. Click "Open System Settings",
then toggle ThockBoard (or "Electron") ON in the list.

If you don't see a popup:
  System Settings → Privacy & Security → Accessibility → add the app manually.

Without this, sound only plays while the ThockBoard window is focused.

---

## Usage

- **Switch selector** — left sidebar, click any switch to change
- **Volume** — slider at the bottom of the sidebar  
- **Enable/disable** — toggle in the top-right corner
- **Close the window** — app keeps running in the menu bar (click the icon to reopen)
- **Quit fully** — click the menu bar icon → Quit

---

## Switches included

| Switch | Character |
|---|---|
| NovelKeys Creams | Linear · Creamy · Thocky |
| Holy Pandas | Tactile · Snappy · Popular |
| Cherry MX Blues | Clicky · Sharp · Classic |
| Cherry MX Browns | Tactile · Balanced · Familiar |
| Cherry MX Blacks | Linear · Smooth · Quiet |
| Gateron Black Inks | Linear · Deep · Premium |
| Gateron Red Inks | Linear · Smooth · Muted |
| Turquoise Tealios | Linear · Smooth · Premium |
| Alpacas | Linear · Smooth · Clean |
| Kailh Box Navies | Clicky · Loud · Thick |
| SKCM Blue Alps | Clicky · Vintage · Crisp |
| Buckling Spring | Clicky · IBM · Loud |
| Topre | Electrocapacitive · Soft · Thock |

Sound samples from kbsim by Thomas Lai (MIT): https://github.com/tplai/kbsim

---

## Also works as a plain web page

Just open `thockboard.html` directly in Chrome/Safari/Firefox — no Node needed.
Sound only plays while that browser tab is focused (browser limitation).
