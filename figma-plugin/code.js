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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
figma.ui.onmessage = (rawMsg) => __awaiter(void 0, void 0, void 0, function* () {
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
        yield handleExport(msg.token);
    }
});
// -- Export handler --------------------------------------------
function handleExport(token) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
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
            yield loadAllFonts(node);
        }
        catch (err) {
            figma.ui.postMessage({ type: 'ERROR', message: 'Font loading failed: ' + String(err) });
            return;
        }
        figma.ui.postMessage({ type: 'PROGRESS', message: 'Serialising design...' });
        let serialised;
        try {
            serialised = serialiseNode(node);
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
        const payload = {
            version: '1.3.0',
            exportedAt: new Date().toISOString(),
            figmaFileKey: (_a = figma.fileKey) !== null && _a !== void 0 ? _a : 'local',
            figmaFileId: (_b = figma.fileKey) !== null && _b !== void 0 ? _b : 'local',
            frame: {
                id: node.id,
                name: frameName,
                width: frameW,
                height: frameH
            },
            nodes: serialised.children
        };
        figma.ui.postMessage({ type: 'PROGRESS', message: 'Sending to Bloxig server...' });
        try {
            const serverUrl = 'https://bloxig.onrender.com';
            const response = yield fetch(`${serverUrl}/api/export`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: frameName,
                    figma_file_id: (_c = figma.fileKey) !== null && _c !== void 0 ? _c : 'local',
                    json_layout_data: payload
                })
            });
            if (!response.ok) {
                const errData = yield response.json().catch(() => ({ error: 'Server error' }));
                figma.ui.postMessage({
                    type: 'ERROR',
                    message: `Export failed (${response.status}): ${errData.error || 'Unknown error'}`
                });
                return;
            }
            const result = yield response.json();
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
    });
}
// -- Font loader -----------------------------------------------
function loadAllFonts(node) {
    return __awaiter(this, void 0, void 0, function* () {
        const textNodes = [];
        collectTextNodes(node, textNodes);
        const uniqueFonts = new Map();
        for (const t of textNodes) {
            if (t.fontName !== figma.mixed) {
                const key = `${t.fontName.family}::${t.fontName.style}`;
                uniqueFonts.set(key, t.fontName);
            }
        }
        yield Promise.all([...uniqueFonts.values()].map(fn => figma.loadFontAsync(fn).catch(() => { })));
    });
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
// -- Node serialiser -------------------------------------------
// Returns null when the node is tagged .ignore (so it is skipped).
function serialiseNode(node) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    const parsed = parseLayerName(node.name);
    if (parsed.isIgnored)
        return null; // .ignore -> drop entirely
    const n = node;
    const base = {
        id: node.id,
        name: parsed.cleanName, // clean Roblox-facing name
        rawName: parsed.rawName, // original, for Generator fallback
        type: node.type, // REAL Figma type (not coerced)
        x: (_a = n.x) !== null && _a !== void 0 ? _a : 0,
        y: (_b = n.y) !== null && _b !== void 0 ? _b : 0,
        width: (_c = n.width) !== null && _c !== void 0 ? _c : 0,
        height: (_d = n.height) !== null && _d !== void 0 ? _d : 0,
        visible: (_e = n.visible) !== null && _e !== void 0 ? _e : true,
        opacity: (_f = n.opacity) !== null && _f !== void 0 ? _f : 1,
        rotation: (_g = n.rotation) !== null && _g !== void 0 ? _g : 0,
        fills: (_h = (n.fills !== figma.mixed ? n.fills : [])) !== null && _h !== void 0 ? _h : [],
        strokes: (_j = (n.strokes !== figma.mixed ? n.strokes : [])) !== null && _j !== void 0 ? _j : [],
        strokeWeight: (_k = n.strokeWeight) !== null && _k !== void 0 ? _k : 0,
        children: []
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
        base.layoutMode = n.layoutMode;
        base.itemSpacing = (_l = n.itemSpacing) !== null && _l !== void 0 ? _l : 0;
        base.paddingLeft = (_m = n.paddingLeft) !== null && _m !== void 0 ? _m : 0;
        base.paddingRight = (_o = n.paddingRight) !== null && _o !== void 0 ? _o : 0;
        base.paddingTop = (_p = n.paddingTop) !== null && _p !== void 0 ? _p : 0;
        base.paddingBottom = (_q = n.paddingBottom) !== null && _q !== void 0 ? _q : 0;
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
            .map(c => serialiseNode(c))
            .filter((c) => c !== null);
    }
    return base;
}
