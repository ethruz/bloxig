
// ============================================================
// Bloxig Figma Plugin — code.ts
// Runs in Figma's sandbox. Has access to figma.* API.
// NEVER has access to the DOM or window.
// ============================================================
 
// ── Allowed message types (validated strictly) ────────────
type UIMessage =
  | { type: 'EXPORT_FRAME'; token: string }
  | { type: 'CANCEL' }
  | { type: 'RESIZE'; width: number; height: number };
 
// ── Figma node → our JSON shape ───────────────────────────
interface BloxigNode {
  id:         string;
  name:       string;
  type:       string;
  x:          number;
  y:          number;
  width:      number;
  height:     number;
  visible:    boolean;
  opacity:    number;
  fills:      Paint[];
  strokes:    Paint[];
  cornerRadius?: number;
  fontName?:  FontName;
  fontSize?:  number;
  characters?: string;
  children:   BloxigNode[];
}
 
interface ExportPayload {
  version:      string;
  exportedAt:   string;
  figmaFileKey: string;
  figmaFileId:  string;
  frame: {
    id:       string;
    name:     string;
    width:    number;
    height:   number;
  };
  nodes: BloxigNode[];
}
 
// ── Open the plugin UI ────────────────────────────────────
figma.showUI(__html__, {
  width:  360,
  height: 480,
  title:  'Bloxig — Export to Roblox',
  themeColors: true
});
 
// ── Send initial context to UI ────────────────────────────
async function sendInitialContext() {
  const user = figma.currentUser;
  const selection = figma.currentPage.selection;
 
  figma.ui.postMessage({
    type: 'INIT',
    payload: {
      userName:      user?.name    ?? 'Unknown',
      userId:        user?.id      ?? null,
      userPhotoUrl:  user?.photoUrl ?? null,
      hasSelection:  selection.length > 0,
      selectionName: selection.length === 1 ? selection[0].name : null,
      selectionCount: selection.length,
      fileKey:       figma.fileKey ?? 'local'
    }
  });
}
 
sendInitialContext();
 
// ── Selection change listener ─────────────────────────────
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    type: 'SELECTION_CHANGED',
    payload: {
      hasSelection:   selection.length > 0,
      selectionName:  selection.length === 1 ? selection[0].name : null,
      selectionCount: selection.length
    }
  });
});
 
// ── Message validation ────────────────────────────────────
function validateMessage(msg: unknown): UIMessage | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;
 
  if (m.type === 'EXPORT_FRAME') {
    if (typeof m.token !== 'string' || m.token.trim().length === 0) {
      return null; // token required
    }
    return { type: 'EXPORT_FRAME', token: m.token.trim() };
  }
 
  if (m.type === 'CANCEL') {
    return { type: 'CANCEL' };
  }
 
  if (m.type === 'RESIZE') {
    if (typeof m.width !== 'number' || typeof m.height !== 'number') return null;
    return { type: 'RESIZE', width: m.width, height: m.height };
  }
 
  return null;
}
 
// ── Main message handler ──────────────────────────────────
figma.ui.onmessage = async (rawMsg: unknown) => {
  const msg = validateMessage(rawMsg);
 
  if (!msg) {
    figma.ui.postMessage({
      type: 'ERROR',
      message: 'Invalid message received. Possible tampering detected.'
    });
    return;
  }
 
  if (msg.type === 'CANCEL') {
    figma.closePlugin();
    return;
  }
 
  if (msg.type === 'RESIZE') {
    figma.ui.resize(
      Math.max(300, Math.min(msg.width,  800)),
      Math.max(400, Math.min(msg.height, 900))
    );
    return;
  }
 
  if (msg.type === 'EXPORT_FRAME') {
    await handleExport(msg.token);
  }
};
 
