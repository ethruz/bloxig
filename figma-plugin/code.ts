// ============================================================
// Bloxig Figma Plugin — code.ts  v1.2
// NEW in v1.2: Layer-name PREFIX PARSER
//   .textbutton / .imagebutton / .textbox / .scrollv / .scrollh
//   / .scrollxy / .viewport / .canvas / .frame / .textlabel
//   / .imagelabel  + tags .raster .parent .ignore .gray .lock
//   + state tags .hover .pressed .toggled .disabled
// These map to fields Generator.lua ALREADY consumes, so buttons,
// scroll frames, inputs and viewports finally build correctly.
// ============================================================

// ── Types ─────────────────────────────────────────────────────
type UIMessage =
  | { type: 'EXPORT_FRAME'; token: string }
  | { type: 'CANCEL' }
  | { type: 'RESIZE'; width: number; height: number }
  | { type: 'PING' };

interface BloxigNode {
  id:            string;
  name:          string;          // CLEAN name (prefixes stripped)
  type:          string;
  x:             number;
  y:             number;
  width:         number;
  height:        number;
  visible:       boolean;
  opacity:       number;
  rotation:      number;
  fills:         readonly Paint[];
  strokes:       readonly Paint[];
  strokeWeight:  number;
  cornerRadius?: number;
  fontName?:     FontName;
  fontSize?:     number;
  characters?:   string;
  textAlignHorizontal?: string;
  textAlignVertical?:   string;   // now emitted (Generator already reads it)
  layoutMode?:   string;
  itemSpacing?:  number;
  paddingLeft?:  number;
  paddingRight?: number;
  paddingTop?:   number;
  paddingBottom?:number;

  // ── Prefix-driven intent (consumed by Generator.lua) ─────────
  componentType?:     string;     // "BUTTON" → TextButton
  overflowDirection?: string;     // "VERTICAL" | "HORIZONTAL" | "BOTH" → ScrollingFrame
  isInputField?:      boolean;    // → TextBox
  is3DFrame?:         boolean;    // → ViewportFrame
  // ── Tags carried through for later steps (images / states) ───
  state?:             string;     // HOVER | PRESSED | TOGGLED | DISABLED
  isRaster?:          boolean;    // → bake to PNG (Step 3)
  isParentHost?:      boolean;    // → this child hosts its siblings (Step 3/4)
  isGrayscale?:       boolean;    // → grayscale PNG (Step 3)

  children:      BloxigNode[];
}

// ── Prefix tables ─────────────────────────────────────────────
type Role =
  | 'TEXTBUTTON' | 'IMAGEBUTTON' | 'TEXTBOX'
  | 'SCROLLV' | 'SCROLLH' | 'SCROLLXY'
  | 'VIEWPORT' | 'CANVAS'
  | 'FRAME' | 'TEXTLABEL' | 'IMAGELABEL';

const ROLE_PREFIXES: { [k: string]: Role } = {
  textbutton:  'TEXTBUTTON',
  imagebutton: 'IMAGEBUTTON',
  textbox:     'TEXTBOX',
  scrollv:     'SCROLLV',
  scrollh:     'SCROLLH',
  scrollxy:    'SCROLLXY',
  viewport:    'VIEWPORT',
  canvas:      'CANVAS',
  canvasgroup: 'CANVAS',
  frame:       'FRAME',
  textlabel:   'TEXTLABEL',
  imagelabel:  'IMAGELABEL',
  imageframe:  'IMAGELABEL', // alias
};

const STATE_PREFIXES: { [k: string]: string } = {
  hover:    'HOVER',
  pressed:  'PRESSED',
  clicked:  'PRESSED',
  toggled:  'TOGGLED',
  disabled: 'DISABLED',
};

interface ParsedName {
  cleanName:    string;
  role:         Role | null;
  state:        string | null;
  isRaster:     boolean;
  isParentHost: boolean;
  isIgnored:    boolean;
  isGrayscale:  boolean;
  isLocked:     boolean;
}

