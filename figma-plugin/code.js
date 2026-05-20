"use strict";
// ============================================================
// Bloxig Figma Plugin — code.js  v1.2 (Fixed + Compiled)
// ============================================================

figma.showUI(__html__, {
  width: 380,
  height: 520,
  title: "Bloxig — Export to Roblox",
  themeColors: true,
});

function getSelectionPayload() {
  const sel = figma.currentPage.selection;
  const first = sel[0];
  const exportable =
    first &&
    (first.type === "FRAME" ||
      first.type === "COMPONENT" ||
      first.type === "COMPONENT_SET" ||
      first.type === "SECTION" ||
      first.type === "GROUP");
  return {
    hasSelection: sel.length > 0 && !!exportable,
    selectionName: exportable ? first.name : null,
    selectionType: first ? first.type : null,
    selectionCount: sel.length,
    notExportable: sel.length > 0 && !exportable,
  };
}

function sendInitialContext() {
  const user = figma.currentUser;
  const sel = getSelectionPayload();
  figma.ui.postMessage({
    type: "INIT",
    payload: {
      userName: (user && user.name) || "Figma User",
      userId: (user && user.id) || null,
      userPhotoUrl: (user && user.photoUrl) || null,
      fileKey: figma.fileKey || "local",
      hasSelection: sel.hasSelection,
      selectionName: sel.selectionName,
      selectionType: sel.selectionType,
      selectionCount: sel.selectionCount,
      notExportable: sel.notExportable,
    },
  });
}

sendInitialContext();

figma.on("selectionchange", function () {
  figma.ui.postMessage({
    type: "SELECTION_CHANGED",
    payload: getSelectionPayload(),
  });
});

figma.on("currentpagechange", function () {
  sendInitialContext();
});

function validateMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  if (msg.type === "PING") return { type: "PING" };
  if (msg.type === "CANCEL") return { type: "CANCEL" };
  if (msg.type === "EXPORT_FRAME") {
    if (typeof msg.token !== "string" || msg.token.trim().length === 0)
      return null;
    return { type: "EXPORT_FRAME", token: msg.token.trim() };
  }
  if (msg.type === "RESIZE") {
    if (typeof msg.width !== "number" || typeof msg.height !== "number")
      return null;
    return { type: "RESIZE", width: msg.width, height: msg.height };
  }
  return null;
}

figma.ui.onmessage = async function (rawMsg) {
  const msg = validateMessage(rawMsg);
  if (!msg) return;

  if (msg.type === "PING") {
    sendInitialContext();
    return;
  }
  if (msg.type === "CANCEL") {
    figma.closePlugin();
    return;
  }
  if (msg.type === "RESIZE") {
    figma.ui.resize(
      Math.max(320, Math.min(msg.width, 800)),
      Math.max(480, Math.min(msg.height, 900))
    );
    return;
  }
  if (msg.type === "EXPORT_FRAME") {
    await handleExport(msg.token);
  }
};

