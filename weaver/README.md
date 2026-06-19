Weaver - An Online Game Editor

Overview
--------
This is a compact, self-contained browser-based 2D game editor and runtime.
Open `index.html` in a modern browser (Chrome, Edge, Firefox). No server required.
The editor is designed for both beginners and advanced users:
- Beginners can drag-and-drop assets, add sprites, change background, and use simple scripts.
- Advanced users can write TypeScript or JavaScript code to control sprites and the scene.

Files
-----
- `index.html` — main UI and layout.
- `style.css` — UI styling.
- `app.js` — main application logic, project model, Pixi rendering, sandbox orchestration.
- `engine.js` — runtime glue and message schema for the sandbox iframe.
- `project-sample.json` — a small sample project you can open.
- `mini-game-editor.zip` — (if provided) ZIP export of the project.

How to use
----------
1. Open `index.html`.
2. Upload images via the image upload control. Click an asset to set it as the background.
3. Click Add Sprite to create a sprite. Select it to edit properties (position, scale, rotation, texture).
4. Upload audio files to add sounds. Sounds are listed in the project's `sounds` array.
5. Use the Code panel to edit scripts. Select a sprite and click Load Sprite Script to edit that sprite's script.
6. Choose TypeScript or JavaScript from the language dropdown. TypeScript is transpiled in-browser.
7. Click Run to start the sandboxed runtime. Click Stop to stop it.
8. Use Save to download a JSON project file. Use Export ZIP to download a ZIP with project.json and assets.

Engine API reference
--------------------
User code runs inside a sandboxed iframe and has access to a small Engine object.
The Engine API is intentionally minimal to keep the sandbox surface small.

- `Engine.log(...args)`  
  Print to the editor console.

- `Engine.onUpdate(callback)`  
  Register a callback called every frame with `dt` (seconds since last frame). Example:
  ```js
  Engine.onUpdate((dt) => {
    // dt is seconds
  });
