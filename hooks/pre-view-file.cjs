const fs = require('fs');
const { countCurrentTurnViewFiles, isCircuitBreakerTripped, recordTurnDenial } = require('./lib/session-state.cjs');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (err) {
    return '';
  }
}

let globalTranscriptPath = '';

function sendDecision(decision, reason) {
  if (decision === 'deny' && globalTranscriptPath) {
    recordTurnDenial(globalTranscriptPath);
  }
  const payload = { decision };
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

  const normalizedPath = absolutePath.replace(/\\/g, '/');
  const rawWorkspaces = [];
  if (Array.isArray(data.workspacePaths)) rawWorkspaces.push(...data.workspacePaths);
  if (data.workspace) rawWorkspaces.push(data.workspace);
  if (data.cwd) rawWorkspaces.push(data.cwd);
  if (process.cwd()) rawWorkspaces.push(process.cwd());

  const activeWorkspaces = rawWorkspaces
    .map(w => (w || '').replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter(Boolean);

  // 1. Documentation & Markdown Notes: Allowed in full ONLY if originating within or linked into active workspace
  const isDocFile = /\.(md|mdx|txt|rst)$/i.test(normalizedPath);
  const isWithinWorkspace = activeWorkspaces.some(ws =>
    normalizedPath.startsWith(ws + '/') || normalizedPath === ws
  );

  if (isDocFile && isWithinWorkspace) {
    sendDecision('allow');
  }

  // 1b. Configs, manifests, MCP schemas, and hooks
  const isConfigOrSchema =
    /\/mcp\/.*\.json$/i.test(normalizedPath) ||
    /\.(ya?ml|toml|ini|env|env\.[a-z0-9_.-]+)$/i.test(normalizedPath) ||
    /(package|composer|tsconfig|vite\.config|webpack\.config|tailwind\.config)\.(json|js|ts|cjs|mjs)$/i.test(normalizedPath) ||
    /\/hooks\/.*\.cjs$/i.test(normalizedPath);

  if (isConfigOrSchema) {
    sendDecision('allow');
  }

  // 2. Restricted Targets: Source code AND External Documentation (outside active workspace)
  const isSourceCode = /\.(vue|ts|js|php|blade\.php|jsx|tsx|css|scss|py|go|rs|sql|sh|bash|java|c|cpp|h|hpp|rb|graphql|gql|json)$/i.test(normalizedPath);
  const isExternalDoc = isDocFile && !isWithinWorkspace;
  const isRestrictedTarget = isSourceCode || isExternalDoc;

  if (isRestrictedTarget) {
    const transcriptPath = data.transcriptPath || '';
    if (transcriptPath) {
      const { count, specificFileCount, totalLinesRead } = countCurrentTurnViewFiles(transcriptPath, normalizedPath, activeWorkspaces);
      const MAX_VIEW_QUOTA = 3; // Maksimal 3 pemanggilan view_file restricted per turn

      if (count >= MAX_VIEW_QUOTA) {
        sendDecision(
          'deny',
          `[READ QUOTA BREAKER] Kuota view_file (${MAX_VIEW_QUOTA} pemanggilan) telah tercapai untuk giliran ini.\n` +
          `Daisy-chaining view_file dilarang keras untuk mencegah context rot & pemborosan token.\n` +
          `Target: ${normalizedPath}\n` +
          `RUTE RESMI WAJIB (ACTIONABLE OFF-RAMP):\n` +
          `• Fungsi / Call Graph: Gunakan codegraph:codegraph_explore(symbol='namaSimbol').\n` +
          `• UI / Komponen Frontend: Gunakan strata-mcp:inspect_component.\n` +
          `• Multi-file search: Gunakan context-mode (ctx_search).\n` +
          `• Jika lokasi belum jelas: Hentikan pemanggilan tool, laporkan progres, dan tanyakan langsung ke user.`
        );
      }

      // 2b. Anti-Slicing Loop: Mencegah pembacaan berkali-kali pada file yang sama (chunking bypass)
      if (specificFileCount >= 2) {
        sendDecision(
          'deny',
          `[SLICING EROSION GUARD] File '${normalizedPath.split('/').pop()}' telah dibaca ${specificFileCount} kali dalam giliran ini.\n` +
          `Membaca file yang sama secara berulang dalam potongan kecil (micro-slicing/chunking loop) dilarang.\n` +
          `SOLUSI: Tentukan baris spesifik yang dibutuhkan atau tanyakan ke user alih-alih membaca chunk berkelanjutan.`
        );
      }

      // 2c. Cumulative Lines Quota: Maksimal akumulasi 150 baris per turn
      const currentSpan = (startLine !== undefined && endLine !== undefined) ? (endLine - startLine + 1) : 0;
      if (totalLinesRead + currentSpan > 150) {
        sendDecision(
          'deny',
          `[CUMULATIVE READ GUARD] Total baris yang dibaca giliran ini (${totalLinesRead + currentSpan} baris) melebihi batas 150 baris.\n` +
          `Hentikan pembacaan file mentah. Gunakan tool terarah atau konsultasikan ke user.`
        );
      }
    }

    // 2d. Full File Dump Prohibition: Membaca tanpa batasan baris
    if (startLine === undefined && endLine === undefined) {
      sendDecision(
        'deny',
        `[GUARDRAIL HARD BLOCK] Membaca seluruh file mentah (${normalizedPath.split('/').pop()}) tanpa batas baris dilarang keras.\n` +
        (isExternalDoc ? `Dokumen di luar workspace wajib dipotong menggunakan StartLine & EndLine (<= 80 baris).\n` : '') +
        `RUTE RESMI:\n` +
        `• Tentukan StartLine & EndLine sempit (±20-40 baris) di sekitar blok target.\n` +
        `• Untuk kode frontend, gunakan strata-mcp:inspect_component. Untuk backend, gunakan codegraph.`
      );
    }

    // 2e. Span Limit Prohibition: Membaca potongan melebihi 80 baris
    if (startLine !== undefined && endLine !== undefined) {
      const lineSpan = endLine - startLine + 1;
      if (lineSpan > 80) {
        sendDecision(
          'deny',
          `[GUARDRAIL HARD BLOCK] Rentang baris terlalu lebar (${lineSpan} baris: L${startLine}-L${endLine}). Maksimal 80 baris.\n` +
          `Persempit StartLine & EndLine (rekomendasi ±20-40 baris). Untuk eksplorasi arsitektur, gunakan strata-mcp atau codegraph.`
        );
      }
    }
  }

  sendDecision('allow');
}

main();

