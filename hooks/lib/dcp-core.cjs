const path = require('path');

/**
 * Normalizes parameters recursively (lowercasing drive letters, POSIX slashes, sorted keys).
 * Produces deterministic canonical representations for tool signatures.
 */
function normalizeValue(val) {
  if (typeof val === 'string') {
    // Detect and normalize Windows/POSIX file paths
    if (/^[a-zA-Z]:[/\\]/.test(val) || (val.includes('/') || val.includes('\\')) && !val.includes('\n')) {
      let n = val.replace(/\\/g, '/');
      if (/^[a-zA-Z]:/.test(n)) {
        n = n.charAt(0).toLowerCase() + n.slice(1);
      }
      return n.replace(/\/+$/, '');
    }
    return val.trim();
  }
  if (Array.isArray(val)) {
    return val.map(normalizeValue);
  }
  if (val && typeof val === 'object') {
    const sorted = {};
    const keys = Object.keys(val).sort();
    for (const k of keys) {
      sorted[k] = normalizeValue(val[k]);
    }
    return sorted;
  }
  return val;
}

/**
 * Creates a unique deterministic signature for a tool call.
 * Format: `<toolName>::<sorted_normalized_json>`
 */
function createToolSignature(toolName, args = {}) {
  const normalized = normalizeValue(args);
  return `${toolName}::${JSON.stringify(normalized)}`;
}

/**
 * Checks if a file path matches protected file patterns.
 */
function isFilePathProtected(filePath, protectedPatterns = []) {
  if (!filePath) return false;
  const norm = normalizeValue(filePath).toLowerCase();
  for (const pattern of protectedPatterns) {
    if (typeof pattern === 'string' && norm.includes(pattern.toLowerCase())) {
      return true;
    }
    if (pattern instanceof RegExp && pattern.test(norm)) {
      return true;
    }
  }
  return false;
}

const DEFAULT_DCP_CONFIG = {
  turnThresholdForErrors: 3,
  protectedTools: new Set(['ask_question', 'sequentialthinking']),
  protectedFilePatterns: [
    'gemini.md',
    'hooks.json',
    'package.json',
    'tsconfig.json',
    'implementation_plan.md',
    'walkthrough.md'
  ],
  maxGenericOutputBytes: 2500,
  maxThinkingLength: 150
};

/**
 * Correlates PLANNER_RESPONSE tool calls with their subsequent GENERIC output steps.
 */
function mapToolInvocations(steps) {
  let currentTurn = 0;
  const toolQueue = [];
  const invocations = [];

  for (const step of steps) {
    if (step.type === 'USER_INPUT') {
      currentTurn++;
      // Clear any leftover orphaned tool calls on new user turn to prevent cross-turn skew
      toolQueue.length = 0;
      continue;
    }

    if (step.type === 'PLANNER_RESPONSE' && Array.isArray(step.tool_calls)) {
      for (const tc of step.tool_calls) {
        toolQueue.push({
          toolName: tc.name || '',
          args: tc.args || {},
          toolCall: tc,
          plannerStep: step,
          turn: currentTurn
        });
      }
    } else if (step.type === 'GENERIC') {
      // Hanya petakan jika step merupakan output pemanggilan tool yang valid (bukan notifikasi sistem/event eksternal)
      const isSystemEvent = step.source === 'SYSTEM' || step.source === 'SYSTEM_SDK' || step.source === 'USER_EXPLICIT';
      const isToolOutput = step.source === 'MODEL' || step.source === 'TOOL' || !step.source;

      if (!isSystemEvent && isToolOutput && toolQueue.length > 0) {
        const inv = toolQueue.shift();
        invocations.push({
          ...inv,
          outputStep: step
        });
      }
    }
  }

  return { invocations, totalTurns: currentTurn };
}

/**
 * Executes the full DCP (Dynamic Context Pruning) pipeline on transcript steps.
 * Modifies historical steps in-place before latestUserStepIdx.
 * Returns boolean indicating whether any modifications occurred.
 */
