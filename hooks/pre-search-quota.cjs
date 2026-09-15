const fs = require('fs');
const {
  countCurrentTurnInvestigations,
  countCurrentTurnContextMode,
  isCircuitBreakerTripped,
  recordTurnDenial,
  normalizePath
} = require('./lib/session-state.cjs');

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
  const toolName = toolCall.name || '';
  const args = toolCall.args || {};

  const pathOverwrite = {};
  if (toolName === 'grep_search') {
    const rawSearchPath = args.SearchPath || '';
    if (rawSearchPath) {
      const normSearchPath = normalizePath(rawSearchPath);
      if (rawSearchPath.includes('\\') || rawSearchPath !== normSearchPath) {
        pathOverwrite.SearchPath = normSearchPath;
      }
    }
  } else if (toolName === 'find_by_name') {
    const rawSearchDir = args.SearchDirectory || '';
    if (rawSearchDir) {
      const normSearchDir = normalizePath(rawSearchDir);
      if (rawSearchDir.includes('\\') || rawSearchDir !== normSearchDir) {
        pathOverwrite.SearchDirectory = normSearchDir;
      }
    }
  }

  // 1. HARD RULE: Prevent "Grep-Dumping" (Using grep_search with broad regex to dump an entire file)
  if (toolName === 'grep_search') {
    const query = (args.Query || '').trim();
    const searchPath = (pathOverwrite.SearchPath || args.SearchPath || '').replace(/\\/g, '/');
    const isSingleFile = /\.[a-z0-9]+$/i.test(searchPath);
    const isWildcardDump = /^(|\.\*|\^.*|\.|\$|\^|;|import|const|function|\{|\})$/i.test(query);

    if (isSingleFile && isWildcardDump) {
      sendDecision(
        'deny',
        `[GUARDRAIL HARD BLOCK] Using grep_search with a wildcard or universal pattern on a single file to dump its entire contents is strictly prohibited.\n` +
        `Target: ${searchPath}\n` +
        `Enforcement: Use precision slicing (view_file with narrow StartLine/EndLine <= 80 lines) or AST MCP tools (codegraph / strata-mcp).`
      );
    }
  }

  // 2. HARD RULE: Guard context-mode & MCP parameter auto-repair
  if (toolName === 'call_mcp_tool') {
    const serverName = (args.ServerName || '').toLowerCase();
    const mcpTool = (args.ToolName || '').toLowerCase();

    // Auto-repair missing required MCP tool arguments
    let mcpArgs = args.Arguments;
    let modifiedArgs = false;
    if (typeof mcpArgs === 'string') {
      try { mcpArgs = JSON.parse(mcpArgs); } catch (_) { mcpArgs = {}; }
    } else if (!mcpArgs || typeof mcpArgs !== 'object') {
      mcpArgs = {};
    }

    if (mcpTool === 'ctx_execute' && !mcpArgs.language) {
      mcpArgs.language = 'javascript';
      modifiedArgs = true;
    }

    if (mcpTool === 'sequentialthinking') {
      if (mcpArgs.nextThoughtNeeded === undefined) {
        mcpArgs.nextThoughtNeeded = false;
        modifiedArgs = true;
      }
      if (mcpArgs.thoughtNumber === undefined || isNaN(Number(mcpArgs.thoughtNumber))) {
        mcpArgs.thoughtNumber = 1;
        modifiedArgs = true;
      }
      if (mcpArgs.totalThoughts === undefined || isNaN(Number(mcpArgs.totalThoughts))) {
        mcpArgs.totalThoughts = 1;
        modifiedArgs = true;
      }
    }

    const extraDecision = modifiedArgs ? { overwrite: { Arguments: mcpArgs } } : {};

    if (serverName === 'context-mode' || mcpTool.startsWith('ctx_')) {
      const MAX_CTX_MODE_QUOTA = 3;
      const { count: ctxCount } = countCurrentTurnContextMode(globalTranscriptPath);

      if (ctxCount >= MAX_CTX_MODE_QUOTA) {
        sendDecision(
          'deny',
          `[CONTEXT-MODE ANTI-CHAINING GUARD] Pemanggilan context-mode (${args.ToolName}) telah mencapai batas (${MAX_CTX_MODE_QUOTA} calls) dalam giliran ini!\n` +
          `Dilarang memanggil script sandbox secara serial untuk mengintip file sedikit demi sedikit (serial micro-scripting loop).\n\n` +
          `PANDUAN OPTIMASI UNTUK SEQUENTIAL-THINKING:\n` +
          `1. Hentikan eksekusi script serial sekarang. Beralih ke sequentialthinking untuk merancang 'Batch-First Aggregation Script'.\n` +
          `2. BATCH-FIRST: Baca dan bandingkan seluruh target file sekaligus dalam SATU script (fs.readFileSync simultan).\n` +
          `3. STRICT FILTERING: DILARANG console.log raw dump (> 30 baris / > 2 KB) yang memicu pemotongan output ke disk (.system_generated/.../output.txt).\n` +
          `4. STRUKTUR RINGKAS: Kembalikan JSON terstruktur ringkas (<= 30 baris) berisi matriks perbandingan, daftar simbol, atau baris kunci.\n` +
          `5. STOP & ASK EARLY: Jika target pencarian tetap tidak ditemukan atau ambigu, hentikan probing dan tanyakan langsung ke pengguna.`
        );
      }
    }

    const isSearchOrReadMcp = [
      'find_code', 'search_code', 'search_notes', 'ctx_search',
      'get_file_contents'
    ].includes(args.ToolName || '');
    if (!isSearchOrReadMcp && !mcpTool.startsWith('ctx_')) {
      // Analytical and non-search MCP tools (such as sequentialthinking) do not consume discovery quota
      sendDecision('allow', null, extraDecision);
    }

    // For non-search ctx tools (e.g. ctx_execute), they are code execution, not discovery search
    if (mcpTool !== 'ctx_search') {
      sendDecision('allow', null, extraDecision);
    }
  }

  // 3. HARD RULE: Subagent delegation guard (prevent delegating raw file reading or bypassing quota)
  if (toolName === 'invoke_subagent') {
    const subagents = args.Subagents || [];
    const hasDumpingPrompt = subagents.some(sub => {
      const prompt = sub.Prompt || '';
      return /\b(baca|read|dump|tampilkan|salin|copy)\s+.*(seluruh|full|semua|all|isi|file)\b/i.test(prompt);
    });
    if (hasDumpingPrompt) {
      sendDecision(
        'deny',
        `[DELEGATION GUARD] Mendelegasikan pembacaan file mentah atau bypass kuota ke subagent dilarang.\n` +
        `Subagent harus memiliki spesifikasi tugas konkret (analisis AST, review, dsb.), bukan sebagai proksi file dumper.`
      );
    }
  }

  const transcriptPath = data.transcriptPath || '';
  const allowExtra = Object.keys(pathOverwrite).length ? { overwrite: pathOverwrite } : {};

  if (!transcriptPath) {
    sendDecision('allow', null, allowExtra);
  }

  const { count } = countCurrentTurnInvestigations(transcriptPath);

  // 4. HARD RULE: Investigation quota limit (3 calls per turn for Early Failure Interception, matching GEMINI.md)
  const MAX_SEARCH_QUOTA = 3;

  if (count >= MAX_SEARCH_QUOTA) {
    sendDecision(
      'deny',
      `[EARLY CIRCUIT BREAKER] Kuota investigasi/pencarian (${MAX_SEARCH_QUOTA} calls) telah tercapai untuk giliran ini!\n` +
      `Pencarian liar atau looping browsing lebih lanjut dilarang untuk mencegah context rot dan pemborosan token.\n` +
      `MANDATORY ACTIONS (EARLY FAILURE INTERCEPTION):\n` +
      `1. HENTIKAN investigasi sekarang juga.\n` +
      `2. Laporkan secara transparan apa yang sudah dicari dan di mana letak ambiguitas/kebuntuan.\n` +
      `3. Tanyakan langsung kepada user panduan spesifik, nama fungsi, atau jalur file yang dimaksud.`
    );
  }

  sendDecision('allow', null, allowExtra);
}

main();
