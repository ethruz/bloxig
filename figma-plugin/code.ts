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
  clipsContent?: boolean;
  imageName?:    string;
  isRaster?:     boolean;
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
  __exportRootId = node.id;   // mark root so it is never rasterized

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
    // Seed the recursion with the root frame's own absolute origin, so its
    // direct children come out relative to the frame's top-left (0,0).
    const rootAbb = (node as any).absoluteBoundingBox;
    const rootAbsX = rootAbb && typeof rootAbb.x === 'number' ? rootAbb.x : ((node as any).x ?? 0);
    const rootAbsY = rootAbb && typeof rootAbb.y === 'number' ? rootAbb.y : ((node as any).y ?? 0);
    serialised = serialiseNode(node, rootAbsX, rootAbsY);
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

  // -- Collect image PNGs ----------------------------------------
  // Walk the tree; for every node that got an imageName, render it to PNG
  // bytes (base64) so the user can upload them to Roblox. Keyed by imageName.
  figma.ui.postMessage({ type: 'PROGRESS', message: 'Rendering images...' });
  const images: { [imageName: string]: string } = {};
  try {
    await collectImages(node, images);
  } catch (err) {
    // Non-fatal: export still works, images just won't be bundled.
    figma.ui.postMessage({ type: 'PROGRESS', message: 'Image render skipped: ' + String(err) });
  }

  const payload = {
    version:      '1.4.0',
    exportedAt:   new Date().toISOString(),
    figmaFileKey: figma.fileKey ?? 'local',
    figmaFileId:  figma.fileKey ?? 'local',
    frame: {
      id:     node.id,
      name:   frameName,
      width:  frameW,
      height: frameH
    },
    nodes:  serialised.children,
    images: images   // { imageName: base64PNG }
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

// -- Image collector -------------------------------------------
// Walks the tree; every node that qualifies as an image (IMAGE fill or .raster)
// is rendered to a PNG via exportAsync and stored as base64, keyed by the same
// imageName the serialiser assigned (so the Roblox linker can match them).
async function collectImages(
  node: SceneNode,
  out: { [imageName: string]: string }
): Promise<void> {
  if (node.visible === false) return;

  const parsed = parseLayerName(node.name);
  if (parsed.isIgnored) return;

  // ── AUTO-RASTERIZE bake path (must match serialiseNode's decision) ──────
  if (shouldRasterizeGroup(node as any, parsed, false)) {
    const imgName = sanitiseForName(parsed.cleanName) + '_' + sanitiseForName(node.id);
    if (!out[imgName]) {
      // Hide native-safe text so it isn't drawn into the PNG (it's emitted as a
      // real TextLabel on top). ALWAYS restore visibility in finally so the
      // user's Figma file is never left damaged.
      const toHide: any[] = [];
      collectNativeSafeTextNodes(node as any, node as any, toHide);
      const saved = toHide.map((t) => ({ t, v: t.visible }));
      try {
        for (const s of saved) s.t.visible = false;
        const bytes = await (node as any).exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: 2 }
        });
        out[imgName] = figma.base64Encode(bytes);
      } catch (e) {
        // skip this image; non-fatal
      } finally {
        for (const s of saved) s.t.visible = s.v;
      }
    }
    return;   // baked — do NOT recurse; children live in the PNG
  }

  // ── Normal path: per-node image fills / explicit .raster leaves ─────────
  const imgName = imageNameFor(node, parsed);
  if (imgName && !out[imgName]) {
    try {
      const bytes = await (node as any).exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 2 }   // 2x for crisp upscaling
      });
      out[imgName] = figma.base64Encode(bytes);
    } catch (e) {
      // skip this image; non-fatal
    }
  }

  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      await collectImages(child, out);
    }
  }
}

// -- Fill / paint normaliser -----------------------------------
// Figma's Paint shape doesn't match what the Roblox Generator expects:
//   • SOLID alpha lives in paint.opacity, NOT color.a
//   • Gradients give a `gradientTransform` MATRIX, not an angle
//   • gradient stop colors already carry r,g,b,a
// We normalise here so the Lua side reads a clean, predictable shape:
//   SOLID    -> { type:'SOLID', color:{r,g,b,a} }
//   GRADIENT -> { type, gradientStops:[{position,color:{r,g,b,a}}], gradientAngle }
//   IMAGE    -> { type:'IMAGE', imageHash, scaleMode }