function runDcpPipeline(steps, latestUserStepIdx, customConfig = {}) {
  if (!Array.isArray(steps) || steps.length === 0 || latestUserStepIdx <= 0) {
    return false;
  }

  const config = { ...DEFAULT_DCP_CONFIG, ...customConfig };
  let modified = false;

  const { invocations, totalTurns } = mapToolInvocations(steps);

  // Filter invocations that occurred strictly before the active user turn
  const historicalInvocations = invocations.filter(
    inv => inv.plannerStep.step_index < latestUserStepIdx && inv.outputStep.step_index < latestUserStepIdx
  );

  // -------------------------------------------------------------
  // STRATEGY 1: Tool Call Deduplication (OpenCode DCP Pattern)
  // Keeps only the latest invocation of duplicate tool calls.
  // -------------------------------------------------------------
  const signatureGroups = new Map();

  for (const inv of historicalInvocations) {
    if (config.protectedTools.has(inv.toolName)) {
      continue;
    }

    const filePath = inv.args.AbsolutePath || inv.args.TargetFile || inv.args.SearchPath || inv.args.SearchDirectory || '';
    if (isFilePathProtected(filePath, config.protectedFilePatterns)) {
      continue;
    }

    const sig = createToolSignature(inv.toolName, inv.args);
    if (!signatureGroups.has(sig)) {
      signatureGroups.set(sig, []);
    }
    signatureGroups.get(sig).push(inv);
  }

  for (const [, group] of signatureGroups.entries()) {
    if (group.length > 1) {
      const latestInv = group[group.length - 1];
      const olderInvs = group.slice(0, -1);

      for (const oldInv of olderInvs) {
        const out = oldInv.outputStep;
        if (typeof out.content === 'string' && !out.content.startsWith('[DCP:')) {
          const originalBytes = out.content.length;
          out.content = `[DCP: Output superseded by later invocation at step ${latestInv.outputStep.step_index} (${originalBytes} bytes pruned)]`;
          out.truncated_fields = out.truncated_fields || [];
          if (!out.truncated_fields.includes('content')) {
            out.truncated_fields.push('content');
          }
          modified = true;
        }
      }
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 2: Stale Error & Failure Purging (OpenCode DCP Pattern)
  // Prunes large error payloads/stack traces after turnThreshold.
  // -------------------------------------------------------------
  for (const inv of historicalInvocations) {
    const out = inv.outputStep;
    if (typeof out.content !== 'string' || out.content.startsWith('[DCP:')) {
      continue;
    }

    const isError =
      out.status === 'ERROR' ||
      /Encountered error in tool execution|tool call denied|command failed|SyntaxError/i.test(out.content);

    if (isError) {
      const turnAge = totalTurns - inv.turn;
      if (turnAge >= config.turnThresholdForErrors) {
        const originalBytes = out.content.length;
        const firstLine = out.content.split('\n')[0].replace(/[\r\n]+/g, ' ').slice(0, 100);
        out.content = `[DCP: Stale error pruned after ${turnAge} turns: "${firstLine}" (${originalBytes} bytes archived)]`;
        out.truncated_fields = out.truncated_fields || [];
        if (!out.truncated_fields.includes('content')) {
          out.truncated_fields.push('content');
        }
        modified = true;
      }
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 3: Superseded File Edits Compaction
  // When a file was modified multiple times in the past, compact old diffs.
  // -------------------------------------------------------------
  const fileEditGroups = new Map();
  for (const inv of historicalInvocations) {
    if (['replace_file_content', 'write_to_file'].includes(inv.toolName)) {
      const targetFile = normalizeValue(inv.args.TargetFile || inv.args.targetFile || '');
      if (targetFile && !isFilePathProtected(targetFile, config.protectedFilePatterns)) {
        if (!fileEditGroups.has(targetFile)) {
          fileEditGroups.set(targetFile, []);
        }
        fileEditGroups.get(targetFile).push(inv);
      }
    }
  }

  for (const [, edits] of fileEditGroups.entries()) {
    if (edits.length > 1) {
      const latestEdit = edits[edits.length - 1];
      const olderEdits = edits.slice(0, -1);

      for (const oldEdit of olderEdits) {
        const out = oldEdit.outputStep;
        if (typeof out.content === 'string' && !out.content.startsWith('[DCP:')) {
          const originalBytes = out.content.length;
          out.content = `[DCP: File modification superseded by subsequent edit at step ${latestEdit.outputStep.step_index} (${originalBytes} bytes pruned)]`;
          out.truncated_fields = out.truncated_fields || [];
          if (!out.truncated_fields.includes('content')) {
            out.truncated_fields.push('content');
          }
          modified = true;
        }
      }
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 4: Historical Internal CoT Slimming
  // -------------------------------------------------------------
  for (const step of steps) {
    if (step.step_index >= latestUserStepIdx) {
      continue;
    }

    if (step.type === 'PLANNER_RESPONSE' && typeof step.thinking === 'string') {
      if (step.thinking.length > config.maxThinkingLength && !step.thinking.startsWith('[DCP:')) {
        const originalBytes = step.thinking.length;
        step.thinking = `[DCP: Historical CoT (${originalBytes} bytes archived)]`;
        step.truncated_fields = step.truncated_fields || [];
        if (!step.truncated_fields.includes('thinking')) {
          step.truncated_fields.push('thinking');
        }
        modified = true;
      }
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 5: Fallback Generic Large Output Compression
  // -------------------------------------------------------------
  for (const step of steps) {
    if (step.step_index >= latestUserStepIdx || step.type !== 'GENERIC') {
      continue;
    }

    if (typeof step.content === 'string' && step.content.length > config.maxGenericOutputBytes && !step.content.startsWith('[DCP:')) {
      const originalBytes = step.content.length;
      const head = step.content.slice(0, 120).replace(/\n/g, ' ');
      const tail = step.content.slice(-80).replace(/\n/g, ' ');
      step.content = `[DCP: Pruned large payload: "${head} ... [snip] ... ${tail}" (${originalBytes} bytes archived)]`;
      step.truncated_fields = step.truncated_fields || [];
      if (!step.truncated_fields.includes('content')) {
        step.truncated_fields.push('content');
      }
      modified = true;
    }
  }

  return modified;
}

module.exports = {
  normalizeValue,
  createToolSignature,
  isFilePathProtected,
  DEFAULT_DCP_CONFIG,
  runDcpPipeline
};
