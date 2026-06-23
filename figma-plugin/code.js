"use strict";
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
// -- Prefix vocabulary (canonical = what Generator understands) -
const PREFIX_SYNONYMS = {
    textbutton: 'textbutton',
    imagebutton: 'imagebutton',
    scrollv: 'scrollv',
    scrollh: 'scrollh',
    scrollxy: 'scrollv', // Generator has no BOTH -> vertical
    canvas: 'canvas',
    canvasgroup: 'canvas',
    raster: 'raster',
    input: 'input',
    textbox: 'input', // synonym
    viewport: 'viewport',
    parent: 'parent'
};
// -- parseLayerName --------------------------------------------
// "  .imagebutton .raster Close X "
//   -> { prefixes:[imagebutton,raster], cleanName:"Close X", isIgnored:false }
// Leading dot-tokens are prefixes; text after the last one is the name.
function parseLayerName(raw) {
    const out = {
        cleanName: 'Element', prefixes: [], isIgnored: false, rawName: raw || ''
    };
    if (!raw || raw.trim().length === 0)
        return out;
    const tokens = raw.trim().split(/\s+/);
    const seen = {};
    let i = 0;
    for (; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.charAt(0) !== '.')
            break; // first non-dot token = name start
        const key = tok.slice(1).toLowerCase();
        if (key === 'ignore') {
            out.isIgnored = true;
            continue;
        }
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
    width: 380,
    height: 520,
    title: 'Bloxig — Export to Roblox',
    themeColors: true
});
// -- Helper: build selection payload ---------------------------
function getSelectionPayload() {
    const sel = figma.currentPage.selection;
    const first = sel[0];
    const exportable = first && (first.type === 'FRAME' ||
        first.type === 'COMPONENT' ||
        first.type === 'COMPONENT_SET' ||
        first.type === 'SECTION' ||
        first.type === 'GROUP');
    return {
        hasSelection: sel.length > 0 && exportable,
        selectionName: exportable ? first.name : null,
        selectionType: first ? first.type : null,
        selectionCount: sel.length,
        notExportable: sel.length > 0 && !exportable
    };
}
// -- Send initial state to UI ----------------------------------
function sendInitialContext() {
    var _a, _b, _c, _d;
    const user = figma.currentUser;
    const sel = getSelectionPayload();
    figma.ui.postMessage({
        type: 'INIT',
        payload: Object.assign({ userName: (_a = user === null || user === void 0 ? void 0 : user.name) !== null && _a !== void 0 ? _a : 'Figma User', userId: (_b = user === null || user === void 0 ? void 0 : user.id) !== null && _b !== void 0 ? _b : null, userPhotoUrl: (_c = user === null || user === void 0 ? void 0 : user.photoUrl) !== null && _c !== void 0 ? _c : null, fileKey: (_d = figma.fileKey) !== null && _d !== void 0 ? _d : 'local' }, sel)
    });
}
sendInitialContext();
figma.on('selectionchange', () => {
    figma.ui.postMessage({
        type: 'SELECTION_CHANGED',
        payload: getSelectionPayload()
    });
});
figma.on('currentpagechange', () => {
    sendInitialContext();
});
// -- Message validation ----------------------------------------
function validateMessage(msg) {
    if (!msg || typeof msg !== 'object')
        return null;
    const m = msg;
    if (m.type === 'PING')
        return { type: 'PING' };
    if (m.type === 'CANCEL')
        return { type: 'CANCEL' };
    if (m.type === 'EXPORT_FRAME') {
        if (typeof m.token !== 'string' || m.token.trim().length === 0) {
            return null;
        }
        return { type: 'EXPORT_FRAME', token: m.token.trim() };
    }
    if (m.type === 'RESIZE') {
        if (typeof m.width !== 'number' || typeof m.height !== 'number')
            return null;
        return { type: 'RESIZE', width: m.width, height: m.height };
    }
    return null;
}
// -- Message handler -------------------------------------------
figma.ui.onmessage = async (rawMsg) => {
    const msg = validateMessage(rawMsg);
    if (!msg)
        return;
    if (msg.type === 'PING') {
        sendInitialContext();
        return;
    }
    if (msg.type === 'CANCEL') {
        figma.closePlugin();
        return;
    }
    if (msg.type === 'RESIZE') {
        figma.ui.resize(Math.max(320, Math.min(msg.width, 800)), Math.max(480, Math.min(msg.height, 900)));
        return;
    }
    if (msg.type === 'EXPORT_FRAME') {
        await handleExport(msg.token);
    }
};
// -- Export handler --------------------------------------------
async function handleExport(token) {
    var _a, _b, _c, _d, _e;
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
    const validTypes = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION', 'GROUP'];
    if (validTypes.indexOf(node.type) === -1) {
        figma.ui.postMessage({
            type: 'ERROR',
            message: `Cannot export a ${node.type}. Please select a Frame or Component.`
        });
        return;
    }
    figma.ui.postMessage({ type: 'PROGRESS', message: 'Loading fonts...' });
    try {
        await loadAllFonts(node);
    }
    catch (err) {
        figma.ui.postMessage({ type: 'ERROR', message: 'Font loading failed: ' + String(err) });
        return;
    }
    figma.ui.postMessage({ type: 'PROGRESS', message: 'Serialising design...' });
    let serialised;
    try {
        // Seed the recursion with the root frame's own absolute origin, so its
        // direct children come out relative to the frame's top-left (0,0).
        const rootAbb = node.absoluteBoundingBox;
        const rootAbsX = rootAbb && typeof rootAbb.x === 'number' ? rootAbb.x : ((_a = node.x) !== null && _a !== void 0 ? _a : 0);
        const rootAbsY = rootAbb && typeof rootAbb.y === 'number' ? rootAbb.y : ((_b = node.y) !== null && _b !== void 0 ? _b : 0);
        serialised = serialiseNode(node, rootAbsX, rootAbsY);
    }
    catch (err) {
        figma.ui.postMessage({ type: 'ERROR', message: 'Serialisation failed: ' + String(err) });
        return;
    }
    if (!serialised) {
        figma.ui.postMessage({ type: 'ERROR', message: 'Selected frame is tagged .ignore — nothing to export.' });
        return;
    }
    const frameW = 'width' in node ? node.width : 100;
    const frameH = 'height' in node ? node.height : 100;
    const frameName = parseLayerName(node.name).cleanName;
    // -- Collect image PNGs ----------------------------------------
    // Walk the tree; for every node that got an imageName, render it to PNG
    // bytes (base64) so the user can upload them to Roblox. Keyed by imageName.
    figma.ui.postMessage({ type: 'PROGRESS', message: 'Rendering images...' });
    const images = {};
    try {
        await collectImages(node, images);
    }
    catch (err) {
        // Non-fatal: export still works, images just won't be bundled.
        figma.ui.postMessage({ type: 'PROGRESS', message: 'Image render skipped: ' + String(err) });
    }
    const payload = {
        version: '1.4.0',
        exportedAt: new Date().toISOString(),
        figmaFileKey: (_c = figma.fileKey) !== null && _c !== void 0 ? _c : 'local',
        figmaFileId: (_d = figma.fileKey) !== null && _d !== void 0 ? _d : 'local',
        frame: {
            id: node.id,
            name: frameName,
            width: frameW,
            height: frameH
        },
        nodes: serialised.children,
        images: images // { imageName: base64PNG }
    };
    figma.ui.postMessage({ type: 'PROGRESS', message: 'Sending to Bloxig server...' });
    try {
        const serverUrl = 'https://bloxig.onrender.com';
        const response = await fetch(`${serverUrl}/api/export`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: frameName,
                figma_file_id: (_e = figma.fileKey) !== null && _e !== void 0 ? _e : 'local',
                figma_frame_id: node.id,
                json_layout_data: payload
            })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: 'Server error' }));
            figma.ui.postMessage({
                type: 'ERROR',
                message: `Export failed (${response.status}): ${errData.error || 'Unknown error'}`
            });
            return;
        }
        const result = await response.json();
        figma.ui.postMessage({
            type: 'SUCCESS',
            message: `"${frameName}" exported successfully!`,
            projectId: result.project_id
        });
    }
    catch (err) {
        figma.ui.postMessage({
            type: 'ERROR',
            message: 'Cannot reach Bloxig server. Check your internet connection.'
        });
    }
}
// -- Font loader -----------------------------------------------
async function loadAllFonts(node) {
    const textNodes = [];
    collectTextNodes(node, textNodes);
    const uniqueFonts = new Map();
    for (const t of textNodes) {
        if (t.fontName !== figma.mixed) {
            const key = `${t.fontName.family}::${t.fontName.style}`;
            uniqueFonts.set(key, t.fontName);
        }
    }
    await Promise.all([...uniqueFonts.values()].map(fn => figma.loadFontAsync(fn).catch(() => { })));
}
function collectTextNodes(node, result) {
    if (node.type === 'TEXT') {
        result.push(node);
    }
    else if ('children' in node) {
        for (const child of node.children) {
            collectTextNodes(child, result);
        }
    }
}
// -- Image collector -------------------------------------------
// Walks the tree; every node that qualifies as an image (IMAGE fill or .raster)
// is rendered to a PNG via exportAsync and stored as base64, keyed by the same
// imageName the serialiser assigned (so the Roblox linker can match them).
async function collectImages(node, out) {
    if (node.visible === false)
        return;
    const parsed = parseLayerName(node.name);
    if (parsed.isIgnored)
        return;
    const imgName = imageNameFor(node, parsed);
    if (imgName && !out[imgName]) {
        try {
            const bytes = await node.exportAsync({
                format: 'PNG',
                constraint: { type: 'SCALE', value: 2 } // 2x for crisp upscaling
            });
            out[imgName] = figma.base64Encode(bytes);
        }
        catch (e) {
            // skip this image; non-fatal
        }
    }
    if ('children' in node) {
        for (const child of node.children) {
            await collectImages(child, out);
        }
    }
}
// Convert Figma's gradientTransform (2x3 affine matrix) into a rotation angle.
// The gradient direction is the first row of the transform; Roblox UIGradient
// uses degrees, but we emit radians and let the Lua convert (math.deg).
function gradientTransformToAngle(t) {
    if (!t || !t[0])
        return 0;
    // t = [[a, b, tx], [c, d, ty]] — direction vector is (a, b)
    const a = t[0][0];
    const b = t[0][1];
    return Math.atan2(b, a); // radians
}
function normalizePaint(paint) {
    if (!paint)
        return null;
    if (paint.visible === false)
        return null;
    const opacity = paint.opacity == null ? 1 : paint.opacity;
    if (paint.type === 'SOLID') {
        const c = paint.color || { r: 1, g: 1, b: 1 };
        return {
            type: 'SOLID',
            color: { r: c.r, g: c.g, b: c.b, a: opacity } // fold opacity into alpha
        };
    }
    if (paint.type === 'GRADIENT_LINEAR' || paint.type === 'GRADIENT_RADIAL' ||
        paint.type === 'GRADIENT_ANGULAR' || paint.type === 'GRADIENT_DIAMOND') {
        const stops = (paint.gradientStops || []).map((st) => ({
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
function normalizePaints(paints) {
    if (!paints || paints === figma.mixed || !Array.isArray(paints))
        return [];
    const out = [];
    for (const p of paints) {
        const n = normalizePaint(p);
        if (n)
            out.push(n);
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
function sanitiseForName(s) {
    return (s || '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function nodeHasImageFill(n) {
    const fills = n.fills;
    if (!fills || fills === figma.mixed || !Array.isArray(fills))
        return false;
    return fills.some((f) => f && f.type === 'IMAGE' && f.visible !== false);
}
// Returns the imageName to assign, or null if this node isn't an image node.
function imageNameFor(node, parsed) {
    const n = node;
    const isRaster = parsed.prefixes.indexOf('raster') !== -1;
    if (isRaster || nodeHasImageFill(n)) {
        return sanitiseForName(parsed.cleanName) + '_' + sanitiseForName(node.id);
    }
    return null;
}
// -- Node serialiser -------------------------------------------
// Returns null when the node is tagged .ignore (so it is skipped).
function serialiseNode(node, parentAbsX, parentAbsY) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const parsed = parseLayerName(node.name);
    if (parsed.isIgnored)
        return null; // .ignore -> drop entirely
    const n = node;
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
    }
    else if (typeof n.x === 'number') {
        // Fallback: treat n.x/n.y as already-absolute(ish)
        absX = parentAbsX + n.x;
        absY = parentAbsY + n.y;
    }
    const relX = absX - parentAbsX;
    const relY = absY - parentAbsY;
    const base = {
        id: node.id,
        name: parsed.cleanName, // clean Roblox-facing name
        rawName: parsed.rawName, // original, for Generator fallback
        type: node.type, // REAL Figma type (not coerced)
        x: relX,
        y: relY,
        width: (_a = n.width) !== null && _a !== void 0 ? _a : 0,
        height: (_b = n.height) !== null && _b !== void 0 ? _b : 0,
        visible: (_c = n.visible) !== null && _c !== void 0 ? _c : true,
        opacity: (_d = n.opacity) !== null && _d !== void 0 ? _d : 1,
        rotation: (_e = n.rotation) !== null && _e !== void 0 ? _e : 0,
        fills: normalizePaints(n.fills),
        strokes: normalizePaints(n.strokes),
        strokeWeight: (_f = n.strokeWeight) !== null && _f !== void 0 ? _f : 0,
        children: []
    };
    // The whole point of v1.3: hand the Generator a clean prefixes array.
    if (parsed.prefixes.length > 0) {
        base.prefixes = parsed.prefixes;
    }
    // Image node? Assign a stable imageName so the Roblox linker can match the
    // uploaded PNG to this ImageLabel. (PNG bytes are collected separately.)
    const imgName = imageNameFor(node, parsed);
    if (imgName) {
        base.imageName = imgName;
        base.isRaster = parsed.prefixes.indexOf('raster') !== -1 || undefined;
    }
    // Clipping — Figma frames clip their content by default. Export it so the
    // Roblox side can match (otherwise decorative/overflowing children spill out).
    if (typeof n.clipsContent === 'boolean') {
        base.clipsContent = n.clipsContent;
    }
    else if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
        base.clipsContent = true; // frames clip by default in Figma
    }
    // Corner radius
    if (n.cornerRadius !== undefined && n.cornerRadius !== figma.mixed) {
        base.cornerRadius = n.cornerRadius;
    }
    // Auto layout
    if (n.layoutMode && n.layoutMode !== 'NONE') {
        base.layoutMode = n.layoutMode;
        base.itemSpacing = (_g = n.itemSpacing) !== null && _g !== void 0 ? _g : 0;
        base.paddingLeft = (_h = n.paddingLeft) !== null && _h !== void 0 ? _h : 0;
        base.paddingRight = (_j = n.paddingRight) !== null && _j !== void 0 ? _j : 0;
        base.paddingTop = (_k = n.paddingTop) !== null && _k !== void 0 ? _k : 0;
        base.paddingBottom = (_l = n.paddingBottom) !== null && _l !== void 0 ? _l : 0;
    }
    // Text properties
    if (node.type === 'TEXT') {
        const t = node;
        base.characters = t.characters;
        if (t.fontSize !== figma.mixed)
            base.fontSize = t.fontSize;
        if (t.fontName !== figma.mixed)
            base.fontName = t.fontName;
        if (t.textAlignHorizontal)
            base.textAlignHorizontal = t.textAlignHorizontal;
        if (t.textAlignVertical)
            base.textAlignVertical = t.textAlignVertical;
    }
    // Recurse children (skip invisible + skip .ignore via null filtering)
    if ('children' in node) {
        base.children = node.children
            .filter(c => c.visible !== false)
            .map(c => serialiseNode(c, absX, absY)) // children are relative to THIS node's origin
            .filter((c) => c !== null);
    }
    return base;
}