interface NormColor { r: number; g: number; b: number; a: number; }
interface NormFill {
  type: string;
  color?: NormColor;
  gradientStops?: { position: number; color: NormColor }[];
  gradientAngle?: number;       // radians
  imageHash?: string | null;
  scaleMode?: string;
  visible?: boolean;
}

// Convert Figma's gradientTransform (2x3 affine matrix) into a rotation angle.
// The gradient direction is the first row of the transform; Roblox UIGradient
// uses degrees, but we emit radians and let the Lua convert (math.deg).
function gradientTransformToAngle(t: any): number {
  if (!t || !t[0]) return 0;
  // t = [[a, b, tx], [c, d, ty]] — direction vector is (a, b)
  const a = t[0][0];
  const b = t[0][1];
  return Math.atan2(b, a);   // radians
}

function normalizePaint(paint: any): NormFill | null {
  if (!paint) return null;
  if (paint.visible === false) return null;

  const opacity = paint.opacity == null ? 1 : paint.opacity;

  if (paint.type === 'SOLID') {
    const c = paint.color || { r: 1, g: 1, b: 1 };
    // Figma stores transparency in TWO places: paint.opacity AND color.a.
    // Multiply both (matching the gradient branch below). Using opacity alone
    // dropped translucent strokes' alpha, making glassmorphism borders render
    // as hard opaque (black) outlines.
    const colorA = c.a == null ? 1 : c.a;
    return {
      type: 'SOLID',
      color: { r: c.r, g: c.g, b: c.b, a: colorA * opacity }
    };
  }

  if (paint.type === 'GRADIENT_LINEAR' || paint.type === 'GRADIENT_RADIAL' ||
      paint.type === 'GRADIENT_ANGULAR' || paint.type === 'GRADIENT_DIAMOND') {
    const stops = (paint.gradientStops || []).map((st: any) => ({
      position: st.position,
      color: {
        r: st.color.r, g: st.color.g, b: st.color.b,
        // multiply stop alpha by overall paint opacity
        a: (st.color.a == null ? 1 : st.color.a) * opacity
      }
    }));
    return {
      type: paint.type,
      gradientStops: stops,
      gradientAngle: gradientTransformToAngle(paint.gradientTransform)
    };
  }

  if (paint.type === 'IMAGE') {
    return {
      type: 'IMAGE',
      imageHash: paint.imageHash || null,
      scaleMode: paint.scaleMode || 'FILL'
    };
  }

  // Unknown paint type — skip it
  return null;
}

function normalizePaints(paints: any): NormFill[] {
  if (!paints || paints === figma.mixed || !Array.isArray(paints)) return [];
  const out: NormFill[] = [];
  for (const p of paints) {
    const n = normalizePaint(p);
    if (n) out.push(n);
  }
  return out;
}

// -- Image detection + naming ----------------------------------
// We export a PNG for: (a) nodes with an IMAGE fill (textures, art, coins),
// and (b) nodes explicitly tagged .raster. Vectors are NOT auto-rasterised
// (would bloat exports); tag them .raster to force it.
//
// imageName is the stable matching key used by the Roblox linker. We use
// "{cleanName}_{nodeId}" with the id sanitised to be filename-safe, which
// GUARANTEES uniqueness (two layers both named "Rays" never collide).

