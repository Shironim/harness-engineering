const fs = require('fs');
const {
  countCurrentTurnInvestigations,
  countCurrentTurnContextMode,
  countCurrentTurnUnifiedInvestigations,
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

    if (mcpTool === 'ctx_execute') {
      if (!mcpArgs.language) {
        mcpArgs.language = 'javascript';
        modifiedArgs = true;
      }

      // Dynamic Multi-Project CWD Prelude & ESM-to-CJS Pre-Flight Transpiler
      if (mcpArgs.code && typeof mcpArgs.code === 'string') {
        let code = mcpArgs.code;
        let codeModified = false;

        // 1. ESM to CommonJS syntax normalization
        if (/\bimport\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/.test(code)) {
          code = code.replace(
            /import\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"];?/g,
            'const $1 = require("$2");'
          ).replace(
            /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/g,
            'const { $1 } = require("$2");'
          );
          codeModified = true;
        }

        // 2. Dynamic Workspace CWD resolution (Multi-project agnostic, no hardcoding)
        const rawWorkspaces = [];
        if (Array.isArray(data.workspacePaths)) rawWorkspaces.push(...data.workspacePaths);
        if (data.workspace) rawWorkspaces.push(data.workspace);
        if (data.cwd) rawWorkspaces.push(data.cwd);
        if (process.cwd()) rawWorkspaces.push(process.cwd());

        const activeWorkspaces = rawWorkspaces
          .map(w => normalizePath(w))
          .filter(Boolean);
        const primaryWorkspace = activeWorkspaces[0] || '';

        if (primaryWorkspace && !code.includes('process.chdir')) {
          const escapedWs = primaryWorkspace.replace(/\\/g, '/');
          const dynamicPrelude =
            `try { process.chdir(${JSON.stringify(escapedWs)}); } catch (_) {}\n` +
            `const __ACTIVE_WORKSPACE__ = ${JSON.stringify(escapedWs)};\n`;
          code = dynamicPrelude + code;
          codeModified = true;
        }

        if (codeModified) {
          mcpArgs.code = code;
          modifiedArgs = true;
        }
      }
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

    if (mcpTool === 'codegraph_explore') {
      if (!mcpArgs.query && mcpArgs.symbol) {
        mcpArgs.query = mcpArgs.symbol;
        modifiedArgs = true;
      }
    }

    const extraDecision = modifiedArgs ? { overwrite: { Arguments: mcpArgs } } : {};

    if (serverName === 'context-mode' || mcpTool.startsWith('ctx_')) {
      const MAX_CTX_MODE_QUOTA = 4; // 3 discovery/scanning + 1 verification/synthesis
      const { totalCount, ctxCount, searchCount } = countCurrentTurnUnifiedInvestigations(globalTranscriptPath);

      if (totalCount >= MAX_CTX_MODE_QUOTA || ctxCount >= MAX_CTX_MODE_QUOTA) {
        sendDecision(
          'deny',
          `[UNIFIED INVESTIGATION CIRCUIT BREAKER] Kuota investigasi gabungan (${MAX_CTX_MODE_QUOTA} calls: Total ${totalCount}) telah tercapai dalam giliran ini!\n` +
          `Alokasi investigasi turn ini telah digunakan penuh (Search: ${searchCount || 0}, Context: ${ctxCount || 0}).\n\n` +
          `PANDUAN ANTI-PANIC PIVOTING (BOUNDED AUTONOMY):\n` +
          `1. HENTIKAN seluruh pemanggilan tool investigasi coba-ulang sekarang.\n` +
          `2. Rangkum data yang telah dikumpulkan sejauh ini dan sajikan laporan progres ke user.\n` +
          `3. Jika langkah kode sudah terpetakan, langsung gunakan replace_file_content pada baris target.\n` +
          `4. Jika target belum ditemukan, tanyakan langsung kepada user panduan spesifik (Stop & Ask Early).`
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

  const { totalCount, searchCount } = countCurrentTurnUnifiedInvestigations(transcriptPath);

  // 4. HARD RULE: Unified Investigation quota limit (4 calls per turn: 3 discovery + 1 verification/synthesis)
  const MAX_SEARCH_QUOTA = 4;

  if (totalCount >= MAX_SEARCH_QUOTA || searchCount >= MAX_SEARCH_QUOTA) {
    sendDecision(
      'deny',
      `[UNIFIED INVESTIGATION CIRCUIT BREAKER] Kuota investigasi gabungan (${MAX_SEARCH_QUOTA} calls: Total ${totalCount}) telah tercapai untuk giliran ini!\n` +
      `Pencarian liar atau browsing berulang dihentikan untuk melindungi context window dari memory rot.\n\n` +
      `PANDUAN ANTI-PANIC PIVOTING (BOUNDED AUTONOMY):\n` +
      `1. HENTIKAN investigasi dan dilarang beralih tool coba-ulang.\n` +
      `2. Rangkum data yang telah dikumpulkan sejauh ini dan laporkan hasilnya ke user.\n` +
      `3. Jika langkah kode sudah jelas, lanjutkan ke fase eksekusi (replace_file_content).\n` +
      `4. Jika terdapat ambiguitas, tanyakan langsung kepada user panduan spesifik (Stop & Ask Early).`
    );
  }

  sendDecision('allow', null, allowExtra);
}

main();
