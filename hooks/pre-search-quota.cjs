const fs = require('fs');
const path = require('path');
const { countCurrentTurnInvestigations, isCircuitBreakerTripped, recordTurnDenial } = require('./lib/session-state.cjs');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (_) {
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
  } catch (_) {
    sendDecision('allow');
  }

  globalTranscriptPath = data.transcriptPath || '';

  // 0. CIRCUIT BREAKER: Hentikan eksekusi jika sudah terjadi 2x penolakan berturut-turut dalam turn ini
  if (globalTranscriptPath && isCircuitBreakerTripped(globalTranscriptPath, 2)) {
    const payload = {
      decision: 'deny',
      reason: `[CIRCUIT BREAKER ACTIVATED] Telah terjadi 2x penolakan berturut-turut dalam giliran ini.\n` +
        `Eksekusi tool dihentikan paksa untuk mencegah loop coba-ulang dan melindungi context window.\n` +
        `TINDAKAN WAJIB: Hentikan pemanggilan tool sekarang, laporkan progres, dan minta instruksi langsung ke pengguna.`
    };
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  const toolCall = data.toolCall || {};
  const toolName = toolCall.name || '';
  const args = toolCall.args || {};

  // 1. HARD RULE: Prevent "Grep-Dumping" (Using grep_search with broad regex to dump an entire file)
  if (toolName === 'grep_search') {
    const query = (args.Query || '').trim();
    const searchPath = (args.SearchPath || '').replace(/\\/g, '/');
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

  // 2. HARD RULE: Filter MCP tools that function as discovery, search, or file-reading sandboxes
  if (toolName === 'call_mcp_tool') {
    const mcpTool = args.ToolName || '';
    const isSearchOrReadMcp = [
      'find_code', 'search_code', 'search_notes', 'ctx_search',
      'ctx_execute_file', 'ctx_execute', 'ctx_batch_execute',
      'get_file_contents'
    ].includes(mcpTool);
    if (!isSearchOrReadMcp) {
      // Pure analytical tools (such as sequentialthinking) do not consume discovery quota
      sendDecision('allow');
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
  if (!transcriptPath) {
    sendDecision('allow');
  }

  const { count } = countCurrentTurnInvestigations(transcriptPath);

  // 4. HARD RULE: Investigation quota limit (2 calls per turn for Early Failure Interception)
  const MAX_SEARCH_QUOTA = 2;

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

  sendDecision('allow');
}

main();
