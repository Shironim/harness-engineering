const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const AUDIT_LOG_PATH = path.resolve(__dirname, '../../hooks-audit.jsonl');
const ARCHIVE_DIR = path.resolve(__dirname, '../../hooks-audit-archive');
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB threshold
const MAX_ARCHIVE_FILES = 50; // Keep up to 50 compressed archives (~15 MB disk max representing ~250MB logs)

/**
 * Rotates audit log when exceeding threshold by compressing to .jsonl.gz (zero data loss).
 */
function rotateLogIfNeeded() {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return;
    const stat = fs.statSync(AUDIT_LOG_PATH);
    if (stat.size < MAX_LOG_SIZE_BYTES) return;

    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(ARCHIVE_DIR, `hooks-audit-${timestamp}.jsonl.gz`);

    const rawContent = fs.readFileSync(AUDIT_LOG_PATH);
    const compressed = zlib.gzipSync(rawContent);
    fs.writeFileSync(archivePath, compressed);

    // Truncate active log file cleanly
    fs.writeFileSync(AUDIT_LOG_PATH, '', 'utf-8');

    // Maintain retention policy for archive folder
    const files = fs.readdirSync(ARCHIVE_DIR)
      .filter(f => f.startsWith('hooks-audit-') && (f.endsWith('.jsonl.gz') || f.endsWith('.jsonl')))
      .sort();

    while (files.length > MAX_ARCHIVE_FILES) {
      const oldest = files.shift();
      try {
        fs.unlinkSync(path.join(ARCHIVE_DIR, oldest));
      } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Mencatat keputusan eksekusi hook secara terstruktur ke hooks-audit.jsonl (non-blocking, crash-safe).
 */
function logHookDecision({ hookName, toolName, decision, reason, durationMs, extra = {} }) {
  try {
    let conversationId = extra.conversationId || null;
    if (!conversationId && extra.transcriptPath) {
      const match = String(extra.transcriptPath).match(/brain\/([^/]+)/);
      if (match) conversationId = match[1];
    }

    // Clean up transcriptPath from extra to avoid redundant log bloat
    const cleanExtra = { ...extra };
    delete cleanExtra.transcriptPath;

    const entry = {
      timestamp: new Date().toISOString(),
      conversationId: conversationId || null,
      hook: hookName || 'unknown-hook',
      tool: toolName || 'unknown-tool',
      decision: decision || 'allow',
      reason: reason || null,
      durationMs: typeof durationMs === 'number' ? Math.round(durationMs) : null,
      ...cleanExtra
    };

    rotateLogIfNeeded();
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (_) {
    // Non-blocking: Audit logger failure must never interfere with tool execution
  }
}

module.exports = {
  AUDIT_LOG_PATH,
  ARCHIVE_DIR,
  logHookDecision
};
