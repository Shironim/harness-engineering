const fs = require('fs');
const {
  countCurrentTurnViewFiles,
  isCircuitBreakerTripped,
  recordTurnDenial,
  normalizePath,
  isPathInside
} = require('./lib/session-state.cjs');
const { logHookDecision } = require('./lib/audit-logger.cjs');

const startTime = Date.now();

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (err) {
    return '';
  }
}

let globalTranscriptPath = '';

function sendDecision(decision, reason, extra = {}) {
  if (decision === 'deny' && globalTranscriptPath) {
    recordTurnDenial(globalTranscriptPath);
  }
  logHookDecision({
    hookName: 'pre-view-file',
    toolName: 'view_file',
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
  } catch (err) {
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
  const absolutePath = args.AbsolutePath || args.absolutePath || '';
  const startLine = args.StartLine !== undefined ? Number(args.StartLine) : undefined;
  const endLine = args.EndLine !== undefined ? Number(args.EndLine) : undefined;

  const normalizedPath = normalizePath(absolutePath);
  const needsPathOverwrite = absolutePath && (absolutePath.includes('\\') || absolutePath !== normalizedPath);
  const baseDecision = needsPathOverwrite ? { overwrite: { AbsolutePath: normalizedPath } } : {};

  // 1a. System-generated tool outputs & Internal Brain/Artifact documents (Whitelisted)
  const isInternalSystemOrOutput =
    /\/\.system_generated\/steps\/\d+\/output\.txt$/i.test(normalizedPath) ||
    /\/(antigravity-cli|antigravity-ide|\.antigravity|\.gemini)\/brain\/.*$/i.test(normalizedPath) ||
    /\/scratch\/.*$/i.test(normalizedPath);

  if (isInternalSystemOrOutput) {
    sendDecision('allow', null, baseDecision);
  }

  const rawWorkspaces = [];
  if (Array.isArray(data.workspacePaths)) rawWorkspaces.push(...data.workspacePaths);
  if (data.workspace) rawWorkspaces.push(data.workspace);
  if (data.cwd) rawWorkspaces.push(data.cwd);
  if (process.cwd()) rawWorkspaces.push(process.cwd());

  const activeWorkspaces = rawWorkspaces
    .map(w => normalizePath(w))
    .filter(Boolean);

  // 1b. Documentation & Markdown Notes: Allowed in full ONLY if originating within or linked into active workspace
  const isDocFile = /\.(md|mdx|txt|rst)$/i.test(normalizedPath);
  const isWithinWorkspace = activeWorkspaces.some(ws => isPathInside(normalizedPath, ws));

  if (isDocFile && isWithinWorkspace) {
    sendDecision('allow', null, baseDecision);
  }

  // 1c. Configs, manifests, MCP schemas, rules, skills, and hooks
  const isConfigOrSchema =
    /\/mcp\/.*\.json$/i.test(normalizedPath) ||
    /\.(ya?ml|toml|ini|env|env\.[a-z0-9_.-]+)$/i.test(normalizedPath) ||
    /(package|composer|tsconfig|vite\.config|webpack\.config|tailwind\.config)\.(json|js|ts|cjs|mjs)$/i.test(normalizedPath) ||
    /\/(hooks|skills|\.agents|config|rules|builtin)\/.*$/i.test(normalizedPath);

  if (isConfigOrSchema) {
    sendDecision('allow', null, baseDecision);
  }

  // 1d. Data & Lightweight JSON files (<= 250 lines or <= 15 KB)
  let isSmallJson = false;
  if (/\.json$/i.test(normalizedPath)) {
    try {
      if (fs.existsSync(normalizedPath)) {
        const stats = fs.statSync(normalizedPath);
        if (stats.size <= 15360) { // <= 15 KB (typically <= 250 lines)
          isSmallJson = true;
        }
      }
    } catch (_) {}
  }

  if (isSmallJson) {
    sendDecision('allow', null, baseDecision);
  }

  // 2. Restricted Targets: Source code AND External Documentation (outside active workspace)
  const isSourceCode = /\.(vue|ts|js|php|blade\.php|jsx|tsx|css|scss|py|go|rs|sql|sh|bash|java|c|cpp|h|hpp|rb|graphql|gql)$/i.test(normalizedPath) || (/\.json$/i.test(normalizedPath) && !isSmallJson);
  const isExternalDoc = isDocFile && !isWithinWorkspace;
  const isRestrictedTarget = isSourceCode || isExternalDoc;

  if (isRestrictedTarget) {
    const transcriptPath = data.transcriptPath || '';
    if (transcriptPath) {
      const { count, specificFileCount, totalLinesRead } = countCurrentTurnViewFiles(transcriptPath, normalizedPath, activeWorkspaces);
      
      // Hitung apakah pemanggilan ini adalah targeted slice (rentang terarah <= 100 baris)
      const currentSpan = (startLine !== undefined && endLine !== undefined) ? (endLine - startLine + 1) : 0;
      const isPrecisionSlice = currentSpan > 0 && currentSpan <= 100;
      
      // Titik Keseimbangan: 10 calls untuk broad reading, 15 calls untuk targeted slicing
      const MAX_VIEW_QUOTA = isPrecisionSlice ? 15 : 10;

      if (count >= MAX_VIEW_QUOTA) {
        sendDecision(
          'deny',
          `[READ QUOTA BREAKER] Kuota view_file (${MAX_VIEW_QUOTA} pemanggilan${isPrecisionSlice ? ' targeted-slice' : ''}) telah tercapai untuk giliran ini.\n` +
          `Daisy-chaining view_file dihentikan untuk melindungi context window dari memory rot.\n` +
          `Target: ${normalizedPath}\n` +
          `RUTE RESMI WAJIB (ACTIONABLE OFF-RAMP):\n` +
          `• Fungsi / Call Graph: Gunakan codegraph:codegraph_explore(query='namaSimbol').\n` +
          `• UI / Komponen Frontend: Gunakan strata-mcp:inspect_component(path='...').\n` +
          `• Multi-file search: Gunakan context-mode (ctx_search).\n` +
          `• Jika baris sudah terpetakan: Langsung lakukan replace_file_content tanpa membaca ulang.`
        );
      }

      // 2b. Anti-Slicing Loop: Mencegah pembacaan berkali-kali tanpa batas pada file yang sama
      if (specificFileCount >= 6 && (!isPrecisionSlice || specificFileCount >= 10)) {
        sendDecision(
          'deny',
          `[SLICING EROSION GUARD] File '${normalizedPath.split('/').pop()}' telah dibaca ${specificFileCount} kali dalam giliran ini.\n` +
          `Membaca file yang sama secara berulang melebihi batas wajar dilarang.\n` +
          `SOLUSI: Tentukan baris spesifik yang dibutuhkan (maksimal 200 baris) sebelum edit atau tanyakan ke user alih-alih membaca chunk berkelanjutan.`
        );
      }

      // 2c. Cumulative Lines Quota: Maksimal akumulasi 2000 baris per turn
      if (totalLinesRead + currentSpan > 2000) {
        sendDecision(
          'deny',
          `[CUMULATIVE READ GUARD] Total baris yang dibaca giliran ini (${totalLinesRead + currentSpan} baris) melebihi batas 2000 baris.\n` +
          `Hentikan pembacaan file mentah. Gunakan tool terarah atau konsultasikan ke user.`
        );
      }
    }

    // 2d. Mandatory Bounded Slicing: Mewajibkan kedua parameter StartLine dan EndLine
    if (startLine === undefined || endLine === undefined) {
      sendDecision(
        'deny',
        `[GUARDRAIL HARD BLOCK] Membaca file (${normalizedPath.split('/').pop()}) tanpa batas baris lengkap dilarang keras.\n` +
        `Kedua parameter StartLine dan EndLine WAJIB ditentukan untuk mencegah pembacaan file mentah tanpa batas.\n` +
        `RUTE RESMI:\n` +
        '• Tentukan StartLine & EndLine terarah (maksimal 200 baris) di sekitar blok target.\n' +
        '• Untuk kode frontend, gunakan strata-mcp:inspect_component. Untuk backend, gunakan codegraph.'
      );
    }

    // 2e. Span Limit Prohibition: Membaca potongan melebihi 200 baris atau rentang terbalik
    const lineSpan = endLine - startLine + 1;
    if (lineSpan <= 0 || lineSpan > 200) {
      sendDecision(
        'deny',
        `[GUARDRAIL HARD BLOCK] Rentang baris tidak valid atau terlalu lebar (${lineSpan} baris: L${startLine}-L${endLine}). Maksimal 200 baris.\n` +
        `Gunakan pembacaan terarah (maksimal 200 baris) tepat sebelum edit. Untuk eksplorasi arsitektur, gunakan strata-mcp atau codegraph.`
      );
    }
  }

  sendDecision('allow', null, baseDecision);
}

main();

