// ============================================================
// Bloxig Figma Plugin — code.ts  v1.1
// FIXED: Selection detection now works in browser Figma
// ============================================================
// UPdated code of Code.ts
// ── Types ─────────────────────────────────────────────────────
type UIMessage =
  | { type: 'EXPORT_FRAME'; token: string }
  | { type: 'CANCEL' }
  | { type: 'RESIZE'; width: number; height: number }
  | { type: 'PING' };

interface BloxigNode {
  id:            string;
  name:          string;
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
  layoutMode?:   string;
  itemSpacing?:  number;
  paddingLeft?:  number;
  paddingRight?: number;
  paddingTop?:   number;
  paddingBottom?:number;
  children:      BloxigNode[];
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

  // Check if selected node is an exportable type
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

// Send immediately on open
sendInitialContext();

// ── Selection change — fires when user clicks a frame ─────────
figma.on('selectionchange', () => {
  figma.ui.postMessage({
    type:    'SELECTION_CHANGED',
    payload: getSelectionPayload()
  });
});

// ── Page change listener ──────────────────────────────────────
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

  if (!msg) return; // ignore unknown messages silently

  if (msg.type === 'PING') {
    // UI is ready — re-send current selection state
    sendInitialContext();
    return;
  }

  if (msg.type === 'CANCEL') {
    figma.closePlugin();
    return;
  }

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
  if (!validTypes.includes(node.type)) {
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

  let serialised: BloxigNode;
  try {
    serialised = serialiseNode(node);
  } catch (err) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Serialisation failed: ' + String(err) });
    return;
  }

  const frameW = 'width'  in node ? (node as FrameNode).width  : 100;
  const frameH = 'height' in node ? (node as FrameNode).height : 100;

  const payload = {
    version:      '1.1.0',
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

// ── Node serialiser ───────────────────────────────────────────
function serialiseNode(node: SceneNode): BloxigNode {
  const n = node as any;

  const base: BloxigNode = {
    id:           node.id,
    name:         node.name,
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
  }

  // Recurse children (only visible ones)
  if ('children' in node) {
    base.children = (node as ChildrenMixin).children
      .filter(c => c.visible !== false)
      .map(c => serialiseNode(c));
  }

  return base;
}