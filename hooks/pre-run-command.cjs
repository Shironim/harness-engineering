const fs = require('fs');
const { getLatestUserTurn, isCircuitBreakerTripped, recordTurnDenial } = require('./lib/session-state.cjs');

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
  const cmdPrefix = '(?:^|[|;&]\\s*|&&\\s*|\\|\\|\\s*)';
  const sourceExts = 'vue|ts|js|php|blade\\.php|jsx|tsx|css|scss|py|go|rs|sql|sh|bash|java|c|cpp|rb|graphql|gql|json';
  const dumpPatterns = [
    new RegExp(`${cmdPrefix}(cat|nl|more|less|paste)\\s+(?!<<)[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}awk\\s+.*(print|\\$0).*[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}(node|python[23]?|perl|ruby)\\s+-[ec]\\s+["\\'][^"\\']*(read|open|readFileSync)[^"\\']*\\b[^"\\']+\\.(${sourceExts})["\\']`, 'i'),
    new RegExp(`${cmdPrefix}grep\\s+-v\\s+["'][^"']*["']\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}<\\s*[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}base64\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}(head|tail)\\s+-n\\s+([8-9]\\d|[1-9]\\d{2,})\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}sed\\s+(-n\\s+)?["'][^"']*p["']\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}diff\\s+[^|;&><\\s]*(/dev/null|""|''|-)\\s+[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}(pr|fold|tee)\\s+.*[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}git\\s+(show|diff|log\\s+-p)\\s+[^|;&><\\s]*[:/][^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}(tar|gzip|zcat)\\s+.*\\b[^|;&><\\s]+\\.(${sourceExts})\\b`, 'i'),
    new RegExp(`${cmdPrefix}(node|bun|python[23]?|bash|sh|php)\\s+[^|;&><\\s]*(scratch|tmp|temp)[/\\\\][^|;&><\\s]+\\.(py|js|ts|sh|php)\\b`, 'i')
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
      `• Membaca kode/fungsi: Gunakan precision slicing (view_file dengan StartLine/EndLine sempit <= 80 baris).\n` +
      `• Frontend: Gunakan strata-mcp:inspect_component(symbol='...').\n` +
      `• Backend: Gunakan codegraph:codegraph_explore(symbol='...').\n` +
      `DILARANG KERAS mengakali pembatasan membaca file melalui terminal atau script sementara.`
    );
  }

  // 2. HARD RULE: Heavy or potentially destructive command patterns
  const heavyPatterns = [
    /\b(bun|npm|pnpm|yarn)\s+test\b/i,
    /\b(vitest|jest|phpunit|artisan\s+test)\b/i,
    /\b(bun|npm|pnpm|yarn)(\s+run)?\s+build\b/i,
    /\bgit\s+(push|reset\s+--hard|clean\s+-[a-zA-Z]*f)\b/i,
    /\b(npm|bun|pnpm|yarn)\s+(install|add)\b/i,
    /\bcomposer\s+(require|install)\b/i
  ];

  const isHeavyCommand = heavyPatterns.some(pattern => pattern.test(commandLine));

  if (!isHeavyCommand) {
    sendDecision('allow');
  }

  // 3. HARD RULE: Consent verification with semantic negation detection
  const transcriptPath = data.transcriptPath || '';
  const { content: userPrompt } = getLatestUserTurn(transcriptPath);

  const permissionKeywords = [
    'test', 'build', 'jalankan', 'uji', 'run', 'eksekusi', 
    'install', 'pasang', 'push', 'reset', 'clean', 'lanjutkan', 
    'kerjakan', 'buat', 'setup'
  ];

  const regexPerm = new RegExp(`\\b(${permissionKeywords.join('|')})\\b`, 'i');
  const hasKeyword = regexPerm.test(userPrompt);

  // Check for negation prefixes before action keywords (e.g. "don't build", "jangan ditest", "hold execution")
  const negationRegex = /\b(jangan|tidak|nggak|bukan|stop|no|don't|dont|not|never|pause|skip|hold|tahan|pending|batalkan|cancel)\s+(\w+\s+){0,3}(test|build|jalankan|run|push|install|reset|eksekusi)\b/i;
  const isExplicitlyForbidden = negationRegex.test(userPrompt);

  if (!hasKeyword || isExplicitlyForbidden) {
    sendDecision(
      'force_ask',
      `[COMMAND GATEKEEPER] Heavy or destructive command detected:\n\`${commandLine}\`\n` +
      `Explicit affirmative user consent was not found in the latest message (or a negation was detected). Explicit user confirmation is required to proceed.`
    );
  }

  sendDecision('allow');
}

main();
