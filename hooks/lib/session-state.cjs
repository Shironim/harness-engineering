const fs = require('fs');

/**
 * Membaca N baris terakhir dari file transcript.
 */
function readLastLines(filePath, maxLines = 150) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    return lines.slice(-maxLines);
  } catch (err) {
    return [];
  }
}

/**
 * Mengambil turn interaksi terbaru dari user beserta step-step setelahnya.
 */
function getLatestUserTurn(transcriptPath) {
  if (!transcriptPath) return { stepIndex: 0, content: '', turnSteps: [] };

  const lines = readLastLines(transcriptPath, 150);
  const steps = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      steps.push(JSON.parse(line));
    } catch (_) {}
  }

  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].type === 'USER_INPUT') {
      return {
        stepIndex: steps[i].step_index,
        content: steps[i].content || '',
        turnSteps: steps.slice(i + 1)
      };
    }
  }

  return { stepIndex: 0, content: '', turnSteps: steps };
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
          const path = (args.AbsolutePath || args.absolutePath || '').replace(/\\/g, '/');
          
          const isConfig =
            /\.(json|ya?ml|toml|ini|env|env\.[a-z0-9_.-]+)$/i.test(path) ||
            /\/(skills|\.agents|config|rules|hooks|builtin)\/.*$/i.test(path);
          if (isConfig) continue;

          const isDoc = /\.(md|mdx|txt|rst)$/i.test(path);
          const wsList = Array.isArray(activeWorkspace) ? activeWorkspace : (activeWorkspace ? [activeWorkspace] : []);
          const isDocInsideWorkspace = isDoc && wsList.some(ws =>
            path.startsWith(ws + '/') || path === ws
          );
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

const DENIAL_STATE_FILE = '/tmp/agy_turn_denials.json';

function getDenialState(userStepIndex) {
  try {
    if (fs.existsSync(DENIAL_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(DENIAL_STATE_FILE, 'utf-8'));
      if (data.userStepIndex === userStepIndex) {
        return data;
      }
    }
  } catch (_) {}
  return { userStepIndex, denyCount: 0 };
}

function saveDenialState(state) {
  try {
    fs.writeFileSync(DENIAL_STATE_FILE, JSON.stringify(state), 'utf-8');
  } catch (_) {}
}

/**
 * Memeriksa apakah Circuit Breaker aktif (sudah mencapai batas penolakan berulang dalam 1 turn).
 */
function isCircuitBreakerTripped(transcriptPath, maxDenials = 3) {
  if (!transcriptPath) return false;
  const userTurn = getLatestUserTurn(transcriptPath);
  const state = getDenialState(userTurn.stepIndex);
  return state.denyCount >= maxDenials;
}

/**
 * Mencatat penolakan baru dalam turn aktif.
 */
function recordTurnDenial(transcriptPath) {
  if (!transcriptPath) return 1;
  const userTurn = getLatestUserTurn(transcriptPath);
  const state = getDenialState(userTurn.stepIndex);
  state.denyCount = (state.denyCount || 0) + 1;
  saveDenialState(state);
  return state.denyCount;
}

module.exports = {
  getLatestUserTurn,
  countCurrentTurnInvestigations,
  countCurrentTurnViewFiles,
  isCircuitBreakerTripped,
  recordTurnDenial
};