// ── Export handler ────────────────────────────────────────
async function handleExport(token: string) {
  const selection = figma.currentPage.selection;
 
  // Must have exactly one frame selected
  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Please select a frame first.' });
    return;
  }
  if (selection.length > 1) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Please select only one frame at a time.' });
    return;
  }
 
  const node = selection[0];
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'SECTION') {
    figma.ui.postMessage({ type: 'ERROR', message: 'Selected element must be a Frame, Component, or Section.' });
    return;
  }
 
  figma.ui.postMessage({ type: 'PROGRESS', message: 'Loading fonts...' });
 
  // Load fonts for all text nodes before serialising
  try {
    await loadAllFonts(node);
  } catch (err) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Font loading failed: ' + String(err) });
    return;
  }
 
  figma.ui.postMessage({ type: 'PROGRESS', message: 'Serialising frame...' });
 
  let serialised: BloxigNode;
  try {
    serialised = serialiseNode(node);
  } catch (err) {
    figma.ui.postMessage({ type: 'ERROR', message: 'Serialisation failed: ' + String(err) });
    return;
  }
 
  const payload: ExportPayload = {
    version:      '1.0.0',
    exportedAt:   new Date().toISOString(),
    figmaFileKey: figma.fileKey ?? 'local',
    figmaFileId:  figma.fileKey ?? 'local',
    frame: {
      id:     node.id,
      name:   node.name,
      width:  'width'  in node ? (node as FrameNode).width  : 0,
      height: 'height' in node ? (node as FrameNode).height : 0
    },
    nodes: serialised.children
  };
 
  figma.ui.postMessage({ type: 'PROGRESS', message: 'Sending to Bloxig server...' });
 
  // Send to server
  try {
    const response = await fetch('http://localhost:3000/api/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name:             node.name,
        figma_file_id:    figma.fileKey ?? 'local',
        json_layout_data: payload
      })
    });
 
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown server error' }));
      figma.ui.postMessage({ type: 'ERROR', message: err.error ?? 'Export failed.' });
      return;
    }
 
    const result = await response.json();
    figma.ui.postMessage({
      type: 'SUCCESS',
      message: `"${node.name}" exported successfully!`,
      projectId: result.project_id
    });
 
  } catch (err) {
    figma.ui.postMessage({
      type: 'ERROR',
      message: 'Could not reach Bloxig server. Is it running on localhost:3000?'
    });
  }
}
 
// ── Font loader — collects all text nodes and loads fonts ─
async function loadAllFonts(node: SceneNode): Promise<void> {
  const textNodes: TextNode[] = [];
  collectTextNodes(node, textNodes);
 
  const uniqueFonts = new Map<string, FontName>();
  for (const t of textNodes) {
    if (t.fontName !== figma.mixed) {
      const key = `${t.fontName.family}::${t.fontName.style}`;
      uniqueFonts.set(key, t.fontName);
    } else {
      // mixed fonts — get unique fonts from each character
      const len = t.characters.length;
      for (let i = 0; i < len; i++) {
        const fn = t.getRangeFontName(i, i + 1);
        if (fn !== figma.mixed) {
          const key = `${fn.family}::${fn.style}`;
          uniqueFonts.set(key, fn);
        }
      }
    }
  }
 
  await Promise.all([...uniqueFonts.values()].map(fn => figma.loadFontAsync(fn)));
}
 
function collectTextNodes(node: SceneNode, result: TextNode[]): void {
  if (node.type === 'TEXT') {
    result.push(node);
  } else if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      collectTextNodes(child, result);
    }
  }
}
 
// ── Node serialiser ───────────────────────────────────────
function serialiseNode(node: SceneNode): BloxigNode {
  const base: BloxigNode = {
    id:       node.id,
    name:     node.name,
    type:     node.type,
    x:        'x'       in node ? (node as any).x       : 0,
    y:        'y'       in node ? (node as any).y       : 0,
    width:    'width'   in node ? (node as any).width   : 0,
    height:   'height'  in node ? (node as any).height  : 0,
    visible:  'visible' in node ? (node as any).visible : true,
    opacity:  'opacity' in node ? (node as any).opacity : 1,
    fills:    'fills'   in node && (node as any).fills !== figma.mixed
                ? [...(node as any).fills]  : [],
    strokes:  'strokes' in node && (node as any).strokes !== figma.mixed
                ? [...(node as any).strokes] : [],
    children: []
  };
 
  // Corner radius
  if ('cornerRadius' in node && (node as any).cornerRadius !== figma.mixed) {
    base.cornerRadius = (node as any).cornerRadius;
  }
 
  // Text properties
  if (node.type === 'TEXT') {
    const t = node as TextNode;
    base.characters = t.characters;
    if (t.fontName !== figma.mixed) base.fontName = t.fontName;
    if (t.fontSize !== figma.mixed) base.fontSize  = t.fontSize as number;
  }
 
  // Recurse children
  if ('children' in node) {
    base.children = (node as ChildrenMixin).children
      .filter(c => c.visible)
      .map(c => serialiseNode(c));
  }
 
  return base;
}
 
