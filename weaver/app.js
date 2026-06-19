/* app.js
   Main application logic for the mini game editor.
   Uses PixiJS for rendering, CodeMirror for editing, JSZip/FileSaver for export.
*/

/* -------------------------
   Utilities
   ------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const uid = (prefix='id') => prefix + '_' + Math.random().toString(36).slice(2,9);

/* -------------------------
   Project model
   ------------------------- */
let project = {
  metadata: { name: "Untitled Project", created: Date.now() },
  assets: [], // {id,name,type,dataURL}
  sprites: [], // {id,name,x,y,scale,rotation,textureAssetId,scriptId}
  scripts: [], // {id,name,language,code}
  sounds: [], // {id,name,assetId}
  backgroundAssetId: null,
  volume: 1,
  paused: false
};

let selectedSpriteId = null;
let appPixi = null;
let pixiStage = null;
let spriteMap = new Map(); // spriteId -> PIXI.Sprite
let editor = null;
let currentScriptId = null;
let sandboxIframe = null;
let sandboxReady = false;

/* -------------------------
   Init UI
   ------------------------- */
function initUI(){
  // Buttons
  $('#btnNew').onclick = newProject;
  $('#btnOpen').onclick = () => $('#fileOpen').click();
  $('#fileOpen').onchange = handleOpenFile;
  $('#btnSave').onclick = saveProjectFile;
  $('#btnExport').onclick = exportZip;
  $('#btnAddSprite').onclick = addSprite;
  $('#imgUpload').onchange = handleImageUpload;
  $('#audioUpload').onchange = handleAudioUpload;
  $('#btnRun').onclick = runProject;
  $('#btnStop').onclick = stopProject;
  $('#btnClearConsole').onclick = () => { $('#consoleOutput').innerHTML = ''; };
  $('#masterVolume').oninput = (e) => { project.volume = parseFloat(e.target.value); broadcastToSandbox({type:'setVolume',value:project.volume}); };

  // Sprite props
  $('#propX').oninput = updateSelectedSpriteProps;
  $('#propY').oninput = updateSelectedSpriteProps;
  $('#propScale').oninput = updateSelectedSpriteProps;
  $('#propRotation').oninput = updateSelectedSpriteProps;
  $('#propName').oninput = updateSelectedSpriteProps;
  $('#propTexture').onchange = updateSelectedSpriteProps;
  $('#btnDeleteSprite').onclick = deleteSelectedSprite;
  $('#btnLoadSpriteScript').onclick = loadSpriteScript;
  $('#btnSaveScript').onclick = saveScriptFromEditor;

  // CodeMirror editor (basic)
  const {EditorView, basicSetup} = window["@codemirror/basic-setup"];
  const {javascript} = window["@codemirror/lang-javascript"];
  const {EditorState} = window["@codemirror/state"];

  editor = new EditorView({
    state: EditorState.create({
      doc: `// Welcome to Mini Game Editor\n// Select a sprite and click Load Sprite Script to edit its script.\n// Use Engine.log(...) to print to the console.\n\nEngine.onUpdate((dt) => {\n  // dt is seconds since last frame\n});\n`,
      extensions: [basicSetup, javascript()]
    }),
    parent: document.getElementById('editor')
  });

  // Stage (Pixi)
  const stageContainer = document.getElementById('stageContainer');
  appPixi = new PIXI.Application({backgroundAlpha:0, resizeTo: stageContainer, antialias:true});
  stageContainer.appendChild(appPixi.view);
  pixiStage = appPixi.stage;

  // Dragging support
  let dragging = null;
  appPixi.view.addEventListener('pointerdown', (e) => {
    const pos = appPixi.renderer.plugins.interaction.mapPositionToPoint(new PIXI.Point(), e.clientX, e.clientY);
    for (let s of project.sprites.slice().reverse()){
      const sprite = spriteMap.get(s.id);
      if (!sprite) continue;
      const bounds = sprite.getBounds();
      if (pos.x >= bounds.x && pos.x <= bounds.x + bounds.width && pos.y >= bounds.y && pos.y <= bounds.y + bounds.height){
        dragging = {id: s.id, offsetX: pos.x - sprite.x, offsetY: pos.y - sprite.y};
        selectSprite(s.id);
        break;
      }
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const pos = appPixi.renderer.plugins.interaction.mapPositionToPoint(new PIXI.Point(), e.clientX, e.clientY);
    const s = project.sprites.find(x => x.id === dragging.id);
    if (!s) return;
    s.x = pos.x - dragging.offsetX;
    s.y = pos.y - dragging.offsetY;
    updateSpriteInView(s);
    updatePropsPanel();
  });
  window.addEventListener('pointerup', () => dragging = null);

  // initial sample
  loadSampleProject();
}

/* -------------------------
   Project persistence
   ------------------------- */
function newProject(){
  project = {
    metadata: { name: "Untitled Project", created: Date.now() },
    assets: [],
    sprites: [],
    scripts: [],
    sounds: [],
    backgroundAssetId: null,
    volume: 1,
    paused: false
  };
  selectedSpriteId = null;
  currentScriptId = null;
  refreshAssetsList();
  rebuildStage();
  logConsole("New project created.");
}

function saveProjectFile(){
  const blob = new Blob([JSON.stringify(project, null, 2)], {type:'application/json'});
  saveAs(blob, (project.metadata.name || 'project') + '.json');
  logConsole("Project saved to file.");
}

function handleOpenFile(e){
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      project = data;
      refreshAssetsList();
      rebuildStage();
      logConsole("Project loaded.");
    } catch(err){
      logConsole("Error loading project: " + err.message);
    }
  };
  reader.readAsText(f);
  e.target.value = '';
}