async function handleExport(token) {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: "ERROR", message: "Please select a frame first." });
    return;
  }
  if (selection.length > 1) {
    figma.ui.postMessage({ type: "ERROR", message: "Select only one frame at a time." });
    return;
  }

  const node = selection[0];
  const validTypes = ["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION", "GROUP"];
  if (!validTypes.includes(node.type)) {
    figma.ui.postMessage({
      type: "ERROR",
      message: "Cannot export a " + node.type + ". Please select a Frame or Component.",
    });
    return;
  }

  figma.ui.postMessage({ type: "PROGRESS", message: "Loading fonts..." });

  try {
    await loadAllFonts(node);
  } catch (err) {
    figma.ui.postMessage({ type: "ERROR", message: "Font loading failed: " + String(err) });
    return;
  }

  figma.ui.postMessage({ type: "PROGRESS", message: "Serialising design..." });

  let serialised;
  try {
    serialised = serialiseNode(node);
  } catch (err) {
    figma.ui.postMessage({ type: "ERROR", message: "Serialisation failed: " + String(err) });
    return;
  }

  const frameW = "width" in node ? node.width : 100;
  const frameH = "height" in node ? node.height : 100;

  const payload = {
    version: "1.2.0",
    exportedAt: new Date().toISOString(),
    figmaFileKey: figma.fileKey || "local",
    figmaFileId: figma.fileKey || "local",
    frame: {
      id: node.id,
      name: node.name,
      width: frameW,
      height: frameH,
    },
    nodes: serialised.children,
  };

  figma.ui.postMessage({ type: "PROGRESS", message: "Sending to Bloxig server..." });

  try {
    const response = await fetch("https://bloxig.onrender.com/api/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        name: node.name,
        figma_file_id: figma.fileKey || "local",
        json_layout_data: payload,
      }),
    });

    if (!response.ok) {
      let errMsg = "Server error";
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch (_) {}
      figma.ui.postMessage({
        type: "ERROR",
        message: "Export failed (" + response.status + "): " + errMsg,
      });
      return;
    }

    const result = await response.json();
    figma.ui.postMessage({
      type: "SUCCESS",
      message: '"' + node.name + '" exported successfully!',
      projectId: result.project_id,
    });
  } catch (err) {
    figma.ui.postMessage({
      type: "ERROR",
      message: "Cannot reach Bloxig server. Check your internet connection.",
    });
  }
}

// ── FIXED: removed extra spread operator that caused crash with multiple fonts
async function loadAllFonts(node) {
  const textNodes = [];
  collectTextNodes(node, textNodes);

  const uniqueFonts = new Map();
  for (const t of textNodes) {
    if (t.fontName !== figma.mixed) {
      const key = t.fontName.family + "::" + t.fontName.style;
      uniqueFonts.set(key, t.fontName);
    }
  }

  await Promise.all(
    [...uniqueFonts.values()].map(function (fn) {
      return figma.loadFontAsync(fn).catch(function () {});
    })
  );
}

function collectTextNodes(node, result) {
  if (node.type === "TEXT") {
    result.push(node);
  } else if ("children" in node) {
    for (const child of node.children) {
      collectTextNodes(child, result);
    }
  }
}

function serialiseNode(node) {
  const n = node;

  const base = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: n.x || 0,
    y: n.y || 0,
    width: n.width || 0,
    height: n.height || 0,
    visible: n.visible !== undefined ? n.visible : true,
    opacity: n.opacity !== undefined ? n.opacity : 1,
    rotation: n.rotation || 0,
    fills: n.fills !== figma.mixed ? n.fills || [] : [],
    strokes: n.strokes !== figma.mixed ? n.strokes || [] : [],
    strokeWeight: n.strokeWeight || 0,
    children: [],
  };

  if (n.cornerRadius !== undefined && n.cornerRadius !== figma.mixed) {
    base.cornerRadius = n.cornerRadius;
  }

  if (n.layoutMode && n.layoutMode !== "NONE") {
    base.layoutMode = n.layoutMode;
    base.itemSpacing = n.itemSpacing || 0;
    base.paddingLeft = n.paddingLeft || 0;
    base.paddingRight = n.paddingRight || 0;
    base.paddingTop = n.paddingTop || 0;
    base.paddingBottom = n.paddingBottom || 0;
  }

  if (node.type === "TEXT") {
    base.characters = node.characters;
    if (node.fontSize !== figma.mixed) base.fontSize = node.fontSize;
    if (node.fontName !== figma.mixed) base.fontName = node.fontName;
    if (node.textAlignHorizontal) base.textAlignHorizontal = node.textAlignHorizontal;
  }

  if ("children" in node) {
    base.children = node.children
      .filter(function (c) { return c.visible !== false; })
      .map(function (c) { return serialiseNode(c); });
  }

  return base;
}