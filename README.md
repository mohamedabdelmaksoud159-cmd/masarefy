# مصاريفي (Masarefy)

A small personal expense tracker for Arabic speakers. Works in the browser and can be added to the home screen.

- Type or speak an expense in Arabic, e.g. "صرفت ٨٠ مواصلات و١٢٠ أكل", review it, then save.
- Daily, weekly (week starts Saturday) and monthly totals, with category breakdown and browsing of past periods.
- Data stays on your device (IndexedDB). Nothing is sent to a server by this app.
- Export a JSON backup or a CSV for Excel, and restore a backup. Back up regularly: clearing browser data or changing phone loses the data.
- Voice uses the browser's built-in speech recognition. Support depends on the browser, it needs internet, and the browser vendor may process the audio.

No tracking, no accounts, no analytics. Static files only: `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`.