// ── parseLayerName ────────────────────────────────────────────
// "  .imagebutton .raster Close X " → { role: IMAGEBUTTON, isRaster, cleanName: "Close X" }
// Prefixes are leading dot-tokens; the text after the LAST prefix
// becomes the Roblox-facing name.
function parseLayerName(raw: string): ParsedName {
  const out: ParsedName = {
    cleanName: '', role: null, state: null,
    isRaster: false, isParentHost: false, isIgnored: false,
    isGrayscale: false, isLocked: false
  };

  if (!raw || raw.trim().length === 0) {
    out.cleanName = 'Element';
    return out;
  }

  const tokens = raw.trim().split(/\s+/);
  let i = 0;
  for (; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.charAt(0) !== '.') break;          // first non-dot token → name starts here
    const key = tok.slice(1).toLowerCase();

    if (ROLE_PREFIXES[key])       out.role  = ROLE_PREFIXES[key];
    else if (STATE_PREFIXES[key]) out.state = STATE_PREFIXES[key];
    else if (key === 'raster')    out.isRaster     = true;
    else if (key === 'parent')    out.isParentHost = true;
    else if (key === 'ignore')    out.isIgnored    = true;
    else if (key === 'gray' || key === 'grayscale') out.isGrayscale = true;
    else if (key === 'lock')      out.isLocked     = true;
    // unknown .token → just skip it, keep scanning prefixes
  }

  const name = tokens.slice(i).join(' ').trim();
  out.cleanName = name.length > 0 ? name : 'Element';
  return out;
}

// ── Show UI ───────────────────────────────────────────────────
figma.showUI(__html__, {
  width:       380,
  height:      520,
  title:       'Bloxig — Export to Roblox',
  themeColors: true
});

// ── Helper: build selection payload ──────────────────────────
function getSelectionPayload() {
  const sel = figma.currentPage.selection;
  const first = sel[0];

  const exportable = first && (
    first.type === 'FRAME' ||
    first.type === 'COMPONENT' ||
    first.type === 'COMPONENT_SET' ||
    first.type === 'SECTION' ||
    first.type === 'GROUP'
  );

  return {
    hasSelection:   sel.length > 0 && exportable,
    selectionName:  exportable ? first.name : null,
    selectionType:  first ? first.type : null,
    selectionCount: sel.length,
    notExportable:  sel.length > 0 && !exportable
  };
}

// ── Send initial state to UI ──────────────────────────────────
function sendInitialContext() {
  const user = figma.currentUser;
  const sel  = getSelectionPayload();

  figma.ui.postMessage({
    type: 'INIT',
    payload: {
      userName:       user?.name      ?? 'Figma User',
      userId:         user?.id        ?? null,
      userPhotoUrl:   user?.photoUrl  ?? null,
      fileKey:        figma.fileKey   ?? 'local',
      ...sel
    }
  });
}

sendInitialContext();

figma.on('selectionchange', () => {
  figma.ui.postMessage({
    type:    'SELECTION_CHANGED',
    payload: getSelectionPayload()
  });
});

figma.on('currentpagechange', () => {
  sendInitialContext();
});

// ── Message validation ────────────────────────────────────────
function validateMessage(msg: unknown): UIMessage | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;

  if (m.type === 'PING') return { type: 'PING' };
  if (m.type === 'CANCEL') return { type: 'CANCEL' };

  if (m.type === 'EXPORT_FRAME') {
    if (typeof m.token !== 'string' || m.token.trim().length === 0) {
      return null;
    }
    return { type: 'EXPORT_FRAME', token: m.token.trim() };
  }

  if (m.type === 'RESIZE') {
    if (typeof m.width !== 'number' || typeof m.height !== 'number') return null;
    return { type: 'RESIZE', width: m.width, height: m.height };
  }

  return null;
}

