// ============================================================
// Bloxig Figma Plugin — code.ts  v1.3
// FIX over v1.2: emit a `prefixes` ARRAY + clean `name` + `rawName`,
// which is exactly what the live Generator v2.1 (parsePrefixes)
// consumes. v1.2 stripped the prefix from the name and set fields
// the live Generator ignores, so buttons/scroll fell back to Frame.
//
// Supported prefixes (must match Generator VALID_PREFIXES):
//   .textbutton .imagebutton .scrollv .scrollh .canvas
//   .raster .input .viewport .ignore .parent
// Synonyms auto-mapped: .textbox->input  .canvasgroup->canvas
//                       .scrollxy->scrollv
// .ignore drops the node from the export entirely.
// ============================================================

// -- Types -----------------------------------------------------
type UIMessage =
  | { type: 'EXPORT_FRAME'; token: string }
  | { type: 'CANCEL' }
  | { type: 'RESIZE'; width: number; height: number }
  | { type: 'PING' };

interface BloxigNode {
  id:            string;
  name:          string;          // CLEAN name (prefixes stripped)
  rawName:       string;          // ORIGINAL name (".textbutton Play")
  prefixes?:     string[];        // canonical prefixes the Generator reads
  type:          string;          // REAL Figma type -- never coerced
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
  textAlignVertical?:   string;
  layoutMode?:   string;
  itemSpacing?:  number;
  paddingLeft?:  number;
  paddingRight?: number;
  paddingTop?:   number;
  paddingBottom?:number;
  children:      BloxigNode[];
}

// -- Prefix vocabulary (canonical = what Generator understands) -
const PREFIX_SYNONYMS: { [k: string]: string } = {
  textbutton:  'textbutton',
  imagebutton: 'imagebutton',
  scrollv:     'scrollv',
  scrollh:     'scrollh',
  scrollxy:    'scrollv',   // Generator has no BOTH -> vertical
  canvas:      'canvas',
  canvasgroup: 'canvas',
  raster:      'raster',
  input:       'input',
  textbox:     'input',     // synonym
  viewport:    'viewport',
  parent:      'parent'
};

interface ParsedName {
  cleanName: string;
  prefixes:  string[];      // canonical, deduped
  isIgnored: boolean;
  rawName:   string;
}

// -- parseLayerName --------------------------------------------
// "  .imagebutton .raster Close X "
//   -> { prefixes:[imagebutton,raster], cleanName:"Close X", isIgnored:false }
// Leading dot-tokens are prefixes; text after the last one is the name.
function parseLayerName(raw: string): ParsedName {
  const out: ParsedName = {
    cleanName: 'Element', prefixes: [], isIgnored: false, rawName: raw || ''
  };
  if (!raw || raw.trim().length === 0) return out;

  const tokens = raw.trim().split(/\s+/);
  const seen: { [k: string]: boolean } = {};
  let i = 0;
  for (; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.charAt(0) !== '.') break;          // first non-dot token = name start
    const key = tok.slice(1).toLowerCase();

    if (key === 'ignore') { out.isIgnored = true; continue; }

    const canon = PREFIX_SYNONYMS[key];
    if (canon && !seen[canon]) {
      out.prefixes.push(canon);
      seen[canon] = true;
    }
    // unknown .token (e.g. .hover, .frame, .textlabel) -> skipped on purpose
  }

  const name = tokens.slice(i).join(' ').trim();
  out.cleanName = name.length > 0 ? name : 'Element';
  return out;
}

// -- Show UI ---------------------------------------------------
figma.showUI(__html__, {
  width:       380,
  height:      520,
  title:       'Bloxig — Export to Roblox',
  themeColors: true
});

// -- Helper: build selection payload ---------------------------
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

// -- Send initial state to UI ----------------------------------
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

// -- Message validation ----------------------------------------
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

// -- Message handler -------------------------------------------
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

// -- Export handler --------------------------------------------
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
  const frameName = parseLayerName(node.name).cleanName;

  const payload = {
    version:      '1.3.0',
    exportedAt:   new Date().toISOString(),
    figmaFileKey: figma.fileKey ?? 'local',
    figmaFileId:  figma.fileKey ?? 'local',
    frame: {
      id:     node.id,
      name:   frameName,
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
        name:             frameName,
        figma_file_id:    figma.fileKey ?? 'local',
        figma_frame_id:   node.id,
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
      message:   `"${frameName}" exported successfully!`,
      projectId: result.project_id
    });

  } catch (err) {
    figma.ui.postMessage({
      type:    'ERROR',
      message: 'Cannot reach Bloxig server. Check your internet connection.'
    });
  }
}

// -- Font loader -----------------------------------------------
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

// -- Node serialiser -------------------------------------------
// Returns null when the node is tagged .ignore (so it is skipped).
function serialiseNode(node: SceneNode): BloxigNode | null {
  const parsed = parseLayerName(node.name);
  if (parsed.isIgnored) return null;            // .ignore -> drop entirely

  const n = node as any;

  const base: BloxigNode = {
    id:           node.id,
    name:         parsed.cleanName,             // clean Roblox-facing name
    rawName:      parsed.rawName,               // original, for Generator fallback
    type:         node.type,                    // REAL Figma type (not coerced)
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

  // The whole point of v1.3: hand the Generator a clean prefixes array.
  if (parsed.prefixes.length > 0) {
    base.prefixes = parsed.prefixes;
  }

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

  // Recurse children (skip invisible + skip .ignore via null filtering)
  if ('children' in node) {
    base.children = (node as ChildrenMixin).children
      .filter(c => c.visible !== false)
      .map(c => serialiseNode(c))
      .filter((c): c is BloxigNode => c !== null);
  }

  return base;
}