async function exportZip(){
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(project, null, 2));
  // add assets as files
  const assetsFolder = zip.folder('assets');
  project.assets.forEach(a => {
    // dataURL -> binary
    const parts = a.dataURL.split(',');
    const meta = parts[0];
    const data = parts[1];
    const mime = meta.match(/data:(.*);base64/)[1];
    const ext = mime.split('/')[1].split('+')[0];
    assetsFolder.file(`${a.id}.${ext}`, data, {base64:true});
  });
  const content = await zip.generateAsync({type:'blob'});
  saveAs(content, (project.metadata.name || 'project') + '.zip');
  logConsole("Exported ZIP.");
}

/* -------------------------
   Assets handling
   ------------------------- */
function handleImageUpload(e){
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const id = uid('asset');
    project.assets.push({id, name: f.name, type:'image', dataURL: reader.result});
    refreshAssetsList();
    logConsole(`Image uploaded: ${f.name}`);
  };
  reader.readAsDataURL(f);
  e.target.value = '';
}

function handleAudioUpload(e){
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const id = uid('asset');
    project.assets.push({id, name: f.name, type:'audio', dataURL: reader.result});
    project.sounds.push({id: uid('sound'), name: f.name, assetId: id});
    refreshAssetsList();
    logConsole(`Audio uploaded: ${f.name}`);
  };
  reader.readAsDataURL(f);
  e.target.value = '';
}