// ── Message handler ───────────────────────────────────────────
figma.ui.onmessage = async (rawMsg: unknown) => {
  const msg = validateMessage(rawMsg);
  if (!msg) return;

  if (msg.type === 'PING') { sendInitialContext(); return; }
  if (msg.type === 'CANCEL') { figma.closePlugin(); return; }

  if (msg.type === 'RESIZE') {
    figma.ui.resize(
      Math.max(320, Math.min(msg.width,  800)),
      Math.max(480, Math.min(msg.height, 900))
    );
    return;
  }

  if (msg.type === 'EXPORT_FRAME') {
    await handleExport(msg.token);
  }
};

// ── Export handler ────────────────────────────────────────────
async function handleExport(token: string) {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Please select a frame first.' });
    return;
  }
  if (selection.length > 1) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Select only one frame at a time.' });
    return;
  }

  const node = selection[0];

  const validTypes = ['FRAME','COMPONENT','COMPONENT_SET','SECTION','GROUP'];
  if (validTypes.indexOf(node.type) === -1) {
    figma.ui.postMessage({
      type:    'ERROR',
      message: `Cannot export a ${node.type}. Please select a Frame or Component.`
    });
    return;
  }

  figma.ui.postMessage({ type: 'PROGRESS', message: 'Loading fonts...' });

  try {
    await loadAllFonts(node);
  } catch (err) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Font loading failed: ' + String(err) });
    return;
  }

  figma.ui.postMessage({ type: 'PROGRESS', message: 'Serialising design...' });

  let serialised: BloxigNode | null;
  try {
    serialised = serialiseNode(node);
  } catch (err) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Serialisation failed: ' + String(err) });
    return;
  }

  if (!serialised) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Selected frame is tagged .ignore — nothing to export.' });
    return;
  }

  const frameW = 'width'  in node ? (node as FrameNode).width  : 100;
  const frameH = 'height' in node ? (node as FrameNode).height : 100;

  const payload = {
    version:      '1.2.0',
    exportedAt:   new Date().toISOString(),
    figmaFileKey: figma.fileKey ?? 'local',
    figmaFileId:  figma.fileKey ?? 'local',
    frame: {
      id:     node.id,
      name:   node.name,
      width:  frameW,
      height: frameH
    },
    nodes: serialised.children
  };

  figma.ui.postMessage({ type: 'PROGRESS', message: 'Sending to Bloxig server...' });

  try {
    const serverUrl = 'https://bloxig.onrender.com';
    const response = await fetch(`${serverUrl}/api/export`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name:             node.name,
        figma_file_id:    figma.fileKey ?? 'local',
        json_layout_data: payload
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: 'Server error' }));
      figma.ui.postMessage({
        type:    'ERROR',
        message: `Export failed (${response.status}): ${errData.error || 'Unknown error'}`
      });
      return;
    }

    const result = await response.json();
    figma.ui.postMessage({
      type:      'SUCCESS',
      message:   `"${node.name}" exported successfully!`,
      projectId: result.project_id
    });

  } catch (err) {
    figma.ui.postMessage({
      type:    'ERROR',
      message: 'Cannot reach Bloxig server. Check your internet connection.'
    });
  }
}

// ── Font loader ───────────────────────────────────────────────
async function loadAllFonts(node: SceneNode): Promise<void> {
  const textNodes: TextNode[] = [];
  collectTextNodes(node, textNodes);

  const uniqueFonts = new Map<string, FontName>();
  for (const t of textNodes) {
    if (t.fontName !== figma.mixed) {
      const key = `${t.fontName.family}::${t.fontName.style}`;
      uniqueFonts.set(key, t.fontName as FontName);
    }
  }

  await Promise.all(
    [...uniqueFonts.values()].map(fn =>
      figma.loadFontAsync(fn).catch(() => {/* non-fatal */})
    )
  );
}

function collectTextNodes(node: SceneNode, result: TextNode[]): void {
  if (node.type === 'TEXT') {
    result.push(node as TextNode);
  } else if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      collectTextNodes(child, result);
    }
  }
}

