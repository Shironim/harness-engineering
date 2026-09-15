const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/**
 * Universal path normalization (POSIX format, lowercased drive letter for Windows).
 * Guarantees consistent comparisons across Ubuntu and Windows.
 */
function normalizePath(p) {
  if (!p) return '';
  let n = p.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(n)) {
    n = n.charAt(0).toLowerCase() + n.slice(1);
  }
  return n.replace(/\/+$/, '');
}

/**
 * Checks if target path is inside or equal to parent path in a platform-agnostic manner.
 */
function isPathInside(target, parent) {
  let normTarget = normalizePath(target);
  let normParent = normalizePath(parent);
  if (!normTarget || !normParent) return false;

  // Paths with Windows drive letters are case-insensitive
  if (/^[a-z]:/i.test(normTarget) && /^[a-z]:/i.test(normParent)) {
    normTarget = normTarget.toLowerCase();
    normParent = normParent.toLowerCase();
  }

  return normTarget === normParent || normTarget.startsWith(normParent + '/');
}

/**
 * Mengambil turn interaksi terbaru dari user beserta step-step setelahnya secara aman.
 * Menelusuri transkrip dari baris terakhir untuk menemukan USER_INPUT tanpa batas baris kaku.
 */
function getLatestUserTurn(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { stepIndex: 0, content: '', turnSteps: [] };
  }

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.replace(/\r\n/g, '\n').trim().split('\n');
    if (lines.length === 0) return { stepIndex: 0, content: '', turnSteps: [] };

    let userIndex = -1;
    let userStep = null;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.includes('"USER_INPUT"') || line.includes('"type":"USER_INPUT"')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'USER_INPUT') {
            userIndex = i;
            userStep = parsed;
            break;
          }
        } catch (_) {}
      }
    }

    if (userIndex === -1 || !userStep) {
      return { stepIndex: 0, content: '', turnSteps: [] };
    }

    const turnSteps = [];
    for (let i = userIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        turnSteps.push(JSON.parse(line));
      } catch (_) {}
    }

    return {
      stepIndex: userStep.step_index,
      content: userStep.content || '',
      turnSteps
    };
  } catch (_) {
    return { stepIndex: 0, content: '', turnSteps: [] };
  }
}

/**
 * Menghitung berapa kali investigasi/search tool dipanggil dalam turn user saat ini.
 */
function countCurrentTurnInvestigations(transcriptPath) {
  const userTurn = getLatestUserTurn(transcriptPath);
  let count = 0;
  const searchTools = new Set(['grep_search', 'find_by_name']);
  const searchMcpTools = new Set([
    'find_code', 'search_code', 'search_notes', 'ctx_search', 'get_file_contents'
  ]);

  for (const step of userTurn.turnSteps) {
    if (step.tool_calls && Array.isArray(step.tool_calls)) {
      for (const call of step.tool_calls) {
        if (searchTools.has(call.name)) {
          count++;
        } else if (call.name === 'call_mcp_tool') {
          const args = call.args || {};
          const tool = args.ToolName || '';
          if (searchMcpTools.has(tool)) {
            count++;
          }
        }
      }
    }
  }

  return {
    count,
    latestUserPrompt: userTurn.content
  };
}

/**
 * Menghitung metrik view_file pada file source code dalam turn saat ini.
 * Mengembalikan total pemanggilan, pemanggilan untuk file tertentu, dan total akumulasi baris yang dibaca.
 */