function sanitiseForName(s: string): string {
  return (s || '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function nodeHasImageFill(n: any): boolean {
  const fills = n.fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return false;
  return fills.some((f: any) => f && f.type === 'IMAGE' && f.visible !== false);
}

// Returns the imageName to assign, or null if this node isn't an image node.
function imageNameFor(node: SceneNode, parsed: ParsedName): string | null {
  const n = node as any;
  const isRaster = parsed.prefixes.indexOf('raster') !== -1;
  if (isRaster || nodeHasImageFill(n)) {
    return sanitiseForName(parsed.cleanName) + '_' + sanitiseForName(node.id);
  }
  return null;
}

// Tracks the root node of the in-progress export so the root frame itself
// is never rasterized (we must never bake the whole UI into one PNG).
let __exportRootId: string | null = null;

// ============================================================
// AUTO-RASTERIZE HELPERS (v1.4)
// Bake decorative/effect-heavy groups to ONE PNG; keep structural
// /interactive groups native; pull functional text out as editable
// TextLabels, leave stylized text baked into the art.
// ============================================================

const RASTER_VECTOR_THRESHOLD = 4;   // tune: how many vector-ish children = "art"
const DECOR_PILE_THRESHOLD    = 8;   // tune: this many+ plain text-less shapes in a group = decorative pile -> bake

const VECTORISH = ['VECTOR','ELLIPSE','STAR','POLYGON','BOOLEAN_OPERATION','LINE'];
const CONTAINER = ['GROUP','FRAME','COMPONENT','INSTANCE','COMPONENT_SET','SECTION'];

function isContainer(node: any): boolean {
  return CONTAINER.indexOf(node.type) !== -1;
}

function hasVisibleEffects(node: any): boolean {
  return Array.isArray(node.effects)
    && node.effects.some((e: any) => e && e.visible !== false);
}

// Recursively: does any node in the subtree carry a non-linear gradient,
// a blend mode, or count toward "vector soup"? One pass, returns the tallies.
function scanSubtree(node: any, acc: { vec: number; nonLinear: boolean; blend: boolean }) {
  if (node.visible === false) return;

  if (VECTORISH.indexOf(node.type) !== -1) acc.vec++;

  const fills = node.fills;
  if (Array.isArray(fills)) {
    for (const f of fills) {
      if (!f || f.visible === false) continue;
      if (f.type === 'GRADIENT_RADIAL' || f.type === 'GRADIENT_ANGULAR' || f.type === 'GRADIENT_DIAMOND') {
        acc.nonLinear = true;
      }
    }
  }
  if (node.blendMode && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH') {
    acc.blend = true;
  }

  if ('children' in node) {
    for (const c of node.children) scanSubtree(c, acc);
  }
}

// Does this subtree contain interactive / data-bearing structure that must stay
// native? Buttons, inputs, or a repeated grid of frames each holding TEXT (cards).
// If so, we must NOT bake the whole container — descend and bake the small
// decorative pieces (glows, textures) deeper instead.
// Auto-grid detection: a container with 2+ similar card-frames (each holding
// text) is a reflowing grid. We tag it 'grid' so the Generator builds a
// ScrollingFrame + UIGridLayout automatically — no manual .scrollv needed.
function looksLikeGrid(node: any): boolean {
  if (!('children' in node) || !node.children) return false;
  let cardFrames = 0;
  let otherChildren = 0;
  let firstW = -1, firstH = -1, uniform = true;
  for (const c of node.children) {
    if (c.visible === false) continue;          // hidden children don't count
    const isCard = (c.type === 'FRAME' || c.type === 'COMPONENT' || c.type === 'INSTANCE')
        && (c.children || []).some((g: any) => g.type === 'TEXT');
    if (isCard) {
      cardFrames++;
      const w = c.width || 0, h = c.height || 0;
      if (firstW < 0) { firstW = w; firstH = h; }
      else if (Math.abs(w - firstW) > 4 || Math.abs(h - firstH) > 4) uniform = false;
    } else {
      otherChildren++;                          // header, close button, description panel, etc.
    }
  }
  // Only auto-grid a PURE grid: 2+ uniform cards AND no non-card siblings.
  // A mixed container (cards + a title / close button / description) must NOT be
  // gridded — UIGridLayout ignores Position and flows EVERY child, which would
  // scramble the non-card elements. Mixed containers keep their absolute
  // positions (accurate to Figma). Power users can still force a grid by naming
  // a dedicated card-only frame `.scrollv`.
  return cardFrames >= 2 && uniform && otherChildren === 0;
}

function subtreeHasStructure(node: any): boolean {
  // Count DIRECT children that look like repeated "cards": frames each holding text.
  // 2+ of them => a grid/list => keep the container native (bake the cards deeper).
  let cardFrames = 0;
  for (const c of (node.children || [])) {
    if ((c.type === 'FRAME' || c.type === 'COMPONENT' || c.type === 'INSTANCE')
        && (c.children || []).some((g: any) => g.type === 'TEXT')) {
      cardFrames++;
    }
    // explicit interactive prefixes anywhere among direct children => keep native
    const cp = parseLayerName(c.name);
    if (cp.prefixes.indexOf('scrollv') !== -1 || cp.prefixes.indexOf('scrollh') !== -1 ||
        cp.prefixes.indexOf('canvas')  !== -1) {
      return true;
    }
  }
  return cardFrames >= 2;
}

// Name-based button signal: layers literally called "...Button", "...Tab", "X", "Close", etc.
// These are clickable, decorative, and should bake AS an ImageButton (art baked, text native).
function nameLooksLikeButton(name: string): boolean {
  const s = (name || '').toLowerCase();
  return /\b(button|btn|tab|close|cross)\b/.test(s) || s.trim() === 'x';
}

// Name-based text-input signal: search bars and code/redeem fields. These should
// become a native TextBox (typeable), not a static TextLabel.
function nameLooksLikeInput(name: string): boolean {
  const s = (name || '').toLowerCase();
  return /\b(search|input|textbox|textfield|field)\b/.test(s)
      || /\benter\b.*\b(code|name|text)\b/.test(s)
      || /\bredeem\s*input\b/.test(s);
}

// Is this container a BUTTON (single clickable unit) rather than a GRID/LIST?
// Button  = has decoration/effects + at most a little text, NO nested card-frames.
// Grid    = contains 2+ sibling frames that each hold text (the cards) -> NOT a button.
function looksLikeButton(node: any, parsed: ParsedName): boolean {
  if (parsed.prefixes.indexOf('imagebutton') !== -1 || parsed.prefixes.indexOf('textbutton') !== -1) return true;
  if (!isContainer(node)) return false;
  if (nameLooksLikeButton(parsed.cleanName) || nameLooksLikeButton(node.name)) {
    // make sure it's not actually a grid container that happens to be named "...Buttons"
    let cardFrames = 0;
    for (const c of (node.children || [])) {
      if ((c.type === 'FRAME' || c.type === 'COMPONENT' || c.type === 'INSTANCE')
          && (c.children || []).some((g: any) => g.type === 'TEXT')) cardFrames++;
    }
    return cardFrames < 2;
  }
  return false;
}

// THE decision. serialiseNode AND collectImages must both call THIS one function,
// or the JSON and the PNGs disagree. Single source of truth.
function shouldRasterizeGroup(node: any, parsed: ParsedName, _ignored?: boolean): boolean {
  // manual overrides win
  if (parsed.prefixes.indexOf('native') !== -1 || parsed.prefixes.indexOf('keep') !== -1) return false;
  if (parsed.prefixes.indexOf('raster') !== -1 || parsed.prefixes.indexOf('bake')  !== -1) return true;

  if (!isContainer(node)) return false;
  if (node.id === __exportRootId) return false;   // never bake the export root (whole UI)

  // Scroll/canvas containers are NEVER baked (they must stay live ScrollingFrames).
  if (parsed.prefixes.indexOf('scrollv') !== -1 || parsed.prefixes.indexOf('scrollh') !== -1 ||
      parsed.prefixes.indexOf('canvas')  !== -1) return false;

  // A single labeled button bakes (art -> PNG, text extracted), regardless of size/effects.
  if (looksLikeButton(node, parsed)) return true;

  if (subtreeHasStructure(node)) return false;    // a real grid/list -> stay native, bake deeper

  if (hasVisibleEffects(node)) return true;       // glow / shadow / blur on the group

  const acc = { vec: 0, nonLinear: false, blend: false };
  scanSubtree(node, acc);
  if (acc.nonLinear) return true;                 // radial/angular/diamond gradient
  if (acc.blend) return true;                     // multiply/screen/etc
  if (acc.vec >= RASTER_VECTOR_THRESHOLD) return true;  // vector soup

  // Decorative-pile bake: a group whose DIRECT children are overwhelmingly plain,
  // text-less, childless shapes (RECTANGLE/VECTOR/ELLIPSE) is decoration, not
  // structure — bake it into one PNG instead of emitting dozens of loose shapes.
  // (This catches effect/backing stacks like a 27-rectangle "InnerStroke" pile
  // that hit none of the effect/gradient/vector triggers above.)
  const kids = (node.children || []).filter((c: any) => c && c.visible !== false);
  if (kids.length >= DECOR_PILE_THRESHOLD) {
    let plainShapes = 0, hasInteractive = false, hasText = false;
    for (const c of kids) {
      const isPlainShape =
        (c.type === 'RECTANGLE' || c.type === 'VECTOR' || c.type === 'ELLIPSE' ||
         c.type === 'LINE' || c.type === 'STAR' || c.type === 'POLYGON')
        && !(c.children && c.children.length);      // no nested content
      if (isPlainShape) plainShapes++;
      if (c.type === 'TEXT') hasText = true;
      const cp = parseLayerName(c.name || '');
      if (looksLikeButton(c, cp) || nameLooksLikeButton(c.name || '')) hasInteractive = true;
    }
    // Bake only if it's ALMOST ALL plain shapes, no text, and nothing clickable
    // inside — so we never flatten buttons or real content.
    if (!hasInteractive && !hasText && plainShapes / kids.length >= 0.85) return true;
  }

  return false;
}

// Text classification: can Roblox render this text faithfully as a TextLabel?
function textIsNativeSafe(t: any): boolean {
  const fills = t.fills;
  const plainFill = Array.isArray(fills) && fills.length === 1
                    && fills[0] && fills[0].type === 'SOLID' && fills[0].visible !== false;
  const noEffects   = !t.effects || t.effects.every((e: any) => !e || e.visible === false);
  const noRotation  = Math.abs(t.rotation || 0) < 0.5;
  const normalBlend = !t.blendMode || t.blendMode === 'NORMAL' || t.blendMode === 'PASS_THROUGH';
  const plainStroke = !t.strokes || t.strokes.length === 0 || (t.strokes[0] && t.strokes[0].type === 'SOLID');
  return plainFill && noEffects && noRotation && normalBlend && plainStroke;
}

// Build BloxigNode TextLabels for native-safe text, positioned relative to the
// baking group's top-left (so they overlay the PNG correctly).
function collectNativeSafeText(node: any, root: any, out: BloxigNode[]): void {
  if (node.visible === false) return;

  if (node.type === 'TEXT') {
    const p = parseLayerName(node.name);
    const forceKeep = p.prefixes.indexOf('keep') !== -1 || p.prefixes.indexOf('native') !== -1;
    const forceBake = p.prefixes.indexOf('bake') !== -1 || p.prefixes.indexOf('raster') !== -1;
    if (!forceBake && (forceKeep || textIsNativeSafe(node))) {
      const ra = root.absoluteBoundingBox, na = node.absoluteBoundingBox;
      const rx = ra && typeof ra.x === 'number' ? ra.x : 0;
      const ry = ra && typeof ra.y === 'number' ? ra.y : 0;
      const nx = na && typeof na.x === 'number' ? na.x : rx;
      const ny = na && typeof na.y === 'number' ? na.y : ry;
      out.push({
        id: node.id, name: p.cleanName, rawName: p.rawName, type: 'TEXT',
        x: nx - rx, y: ny - ry,
        width: node.width ?? 0, height: node.height ?? 0,
        visible: true, opacity: node.opacity ?? 1, rotation: node.rotation ?? 0,
        fills: normalizePaints(node.fills) as any,
        strokes: normalizePaints(node.strokes) as any,
        strokeWeight: node.strokeWeight ?? 0,
        characters: node.characters,
        fontSize: node.fontSize, fontName: node.fontName,
        textAlignHorizontal: node.textAlignHorizontal,
        textAlignVertical: node.textAlignVertical,
        children: []
      });
    }
    return;
  }

  if ('children' in node) {
    for (const c of node.children) collectNativeSafeText(c, root, out);
  }
}

// The actual TextNode refs to hide before baking (so they aren't drawn twice).
function collectNativeSafeTextNodes(node: any, root: any, out: any[]): void {
  if (node.visible === false) return;
  if (node.type === 'TEXT') {
    const p = parseLayerName(node.name);
    const forceKeep = p.prefixes.indexOf('keep') !== -1 || p.prefixes.indexOf('native') !== -1;
    const forceBake = p.prefixes.indexOf('bake') !== -1 || p.prefixes.indexOf('raster') !== -1;
    if (!forceBake && (forceKeep || textIsNativeSafe(node))) out.push(node);
    return;
  }
  if ('children' in node) {
    for (const c of node.children) collectNativeSafeTextNodes(c, root, out);
  }
}

// -- Node serialiser -------------------------------------------
// Returns null when the node is tagged .ignore (so it is skipped).
function serialiseNode(node: SceneNode, parentAbsX: number, parentAbsY: number): BloxigNode | null {
  const parsed = parseLayerName(node.name);
  if (parsed.isIgnored) return null;            // .ignore -> drop entirely

  const n = node as any;

  // ── Coordinate normalisation ──────────────────────────────────
  // Figma is inconsistent: children of a FRAME use parent-relative x/y,
  // but children of a GROUP/SECTION/COMPONENT_SET carry near-absolute
  // canvas coordinates. To make the JSON uniformly parent-relative
  // (which is what the Roblox Generator assumes), we derive position
  // from absoluteBoundingBox minus the parent's absolute origin.
  // Every node has absoluteBoundingBox; fall back to n.x/n.y if missing.
  let absX = parentAbsX, absY = parentAbsY;
  const abb = n.absoluteBoundingBox;
  if (abb && typeof abb.x === 'number') {
    absX = abb.x;
    absY = abb.y;
  } else if (typeof n.x === 'number') {
    // Fallback: treat n.x/n.y as already-absolute(ish)
    absX = parentAbsX + n.x;
    absY = parentAbsY + n.y;
  }
  const relX = absX - parentAbsX;
  const relY = absY - parentAbsY;

  const base: BloxigNode = {
    id:           node.id,
    name:         parsed.cleanName,             // clean Roblox-facing name
    rawName:      parsed.rawName,               // original, for Generator fallback
    type:         node.type,                    // REAL Figma type (not coerced)
    x:            relX,
    y:            relY,
    width:        n.width        ?? 0,
    height:       n.height       ?? 0,
    visible:      n.visible      ?? true,
    opacity:      n.opacity      ?? 1,
    rotation:     n.rotation     ?? 0,
    fills:        normalizePaints(n.fills) as any,
    strokes:      normalizePaints(n.strokes) as any,
    strokeWeight: n.strokeWeight ?? 0,
    children:     []
  };

  // The whole point of v1.3: hand the Generator a clean prefixes array.
  if (parsed.prefixes.length > 0) {
    base.prefixes = parsed.prefixes;
  }

  // Auto-tag reflowing card grids so the Generator makes a ScrollingFrame+UIGridLayout.
  if (looksLikeGrid(node)) {
    const pfx = base.prefixes ? base.prefixes.slice() : [];
    if (pfx.indexOf('grid') === -1) pfx.push('grid');
    base.prefixes = pfx;
  }


  // Image node? Assign a stable imageName so the Roblox linker can match the
  // uploaded PNG to this ImageLabel. (PNG bytes are collected separately.)
  const imgName = imageNameFor(node, parsed);
  if (imgName) {
    base.imageName = imgName;
    base.isRaster  = parsed.prefixes.indexOf('raster') !== -1 || undefined;
  }

  // ── AUTO-RASTERIZE: bake decorative/effect-heavy groups to one PNG ──────
  // shouldRasterizeGroup is the SINGLE source of truth (collectImages calls
  // the same fn). When baking: emit this node as an image, attach ONLY the
  // pulled-out native-safe text as children, and DO NOT recurse into the real
  // children — they live inside the PNG.
  if (shouldRasterizeGroup(node, parsed, false)) {
    base.imageName = base.imageName
      || (sanitiseForName(parsed.cleanName) + '_' + sanitiseForName(node.id));
    base.isRaster  = true;

    // Baked buttons become ImageButtons (clickable), not ImageLabels.
    if (looksLikeButton(node, parsed)) {
      const pfx = base.prefixes ? base.prefixes.slice() : [];
      if (pfx.indexOf('imagebutton') === -1) pfx.push('imagebutton');
      base.prefixes = pfx;
    }

    const keptText: BloxigNode[] = [];
    collectNativeSafeText(node, node, keptText);
    base.children = keptText;
    return base;   // stop here — children are baked into the image
  }

  // ── Interactive TYPING (non-baked path) ─────────────────────────────────
  // Give elements the right clickable/typeable Roblox class even when they're
  // NOT rasterized. The Generator already maps these prefixes:
  //   .imagebutton → ImageButton   .input → TextBox
  // (Baked buttons are already tagged imagebutton in the rasterize block above.)
  {
    const already = base.prefixes || [];
    const hasBtn  = already.indexOf('imagebutton') !== -1 || already.indexOf('textbutton') !== -1;
    const hasInput = already.indexOf('input') !== -1;

    // Detected button that didn't bake → make it a clickable ImageButton.
    if (!hasBtn && looksLikeButton(node, parsed)) {
      const pfx = already.slice();
      pfx.push('imagebutton');
      base.prefixes = pfx;
    }
    // Search / code-entry field → typeable TextBox.
    else if (!hasInput && nameLooksLikeInput(parsed.cleanName)) {
      const pfx = (base.prefixes || []).slice();
      pfx.push('input');
      base.prefixes = pfx;
    }
  }

  // Clipping — Figma frames clip their content by default. Export it so the
  // Roblox side can match (otherwise decorative/overflowing children spill out).
  if (typeof n.clipsContent === 'boolean') {
    base.clipsContent = n.clipsContent;
  } else if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    base.clipsContent = true;   // frames clip by default in Figma
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
      .map(c => serialiseNode(c, absX, absY))   // children are relative to THIS node's origin
      .filter((c): c is BloxigNode => c !== null);
  }

  return base;
}
