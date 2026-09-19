const fs = require('fs');
const { getLatestUserTurn, isCircuitBreakerTripped, recordTurnDenial } = require('./lib/session-state.cjs');
const { evaluateCommandConsent } = require('./lib/jev-client.cjs');
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

function sendDecision(decision, reason) {
  if (decision === 'deny' && globalTranscriptPath) {
    recordTurnDenial(globalTranscriptPath);
  }
  logHookDecision({
    hookName: 'pre-run-command',
    toolName: 'run_command',
    decision,
    reason,
    durationMs: Date.now() - startTime,
    extra: {
      transcriptPath: globalTranscriptPath
    }
  });
  const payload = { decision };
  if (reason) payload.reason = reason;
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

const DESTRUCTIVE_CMD_REGEX = /\b(git\s+(push(\s+.*)?|reset\s+--hard|clean\s+-[a-zA-Z]*f|rebase\s+(--abort|--skip))|rm\s+(-[a-zA-Z]*[rf][a-zA-Z]*|--recursive|--force)\b|(drop|truncate)\s+(database|table|schema)\b|mkfs\b|dd\s+if=)/i;
let isDestructiveCandidate = false;

async function main() {
  const rawInput = readStdin();
  if (rawInput && DESTRUCTIVE_CMD_REGEX.test(rawInput)) {
    isDestructiveCandidate = true;
  }

  if (!rawInput.trim()) {
    if (isDestructiveCandidate) {
      sendDecision('deny', '[FAIL-CLOSED SECURITY GUARD] Input hook kosong pada perintah terindikasi destruktif. Eksekusi ditolak.');
    }
    sendDecision('allow');
  }

  let data;
  try {
    data = JSON.parse(rawInput);
  } catch (_) {
    if (isDestructiveCandidate) {
      sendDecision('deny', '[FAIL-CLOSED SECURITY GUARD] Gagal mem-parse input JSON pada perintah terindikasi destruktif. Eksekusi ditolak.');
    }
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
  const commandLine = (args.CommandLine || '').trim();

  if (!commandLine) {
    sendDecision('allow');
  }

  // 1. HARD RULE: Intercept raw file dumping and obfuscated shell reading bypasses
  // Match only when cat/nl/awk/etc. are actual command invocations (start of line or after ;, |, &, &&, ||)
  const cmdPrefix = '(?:^|[|;&]\\s*|&&\\s*|\\|\\|\\s*|`|\\$\\()';
  const sourceExts = 'vue|ts|js|cjs|mjs|php|blade\\.php|jsx|tsx|css|scss|sass|py|go|rs|sql|sh|bash|zsh|java|c|cpp|h|hpp|rb|graphql|gql|json|ya?ml|toml|env|env\\.[a-z0-9_.-]+|md|txt|xml|html|svg';
  const dumpPatterns = [
    // 1. Direct file reader utilities & binary viewers (with CLI flag tolerance: e.g. cat -n, nl -ba)
    new RegExp(`${cmdPrefix}(cat|gc|type|Get-Content|nl|more|less|paste|xxd|od|hexdump|strings|bat|view)(?:\\s+-[a-zA-Z0-9_.-]+)*\\s+(?!<<)[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 2. PowerShell Get-Content slicing
    new RegExp(`${cmdPrefix}(Get-Content|gc)\\s+.*-(TotalCount|Head|Tail)\\s+([8-9]\\d|[1-9]\\d{2,})\\s+.*\\.(${sourceExts})\\b`, 'i'),
    // 3. Awk / Sed text stream processors dumping files
    new RegExp(`${cmdPrefix}awk\\s+.*(print|\\$0|1)\\b.*[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}sed\\s+(-n\\s+)?["']?(\\d*,?\\d*p?|["']?)\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 4. Inline interpreters (python -c, node -e, ruby -e, perl -e, php -r) reading files
    new RegExp(`${cmdPrefix}(node|bun|deno|python[23]?|perl|ruby|php)\\s+-[ecr]\\s+["\\'][^"\\']*(read|open|pathlib|readFileSync|readFile|file_get_contents|IO\\.|File\\.)[^"\\']*\\b[^"\\']+\\.(${sourceExts})["\\']`, 'i'),
    // 5. General python/node inline file reading (pathlib Path.read_text, etc.)
    new RegExp(`${cmdPrefix}(python[23]?\\s+-[c]|node\\s+-[e]|bun\\s+-[e]|php\\s+-[r])\\s+["\\'].*(Path\\([^)]+\\)\\.read_text|open\\([^)]+\\)\\.read|readFileSync|file_get_contents).*["\\']`, 'i'),
    // 6. Heredoc interpreter reading files
    new RegExp(`${cmdPrefix}(python[23]?|node|bun|bash|sh|perl|ruby)\\s+-[\\s\\S]*<<\\s*['"]?EOF[\\s\\S]*(read_text|open\\(|readFileSync|cat\\s+)[\\s\\S]*EOF`, 'i'),
    // 7. jq inspecting json/yaml files
    new RegExp(`${cmdPrefix}jq\\s+.*[^|;&><\\s]+\\.(json|ya?ml)\\b`, 'i'),
    // 8. grep used as a pseudo file-reader
    new RegExp(`${cmdPrefix}grep\\s+(-v\\s+["'][^"']*["']|-E\\s+["']\\.?\\*["'])\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 9. Shell redirection input directly from source file
    new RegExp(`${cmdPrefix}<\\s*[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 10. Base64 encoding file
    new RegExp(`${cmdPrefix}base64\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 11. Head / Tail dumping lines (including tail -n +1, head -n 100, etc., with CLI flag tolerance)
    new RegExp(`${cmdPrefix}(head|tail)(?:\\s+-[a-zA-Z0-9_+-]+)*\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 12. Diff against /dev/null to read file
    new RegExp(`${cmdPrefix}diff\\s+[^|;&><\\s]*(/dev/null|""|''|-)\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 13. Pr / fold / tee as reader
    new RegExp(`${cmdPrefix}(pr|fold|tee)\\s+.*[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 14. Git show/diff abused to dump whole file
    new RegExp(`${cmdPrefix}git\\s+(show|diff|log\\s+-p)\\s+[^|;&><\\s]*[:/][^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 15. Tar / gzip / zcat
    new RegExp(`${cmdPrefix}(tar|gzip|zcat)\\s+.*\\b[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    // 16. Running scratch/temp scripts created just to read files
    new RegExp(`${cmdPrefix}(node|bun|python[23]?|bash|sh|php|powershell|pwsh)\\s+[^|;&><\\s]*(scratch|tmp|temp)[/\\\\][^|;&><\\s]+\\.(py|js|ts|sh|php|ps1)\\b`, 'i')
  ];

  let matchedPattern = -1;
  const isDumpingSource = dumpPatterns.some((pattern, idx) => {
    if (pattern.test(commandLine)) {
      matchedPattern = idx;
      return true;
    }
    return false;
  });

  if (isDumpingSource) {
    sendDecision(
      'deny',
      `[GUARDRAIL HARD BLOCK] Percobaan pembacaan/dumping source code via terminal terdeteksi (pattern #${matchedPattern}: POSIX/Git/Staging Script bypass).\n` +
      `Command attempted: \`${commandLine.slice(0, 140)}\`\n` +
      `RUTE RESMI WAJIB (ACTIONABLE OFF-RAMP):\n` +
      `• Membaca kode/fungsi: Gunakan precision slicing (view_file dengan StartLine/EndLine sempit <= 200 baris).\n` +
      `• Frontend: Gunakan strata-mcp:inspect_component(symbol='...').\n` +
      `• Backend: Gunakan codegraph:codegraph_explore(symbol='...').\n` +
      `DILARANG KERAS mengakali pembatasan membaca file melalui terminal atau script sementara.`
    );
  }

  // 2. HARD RULE: Heavy or potentially destructive command patterns (Category-Based)
  const heavyCategories = [
    {
      category: 'Test Execution',
      pattern: /\b((bun|npm|pnpm|yarn)\s+test|(vitest|jest|phpunit|artisan\s+test))\b/i,
      keywords: ['test', 'uji', 'run', 'jalankan', 'eksekusi'],
      negationRegex: /\b(jangan|tidak|nggak|bukan|stop|no|don't|dont|not|never|pause|skip|hold|tahan|pending|batalkan|cancel)\s+(\w+\s+){0,3}(test|uji|jalankan|run)\b/i
    },
    {
      category: 'Project Build',
      pattern: /\b(bun|npm|pnpm|yarn)(\s+run)?\s+build\b/i,
      keywords: ['build', 'compile', 'kompilasi', 'jalankan', 'run'],
      negationRegex: /\b(jangan|tidak|nggak|bukan|stop|no|don't|dont|not|never|pause|skip|hold|tahan|pending|batalkan|cancel)\s+(\w+\s+){0,3}(build|compile)\b/i
    },
    {
      category: 'Destructive / High-Risk Action',
      pattern: DESTRUCTIVE_CMD_REGEX,
      keywords: ['push', 'reset', 'clean', 'hapus', 'delete', 'remove', 'drop', 'truncate', 'format', 'force', 'abort'],
      negationRegex: /\b(jangan|tidak|nggak|bukan|stop|no|don't|dont|not|never|pause|skip|hold|tahan|pending|batalkan|cancel)\s+(\w+\s+){0,3}(push|reset|clean|hapus|delete|remove|drop|truncate)\b/i
    },
    {
      category: 'Dependency Management',
      pattern: /\b((npm|bun|pnpm|yarn)\s+(install|add)|composer\s+(require|install))\b/i,
      keywords: ['install', 'add', 'pasang', 'setup', 'unduh', 'require'],
      negationRegex: /\b(jangan|tidak|nggak|bukan|stop|no|don't|dont|not|never|pause|skip|hold|tahan|pending|batalkan|cancel)\s+(\w+\s+){0,3}(install|add|pasang|setup)\b/i
    }
  ];

  const matchedCategories = heavyCategories.filter(cat => cat.pattern.test(commandLine));

  if (matchedCategories.length === 0) {
    sendDecision('allow');
  }

  // 3. HARD RULE: Category-based consent verification with semantic negation detection
  const transcriptPath = data.transcriptPath || '';
  const { content: userPrompt } = getLatestUserTurn(transcriptPath);

  for (const cat of matchedCategories) {
    const regexPerm = new RegExp(`\\b(${cat.keywords.join('|')})\\b`, 'i');
    const hasKeyword = regexPerm.test(userPrompt);
    const isExplicitlyForbidden = cat.negationRegex.test(userPrompt);

    // Fast-path: if exact keyword exists and no negation is present, pass instantly (0ms)
    if (hasKeyword && !isExplicitlyForbidden) {
      continue;
    }

    // Semantic Tier 1: Evaluate via TypeSafe Jev System One coprocessor
    let decision = { value: 'UNCERTAIN', confidence: 0, uncertain: true };
    try {
      decision = await evaluateCommandConsent(userPrompt, commandLine, cat.category, 5000);
    } catch (_) {
      decision = { value: 'UNCERTAIN', confidence: 0, uncertain: true };
    }

    // Pass if Jev confirms explicit affirmative consent with high confidence
    if (decision.value === 'EXPLICIT_AFFIRMATIVE_CONSENT' && decision.confidence >= 0.88) {
      continue;
    }

    const reasonDetail = decision.uncertain
      ? `Explicit affirmative user consent for '${cat.category}' was not found in the latest message.`
      : `[JEV EVALUATION: ${decision.value} (${(decision.confidence * 100).toFixed(0)}%)] Alasan: ${decision.reason || 'Tidak ditemukan afirmasi pasti.'}`;

    sendDecision(
      'force_ask',
      `[COMMAND GATEKEEPER via Jev] Heavy/destructive command detected (${cat.category}):\n\`${commandLine}\`\n` +
      `${reasonDetail}\nExplicit user confirmation is required to proceed.`
    );
  }

  sendDecision('allow');
}

main().catch((err) => {
  if (isDestructiveCandidate) {
    sendDecision('deny', `[FAIL-CLOSED SECURITY GUARD] Hook internal error on potentially destructive command: ${err?.message || 'Unknown error'}. Failing closed for safety.`);
  } else {
    sendDecision('allow');
  }
});
