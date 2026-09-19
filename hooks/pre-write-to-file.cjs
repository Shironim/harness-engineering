const fs = require('fs');
const {
  isCircuitBreakerTripped,
  recordTurnDenial,
  normalizePath
} = require('./lib/session-state.cjs');
const { logHookDecision } = require('./lib/audit-logger.cjs');

const startTime = Date.now();

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (_) {
    return '';
  }
}

let globalTranscriptPath = '';

function sendDecision(decision, reason, extra = {}) {
  if (decision === 'deny' && globalTranscriptPath) {
    recordTurnDenial(globalTranscriptPath);
  }
  logHookDecision({
    hookName: 'pre-write-to-file',
    toolName: 'write_to_file',
    decision,
    reason,
    durationMs: Date.now() - startTime,
    extra: {
      transcriptPath: globalTranscriptPath
    }
  });
  const payload = { decision, ...extra };
  if (reason) payload.reason = reason;
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function main() {
  const rawInput = readStdin();
  if (!rawInput.trim()) {
    sendDecision('allow');
  }

  let data;
  try {
    data = JSON.parse(rawInput);
  } catch (_) {
    sendDecision('allow');
  }

  globalTranscriptPath = data.transcriptPath || '';

  // 0. CIRCUIT BREAKER: Hentikan eksekusi jika sudah terjadi 3x penolakan berturut-turut dalam turn ini
  if (globalTranscriptPath && isCircuitBreakerTripped(globalTranscriptPath, 3)) {
    const payload = {
      decision: 'deny',
      reason: `[CIRCUIT BREAKER ACTIVATED] Telah terjadi 3x penolakan berturut-turut dalam giliran ini.\n` +
        `Eksekusi tool dihentikan paksa untuk mencegah loop coba-ulang dan melindungi context window.\n` +
        `TINDAKAN WAJIB: Hentikan pemanggilan tool sekarang, laporkan progres, dan minta instruksi langsung ke pengguna.`
    };
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  const toolCall = data.toolCall || {};
  const args = toolCall.args || {};
  const rawTargetFile = args.TargetFile || args.targetFile || '';
  const targetFile = normalizePath(rawTargetFile);
  const needsOverwrite = rawTargetFile && (rawTargetFile.includes('\\') || rawTargetFile !== targetFile);
  const pathDecision = needsOverwrite ? { overwrite: { TargetFile: targetFile } } : {};
  const overwrite = args.Overwrite === true || args.overwrite === true;
  const hasArtifactMetadata = args.ArtifactMetadata !== undefined && args.ArtifactMetadata !== null;

  if (!targetFile) {
    sendDecision('allow', null, pathDecision);
  }

  // 1. ARTIFACT METADATA MISMATCH GUARD:
  // ArtifactMetadata hanya sah untuk file di dalam direktori brain/<conversation-id>/
  const isArtifactDir = /\/(antigravity-cli|antigravity-ide|\.antigravity|\.gemini)\/brain\/[a-f0-9-]+\//i.test(targetFile) ||
    /\/brain\/[a-f0-9-]+\//i.test(targetFile);

  if (hasArtifactMetadata && !isArtifactDir) {
    sendDecision(
      'deny',
      `[ARTIFACT METADATA MISMATCH] Parameter 'ArtifactMetadata' hanya sah untuk berkas di direktori artifak: brain/<conversation-id>/.\n` +
      `Target berkas: ${targetFile}\n` +
      `SOLUSI WAJIB:\n` +
      `• Untuk membuat/menulis file di dalam proyek/workspace: Panggil write_to_file TANPA ArtifactMetadata.\n` +
      `• Untuk membuat artifak resmi: Simpan berkas di direktori artifak brain/<conversation-id>/.`
    );
  }

  // 2. ANTI-WIPE GUARD:
  // Dilarang menimpa file source code yang SUDAH ADA menggunakan write_to_file.
  // Modifikasi file yang sudah ada wajib menggunakan replace_file_content.
  const sourceExts = /\.(vue|ts|mts|cts|js|cjs|mjs|php|blade\.php|jsx|tsx|css|scss|py|go|rs|sql|sh|bash|java|c|cpp|rb|json|ya?ml|toml)$/i;
  const isSourceCode = sourceExts.test(targetFile);

  if (isSourceCode && overwrite && fs.existsSync(targetFile)) {
    sendDecision(
      'deny',
      `[INTEGRITY GUARD] Menimpa seluruh file source code yang sudah ada (${targetFile.split('/').pop()}) menggunakan write_to_file dilarang.\n` +
      `Target: ${targetFile}\n` +
      `RUTE RESMI WAJIB (ACTIONABLE OFF-RAMP):\n` +
      `• Gunakan replace_file_content untuk memodifikasi blok baris yang ditargetkan secara presisi.\n` +
      `• Hal ini menjaga struktur, indentasi, dan bagian kode lainnya tetap utuh sesuai aturan proyek.`
    );
  }

  sendDecision('allow', null, pathDecision);
}

main();