function countCurrentTurnViewFiles(transcriptPath, targetNormalizedPath = '', activeWorkspace = '') {
  const userTurn = getLatestUserTurn(transcriptPath);
  let count = 0;
  let specificFileCount = 0;
  let totalLinesRead = 0;

  for (const step of userTurn.turnSteps) {
    if (step.tool_calls && Array.isArray(step.tool_calls)) {
      for (const call of step.tool_calls) {
        if (call.name === 'view_file') {
          const args = call.args || {};
          const path = normalizePath(args.AbsolutePath || args.absolutePath || '');
          
          const isConfig =
            /\/mcp\/.*\.json$/i.test(path) ||
            /\.(ya?ml|toml|ini|env|env\.[a-z0-9_.-]+)$/i.test(path) ||
            /(package|composer|tsconfig|vite\.config|webpack\.config|tailwind\.config)\.(json|js|ts|cjs|mjs)$/i.test(path) ||
            /\/(skills|\.agents|config|rules|hooks|builtin)\/.*$/i.test(path);
          if (isConfig) continue;

          if (/\.json$/i.test(path)) {
            try {
              if (fs.existsSync(path) && fs.statSync(path).size <= 15360) {
                continue;
              }
            } catch (_) {}
          }

          const isDoc = /\.(md|mdx|txt|rst)$/i.test(path);
          const wsList = Array.isArray(activeWorkspace) ? activeWorkspace : (activeWorkspace ? [activeWorkspace] : []);
          const isDocInsideWorkspace = isDoc && wsList.some(ws => isPathInside(path, ws));
          if (isDocInsideWorkspace) continue; // internal workspace docs are exempt from quotas

          // Count restricted targets: source code and external docs
          count++;
          if (targetNormalizedPath && path === targetNormalizedPath) {
            specificFileCount++;
          }
          if (args.StartLine !== undefined && args.EndLine !== undefined) {
            const start = Number(args.StartLine);
            const end = Number(args.EndLine);
            if (!isNaN(start) && !isNaN(end) && end >= start) {
              totalLinesRead += (end - start + 1);
            }
          }
        }
      }
    }
  }

  return {
    count,
    specificFileCount,
    totalLinesRead,
    latestUserPrompt: userTurn.content
  };
}

function getDenialStateFile(transcriptPath) {
  const tmpDir = os.tmpdir();
  if (!transcriptPath) return path.join(tmpDir, 'agy_turn_denials_default.json');
  const hash = crypto.createHash('md5').update(transcriptPath).digest('hex').slice(0, 16);
  return path.join(tmpDir, `agy_turn_denials_${hash}.json`);
}

function getDenialState(transcriptPath, userStepIndex) {
  const filePath = getDenialStateFile(transcriptPath);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data.userStepIndex === userStepIndex) {
        return data;
      }
    }
  } catch (_) {}
  return { userStepIndex, denyCount: 0 };
}

function saveDenialState(transcriptPath, state) {
  const filePath = getDenialStateFile(transcriptPath);
  try {
    fs.writeFileSync(filePath, JSON.stringify(state), 'utf-8');
  } catch (_) {}
}

/**
 * Memeriksa apakah Circuit Breaker aktif (sudah mencapai batas penolakan berulang dalam 1 turn).
 */
function isCircuitBreakerTripped(transcriptPath, maxDenials = 3) {
  if (!transcriptPath) return false;
  const userTurn = getLatestUserTurn(transcriptPath);
  const state = getDenialState(transcriptPath, userTurn.stepIndex);
  return state.denyCount >= maxDenials;
}

/**
 * Mencatat penolakan baru dalam turn aktif.
 */
function recordTurnDenial(transcriptPath) {
  if (!transcriptPath) return 1;
  const userTurn = getLatestUserTurn(transcriptPath);
  const state = getDenialState(transcriptPath, userTurn.stepIndex);
  state.denyCount = (state.denyCount || 0) + 1;
  saveDenialState(transcriptPath, state);
  return state.denyCount;
}

/**
 * Menghitung berapa kali context-mode (ctx_execute) dipanggil dalam turn user saat ini.
 */
function countCurrentTurnContextMode(transcriptPath) {
  const userTurn = getLatestUserTurn(transcriptPath);
  let count = 0;
  for (const step of userTurn.turnSteps) {
    if (step.tool_calls && Array.isArray(step.tool_calls)) {
      for (const call of step.tool_calls) {
        if (call.name === 'call_mcp_tool') {
          const args = call.args || {};
          const server = (args.ServerName || '').toLowerCase();
          const tool = (args.ToolName || '').toLowerCase();
          if (server === 'context-mode' || tool.startsWith('ctx_')) {
            count++;
          }
        }
      }
    }
  }

  return {
    count,
    latestUserPrompt: userTurn.content
  };
}

module.exports = {
  normalizePath,
  isPathInside,
  getLatestUserTurn,
  countCurrentTurnInvestigations,
  countCurrentTurnViewFiles,
  countCurrentTurnContextMode,
  isCircuitBreakerTripped,
  recordTurnDenial
};