function refreshAssetsList(){
  const list = $('#assetsList');
  list.innerHTML = '';
  project.assets.forEach(a => {
    const div = document.createElement('div');
    div.className = 'asset-item';
    const thumb = document.createElement('img');
    thumb.src = a.dataURL;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<div><strong>${a.name}</strong></div><div>${a.type}</div>`;
    div.appendChild(thumb);
    div.appendChild(meta);
    div.onclick = () => {
      if (a.type === 'image'){
        project.backgroundAssetId = a.id;
        rebuildStage();
        logConsole(`Background set to ${a.name}`);
      }
    };
    list.appendChild(div);
  });

  // update texture select
  const sel = $('#propTexture');
  sel.innerHTML = '';
  project.assets.filter(a => a.type === 'image').forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    sel.appendChild(opt);
  });
}

/* -------------------------
   Sprites
   ------------------------- */
function addSprite(){
  const placeholder = project.assets.find(a => a.type === 'image') || null;
  const textureId = placeholder ? placeholder.id : null;
  const id = uid('sprite');
  const sprite = { id, name: 'Sprite ' + (project.sprites.length+1), x: 100, y: 100, scale: 1, rotation: 0, textureAssetId: textureId, scriptId: null };
  project.sprites.push(sprite);
  // create default script
  const scriptId = uid('script');
  const code = `// Script for ${sprite.name}\nEngine.onUpdate((dt) => {\n  // example: move right\n  const s = Engine.getSprite('${sprite.name}');\n  if (s) s.x += 30 * dt;\n});\n`;
  project.scripts.push({id: scriptId, name: sprite.name + ' script', language: 'js', code});
  sprite.scriptId = scriptId;
  refreshAssetsList();
  rebuildStage();
  selectSprite(id);
  logConsole('Sprite added.');
}

function selectSprite(id){
  selectedSpriteId = id;
  updatePropsPanel();
}

function updatePropsPanel(){
  const s = project.sprites.find(x => x.id === selectedSpriteId);
  if (!s){
    $('#spriteProps').style.opacity = 0.6;
    $('#propName').value = '';
    $('#propX').value = '';
    $('#propY').value = '';
    $('#propScale').value = '';
    $('#propRotation').value = '';
    $('#propTexture').value = '';
    return;
  }
  $('#spriteProps').style.opacity = 1;
  $('#propName').value = s.name;
  $('#propX').value = Math.round(s.x);
  $('#propY').value = Math.round(s.y);
  $('#propScale').value = s.scale;
  $('#propRotation').value = s.rotation;
  $('#propTexture').value = s.textureAssetId || '';
}

function updateSelectedSpriteProps(){
  const s = project.sprites.find(x => x.id === selectedSpriteId);
  if (!s) return;
  s.name = $('#propName').value;
  s.x = parseFloat($('#propX').value) || 0;
  s.y = parseFloat($('#propY').value) || 0;
  s.scale = parseFloat($('#propScale').value) || 1;
  s.rotation = parseFloat($('#propRotation').value) || 0;
  s.textureAssetId = $('#propTexture').value || null;
  updateSpriteInView(s);
  refreshAssetsList();
}

function deleteSelectedSprite(){
  if (!selectedSpriteId) return;
  project.sprites = project.sprites.filter(s => s.id !== selectedSpriteId);
  const spriteObj = spriteMap.get(selectedSpriteId);
  if (spriteObj) pixiStage.removeChild(spriteObj);
  spriteMap.delete(selectedSpriteId);
  selectedSpriteId = null;
  updatePropsPanel();
  logConsole('Sprite deleted.');
}

/* -------------------------
   Stage rendering
   ------------------------- */
function rebuildStage(){
  // clear stage
  pixiStage.removeChildren();
  spriteMap.clear();

  // background
  if (project.backgroundAssetId){
    const asset = project.assets.find(a => a.id === project.backgroundAssetId);
    if (asset){
      const tex = PIXI.Texture.from(asset.dataURL);
      const bg = new PIXI.Sprite(tex);
      bg.width = appPixi.renderer.width;
      bg.height = appPixi.renderer.height;
      bg.zIndex = 0;
      pixiStage.addChild(bg);
    }
  }

  // sprites
  project.sprites.forEach(s => {
    const sprite = createPixiSpriteForModel(s);
    pixiStage.addChild(sprite);
    spriteMap.set(s.id, sprite);
  });
}

function createPixiSpriteForModel(s){
  let tex = PIXI.Texture.WHITE;
  if (s.textureAssetId){
    const asset = project.assets.find(a => a.id === s.textureAssetId);
    if (asset) tex = PIXI.Texture.from(asset.dataURL);
  }
  const sprite = new PIXI.Sprite(tex);
  sprite.x = s.x;
  sprite.y = s.y;
  sprite.scale.set(s.scale);
  sprite.rotation = s.rotation * (Math.PI/180);
  sprite.anchor.set(0.5);
  sprite.interactive = true;
  sprite.buttonMode = true;
  return sprite;
}

function updateSpriteInView(s){
  const sprite = spriteMap.get(s.id);
  if (!sprite) return;
  sprite.x = s.x;
  sprite.y = s.y;
  sprite.scale.set(s.scale);
  sprite.rotation = s.rotation * (Math.PI/180);
  // update texture if changed
  if (s.textureAssetId){
    const asset = project.assets.find(a => a.id === s.textureAssetId);
    if (asset) sprite.texture = PIXI.Texture.from(asset.dataURL);
  }
}

/* -------------------------
   Code and sandbox
   ------------------------- */
function loadSpriteScript(){
  const s = project.sprites.find(x => x.id === selectedSpriteId);
  if (!s) { logConsole('No sprite selected'); return; }
  if (!s.scriptId) { logConsole('Sprite has no script'); return; }
  const script = project.scripts.find(sc => sc.id === s.scriptId);
  if (!script) return;
  currentScriptId = script.id;
  editor.dispatch({
    changes: {from:0, to: editor.state.doc.length, insert: script.code}
  });
  $('#langSelect').value = script.language === 'ts' ? 'ts' : 'js';
  logConsole('Loaded script for ' + s.name);
}

function saveScriptFromEditor(){
  if (!currentScriptId){
    // create global script
    const id = uid('script');
    const code = editor.state.doc.toString();
    const lang = $('#langSelect').value === 'ts' ? 'ts' : 'js';
    project.scripts.push({id, name: 'global', language: lang, code});
    currentScriptId = id;
    logConsole('Saved new script.');
    return;
  }
  const script = project.scripts.find(sc => sc.id === currentScriptId);
  if (!script) return;
  script.code = editor.state.doc.toString();
  script.language = $('#langSelect').value === 'ts' ? 'ts' : 'js';
  logConsole('Script saved.');
}

/* -------------------------
   Sandbox iframe and runtime API
   ------------------------- */
function createSandbox(){
  // remove old
  if (sandboxIframe) {
    sandboxIframe.remove();
    sandboxIframe = null;
    sandboxReady = false;
  }

  const html = `
  <!doctype html>
  <html>
  <head><meta charset="utf-8"></head>
  <body>
    <script>
      // engine side inside iframe
      const pending = [];
      let Engine = null;
      window.addEventListener('message', async (ev) => {
        const msg = ev.data;
        if (!msg || !msg.type) return;
        if (msg.type === 'init'){
          // create a minimal Engine that forwards messages to parent
          Engine = {
            _callbacks: [],
            createSprite: (name) => { parent.postMessage({type:'createSprite',name}, '*'); return {name}; },
            getSprite: (name) => { parent.postMessage({type:'getSprite',name}, '*'); return null; },
            playSound: (name) => { parent.postMessage({type:'playSound',name}, '*'); },
            setVolume: (v) => { parent.postMessage({type:'setVolume',value:v}, '*'); },
            pause: () => { parent.postMessage({type:'pause'}, '*'); },
            resume: () => { parent.postMessage({type:'resume'}, '*'); },
            log: (...args) => { parent.postMessage({type:'log',args}, '*'); },
            onUpdate: (cb) => { Engine._callbacks.push(cb); }
          };
          parent.postMessage({type:'ready'}, '*');
        } else if (msg.type === 'runCode'){
          try {
            // attach Engine to global
            self.Engine = Engine;
            // run code
            const func = new Function(msg.code + '\\n//# sourceURL=user-script.js');
            func();
            parent.postMessage({type:'runOk'}, '*');
          } catch(err){
            parent.postMessage({type:'error',error:err.message}, '*');
          }
        } else if (msg.type === 'frame'){
          // call update callbacks
          const dt = msg.dt;
          try {
            Engine && Engine._callbacks.forEach(cb => {
              try { cb(dt); } catch(e){ parent.postMessage({type:'error',error:e.message}, '*'); }
            });
          } catch(e){
            parent.postMessage({type:'error',error:e.message}, '*');
          }
        }
      });
    </script>
  </body>
  </html>
  `;
  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  sandboxIframe = document.createElement('iframe');
  sandboxIframe.style.display = 'none';
  sandboxIframe.src = url;
  document.body.appendChild(sandboxIframe);

  window.addEventListener('message', handleSandboxMessage);
}

function handleSandboxMessage(ev){
  const msg = ev.data;
  if (!msg || !msg.type) return;
  if (msg.type === 'ready'){
    sandboxReady = true;
    logConsole('Sandbox ready.');
  } else if (msg.type === 'log'){
    logConsole(...msg.args);
  } else if (msg.type === 'error'){
    logConsole('Error in sandbox: ' + msg.error);
  } else if (msg.type === 'createSprite'){
    // create a runtime sprite proxy (not fully implemented)
    logConsole('Sandbox requested createSprite: ' + msg.name);
  } else if (msg.type === 'getSprite'){
    // return basic info
    const s = project.sprites.find(x => x.name === msg.name);
    // not sending back complex objects for now
  } else if (msg.type === 'playSound'){
    const snd = project.sounds.find(x => x.name === msg.name || x.id === msg.name);
    if (snd){
      const asset = project.assets.find(a => a.id === snd.assetId);
      if (asset){
        const audio = new Audio(asset.dataURL);
        audio.volume = project.volume;
        audio.play();
      }
    }
  } else if (msg.type === 'setVolume'){
    project.volume = msg.value;
  }
}

/* send message to sandbox safely */
function broadcastToSandbox(obj){
  if (!sandboxIframe || !sandboxIframe.contentWindow) return;
  sandboxIframe.contentWindow.postMessage(obj, '*');
}

/* Run/Stop */
let lastTime = performance.now();
let running = false;
function runProject(){
  // create sandbox
  createSandbox();
  // wait a tick for iframe to load
  setTimeout(() => {
    broadcastToSandbox({type:'init'});
    // prepare code: combine global script + sprite scripts
    let combined = '';
    // global scripts
    project.scripts.filter(s => s.name === 'global' || s.name === 'global script').forEach(sc => combined += '\n' + sc.code + '\n');
    // sprite scripts
    project.sprites.forEach(sp => {
      if (!sp.scriptId) return;
      const sc = project.scripts.find(x => x.id === sp.scriptId);
      if (!sc) return;
      // wrap sprite access helpers
      const wrapper = `// script for sprite ${sp.name}\n(function(){\n  const SpriteName = ${JSON.stringify(sp.name)};\n  ${sc.code}\n})();\n`;
      combined += wrapper;
    });

    // if TypeScript selected, transpile
    const lang = $('#langSelect').value;
    if (lang === 'ts'){
      try {
        const tsResult = ts.transpileModule(combined, {compilerOptions:{target:ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext}});
        combined = tsResult.outputText;
      } catch(err){
        logConsole('TypeScript transpile error: ' + err.message);
        return;
      }
    }

    // send code to sandbox
    broadcastToSandbox({type:'runCode', code: combined});
    running = true;
    lastTime = performance.now();
    tickLoop();
    logConsole('Project running.');
  }, 200);
}

function stopProject(){
  running = false;
  if (sandboxIframe) {
    sandboxIframe.remove();
    sandboxIframe = null;
    sandboxReady = false;
  }
  logConsole('Project stopped.');
}

function tickLoop(){
  if (!running) return;
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  // send frame to sandbox
  broadcastToSandbox({type:'frame', dt});
  requestAnimationFrame(tickLoop);
}

/* -------------------------
   Console
   ------------------------- */
function logConsole(...args){
  const out = $('#consoleOutput');
  const line = document.createElement('div');
  line.textContent = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

/* -------------------------
   Sample project
   ------------------------- */
function loadSampleProject(){
  // small embedded sample asset (a tiny blue circle)
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6c8cff';
  ctx.beginPath(); ctx.arc(32,32,28,0,Math.PI*2); ctx.fill();
  const dataURL = canvas.toDataURL('image/png');
  const assetId = uid('asset');
  project.assets.push({id:assetId, name:'blue-circle.png', type:'image', dataURL});
  const spriteId = uid('sprite');
  const scriptId = uid('script');
  project.scripts.push({id:scriptId, name:'sprite script', language:'js', code:
`Engine.onUpdate((dt) => {
  const s = Engine.getSprite('Sample Sprite');
  // This demo uses Engine.log to show dt
  Engine.log('frame dt', dt.toFixed(3));
});`});
  project.sprites.push({id:spriteId, name:'Sample Sprite', x:200, y:150, scale:1, rotation:0, textureAssetId:assetId, scriptId});
  project.backgroundAssetId = assetId;
  refreshAssetsList();
  rebuildStage();
  logConsole('Sample project loaded.');
}

/* -------------------------
   Startup
   ------------------------- */
window.addEventListener('load', () => {
  initUI();
});