// ── Apply parsed role → Generator-understood fields ───────────
function applyRole(base: BloxigNode, parsed: ParsedName): void {
  switch (parsed.role) {
    case 'TEXTBUTTON':
      base.type = 'COMPONENT';
      base.componentType = 'BUTTON';
      break;
    case 'IMAGEBUTTON':
      base.type = 'IMAGE_BUTTON';
      break;
    case 'TEXTBOX':
      base.isInputField = true;
      break;
    case 'SCROLLV':
      base.type = 'FRAME';
      base.overflowDirection = 'VERTICAL';
      break;
    case 'SCROLLH':
      base.type = 'FRAME';
      base.overflowDirection = 'HORIZONTAL';
      break;
    case 'SCROLLXY':
      base.type = 'FRAME';
      base.overflowDirection = 'BOTH';
      break;
    case 'VIEWPORT':
      base.is3DFrame = true;
      break;
    case 'TEXTLABEL':
      base.type = 'TEXT';
      break;
    case 'IMAGELABEL':
      base.type = 'IMAGE';
      break;
    case 'FRAME':
      base.type = 'FRAME';
      break;
    // CANVAS is handled by Generator only when GROUP + opacity<1;
    // a dedicated forceCanvas branch comes with the Step 2 Generator patch.
    default:
      break;
  }
}

// ── Node serialiser ───────────────────────────────────────────
// Returns null when the node is tagged .ignore (so it is skipped).
function serialiseNode(node: SceneNode): BloxigNode | null {
  const parsed = parseLayerName(node.name);
  if (parsed.isIgnored) return null;            // .ignore → drop entirely

  const n = node as any;

  const base: BloxigNode = {
    id:           node.id,
    name:         parsed.cleanName,             // prefixes stripped
    type:         node.type,
    x:            n.x            ?? 0,
    y:            n.y            ?? 0,
    width:        n.width        ?? 0,
    height:       n.height       ?? 0,
    visible:      n.visible      ?? true,
    opacity:      n.opacity      ?? 1,
    rotation:     n.rotation     ?? 0,
    fills:        (n.fills !== figma.mixed ? n.fills   : []) ?? [],
    strokes:      (n.strokes !== figma.mixed ? n.strokes : []) ?? [],
    strokeWeight: n.strokeWeight ?? 0,
    children:     []
  };

  // Carry tags through (used by later image/state steps)
  if (parsed.state)        base.state        = parsed.state;
  if (parsed.isRaster)     base.isRaster     = true;
  if (parsed.isParentHost) base.isParentHost = true;
  if (parsed.isGrayscale)  base.isGrayscale  = true;

  // Corner radius
  if (n.cornerRadius !== undefined && n.cornerRadius !== figma.mixed) {
    base.cornerRadius = n.cornerRadius;
  }

  // Auto layout
  if (n.layoutMode && n.layoutMode !== 'NONE') {
    base.layoutMode    = n.layoutMode;
    base.itemSpacing   = n.itemSpacing   ?? 0;
    base.paddingLeft   = n.paddingLeft   ?? 0;
    base.paddingRight  = n.paddingRight  ?? 0;
    base.paddingTop    = n.paddingTop    ?? 0;
    base.paddingBottom = n.paddingBottom ?? 0;
  }

  // Text properties
  if (node.type === 'TEXT') {
    const t = node as TextNode;
    base.characters = t.characters;
    if (t.fontSize !== figma.mixed)  base.fontSize  = t.fontSize as number;
    if (t.fontName !== figma.mixed)  base.fontName  = t.fontName as FontName;
    if (t.textAlignHorizontal)       base.textAlignHorizontal = t.textAlignHorizontal;
    if (t.textAlignVertical)         base.textAlignVertical   = t.textAlignVertical;
  }

  // Apply prefix role AFTER the raw type is set, so it can override it
  applyRole(base, parsed);

  // Recurse children (skip invisible + skip .ignore via null filtering)
  if ('children' in node) {
    base.children = (node as ChildrenMixin).children
      .filter(c => c.visible !== false)
      .map(c => serialiseNode(c))
      .filter((c): c is BloxigNode => c !== null);
  }

  return base;
}
