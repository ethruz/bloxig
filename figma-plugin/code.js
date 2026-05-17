"use strict";
// ============================================================
// Bloxig Figma Plugin — code.ts
// Runs in Figma's sandbox. Has access to figma.* API.
// NEVER has access to the DOM or window.
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
// ── Open the plugin UI ────────────────────────────────────
figma.showUI(__html__, {
    width: 360,
    height: 480,
    title: 'Bloxig — Export to Roblox',
    themeColors: true
});
// ── Send initial context to UI ────────────────────────────
function sendInitialContext() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const user = figma.currentUser;
        const selection = figma.currentPage.selection;
        figma.ui.postMessage({
            type: 'INIT',
            payload: {
                userName: (_a = user === null || user === void 0 ? void 0 : user.name) !== null && _a !== void 0 ? _a : 'Unknown',
                userId: (_b = user === null || user === void 0 ? void 0 : user.id) !== null && _b !== void 0 ? _b : null,
                userPhotoUrl: (_c = user === null || user === void 0 ? void 0 : user.photoUrl) !== null && _c !== void 0 ? _c : null,
                hasSelection: selection.length > 0,
                selectionName: selection.length === 1 ? selection[0].name : null,
                selectionCount: selection.length,
                fileKey: (_d = figma.fileKey) !== null && _d !== void 0 ? _d : 'local'
            }
        });
    });
}
sendInitialContext();
// ── Selection change listener ─────────────────────────────
figma.on('selectionchange', () => {
    const selection = figma.currentPage.selection;
    figma.ui.postMessage({
        type: 'SELECTION_CHANGED',
        payload: {
            hasSelection: selection.length > 0,
            selectionName: selection.length === 1 ? selection[0].name : null,
            selectionCount: selection.length
        }
    });
});
// ── Message validation ────────────────────────────────────
function validateMessage(msg) {
    if (!msg || typeof msg !== 'object')
        return null;
    const m = msg;
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
        if (typeof m.width !== 'number' || typeof m.height !== 'number')
            return null;
        return { type: 'RESIZE', width: m.width, height: m.height };
    }
    return null;
}
// ── Main message handler ──────────────────────────────────
figma.ui.onmessage = (rawMsg) => __awaiter(void 0, void 0, void 0, function* () {
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
        figma.ui.resize(Math.max(300, Math.min(msg.width, 800)), Math.max(400, Math.min(msg.height, 900)));
        return;
    }
    if (msg.type === 'EXPORT_FRAME') {
        yield handleExport(msg.token);
    }
});
// ── Export handler ────────────────────────────────────────
function handleExport(token) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
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
            yield loadAllFonts(node);
        }
        catch (err) {
            figma.ui.postMessage({ type: 'ERROR', message: 'Font loading failed: ' + String(err) });
            return;
        }
        figma.ui.postMessage({ type: 'PROGRESS', message: 'Serialising frame...' });
        let serialised;
        try {
            serialised = serialiseNode(node);
        }
        catch (err) {
            figma.ui.postMessage({ type: 'ERROR', message: 'Serialisation failed: ' + String(err) });
            return;
        }
        const payload = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            figmaFileKey: (_a = figma.fileKey) !== null && _a !== void 0 ? _a : 'local',
            figmaFileId: (_b = figma.fileKey) !== null && _b !== void 0 ? _b : 'local',
            frame: {
                id: node.id,
                name: node.name,
                width: 'width' in node ? node.width : 0,
                height: 'height' in node ? node.height : 0
            },
            nodes: serialised.children
        };
        figma.ui.postMessage({ type: 'PROGRESS', message: 'Sending to Bloxig server...' });
        // Send to server
        try {
            const response = yield fetch('http://localhost:3000/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: node.name,
                    figma_file_id: (_c = figma.fileKey) !== null && _c !== void 0 ? _c : 'local',
                    json_layout_data: payload
                })
            });
            if (!response.ok) {
                const err = yield response.json().catch(() => ({ error: 'Unknown server error' }));
                figma.ui.postMessage({ type: 'ERROR', message: (_d = err.error) !== null && _d !== void 0 ? _d : 'Export failed.' });
                return;
            }
            const result = yield response.json();
            figma.ui.postMessage({
                type: 'SUCCESS',
                message: `"${node.name}" exported successfully!`,
                projectId: result.project_id
            });
        }
        catch (err) {
            figma.ui.postMessage({
                type: 'ERROR',
                message: 'Could not reach Bloxig server. Is it running on localhost:3000?'
            });
        }
    });
}
// ── Font loader — collects all text nodes and loads fonts ─
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
            else {
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
        yield Promise.all([...uniqueFonts.values()].map(fn => figma.loadFontAsync(fn)));
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
// ── Node serialiser ───────────────────────────────────────
function serialiseNode(node) {
    const base = {
        id: node.id,
        name: node.name,
        type: node.type,
        x: 'x' in node ? node.x : 0,
        y: 'y' in node ? node.y : 0,
        width: 'width' in node ? node.width : 0,
        height: 'height' in node ? node.height : 0,
        visible: 'visible' in node ? node.visible : true,
        opacity: 'opacity' in node ? node.opacity : 1,
        fills: 'fills' in node && node.fills !== figma.mixed
            ? [...node.fills] : [],
        strokes: 'strokes' in node && node.strokes !== figma.mixed
            ? [...node.strokes] : [],
        children: []
    };
    // Corner radius
    if ('cornerRadius' in node && node.cornerRadius !== figma.mixed) {
        base.cornerRadius = node.cornerRadius;
    }
    // Text properties
    if (node.type === 'TEXT') {
        const t = node;
        base.characters = t.characters;
        if (t.fontName !== figma.mixed)
            base.fontName = t.fontName;
        if (t.fontSize !== figma.mixed)
            base.fontSize = t.fontSize;
    }
    // Recurse children
    if ('children' in node) {
        base.children = node.children
            .filter(c => c.visible)
            .map(c => serialiseNode(c));
    }
    return base;
}
