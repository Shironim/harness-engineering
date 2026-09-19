const fs = require('node:fs');
const path = require('node:path');

const JEV_DEFAULT_MODEL = 'typesafe/jev-1.13';
// OpenRouter dedicated decisions endpoint for System One models
const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Resolves OpenRouter API Key safely.
 * Prioritizes process.env.OPENROUTER_API_KEY.
 * Falls back silently to loading from project root .env if not injected into process environment.
 */
let cachedApiKey = null;

function getApiKey() {
  if (cachedApiKey !== null) return cachedApiKey;

  if (process.env.OPENROUTER_API_KEY) {
    cachedApiKey = process.env.OPENROUTER_API_KEY.trim();
    return cachedApiKey;
  }

  const candidatePaths = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env')
  ];

  for (const envPath of candidatePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            if (key === 'OPENROUTER_API_KEY') {
              const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
              if (val) {
                cachedApiKey = val;
                return cachedApiKey;
              }
            }
          }
        }
      }
    } catch (_) {
      // Fail silently without leaking environment details
    }
  }

  cachedApiKey = '';
  return cachedApiKey;
}

/**
 * Parses JSON response safely even if wrapped in markdown codeblocks.
 */
function extractJsonPayload(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {}
    }
  }
  return null;
}

/**
 * Core Jev decision evaluation via OpenRouter.
 *
 * @param {Object} params
 * @param {any} params.context - Input state/context to be evaluated (string, object, diff, etc.)
 * @param {string[]} params.options - Closed list of allowable decision categories
 * @param {string} params.criteria - Precise evaluation criteria/question
 * @param {number} [params.timeoutMs=600] - Hard network timeout
 * @param {string} [params.model='typesafe/jev-1.13'] - Target Jev model identifier
 * @returns {Promise<{ value: string, confidence: number, uncertain: boolean, reason?: string }>}
 */
async function jevDecide({
  context,
  options,
  criteria,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  model = JEV_DEFAULT_MODEL
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      value: 'UNCERTAIN',
      confidence: 0,
      uncertain: true,
      reason: 'OPENROUTER_API_KEY_UNAVAILABLE'
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const statePayload = typeof context === 'string'
    ? context
    : (context && typeof context === 'object' ? context : { data: context });

  // Construct TypeSafe criteria record mapping each choice to its semantics
  let criteriaRecord = {};
  let validChoices = [];

  if (Array.isArray(options)) {
    validChoices = options;
    for (const opt of options) {
      criteriaRecord[opt] = `Pilihan keputusan: ${opt}`;
    }
  } else if (options && typeof options === 'object') {
    criteriaRecord = options;
    validChoices = Object.keys(options);
  }

  const payload = {
    model,
    state: statePayload,
    questions: {
      decision: {
        type: 'choice',
        instructions: criteria,
        criteria: criteriaRecord
      }
    }
  };

  try {
    const response = await fetch(OPENROUTER_DECISIONS_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://antigravity.cli.local',
        'X-Title': 'AGY Harness Jev Guard'
      },
      body: JSON.stringify(payload)
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      return {
        value: 'UNCERTAIN',
        confidence: 0,
        uncertain: true,
        reason: `HTTP_${response.status}: ${errText.slice(0, 100)}`
      };
    }

    const data = await response.json();
    const answer = data.answers?.decision ||
      data.decisions?.decision ||
      data.decision ||
      data;

    const rawChoice = answer.choice || answer.value || '';
    const probabilities = answer.probabilities || {};

    let confidence = 0.5;
    if (typeof answer.confidence === 'number') {
      confidence = Math.max(0, Math.min(1, answer.confidence));
    } else if (typeof probabilities[rawChoice] === 'number') {
      confidence = Math.max(0, Math.min(1, probabilities[rawChoice]));
    }

    const matchedOption = validChoices.find(
      opt => opt.toLowerCase() === String(rawChoice).toLowerCase()
    );

    const usage = data.usage || null;
    const resolvedModel = data.model || model;

    return {
      value: matchedOption || rawChoice || 'UNCERTAIN',
      confidence,
      probabilities,
      uncertain: !matchedOption,
      reason: `TypeSafe Jev evaluasi selesai dengan konfidensi ${(confidence * 100).toFixed(1)}%`,
      model: resolvedModel,
      usage,
      raw: data
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      value: 'UNCERTAIN',
      confidence: 0,
      uncertain: true,
      reason: err.name === 'AbortError' ? `TIMEOUT_${timeoutMs}MS` : 'NETWORK_ERROR'
    };
  }
}

/**
 * Specialized gatekeeper: Evaluates user consent for heavy commands.
 */
async function evaluateCommandConsent(userPrompt, commandLine, category, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return jevDecide({
    context: {
      latestUserPrompt: userPrompt,
      commandProposed: commandLine,
      commandCategory: category
    },
    options: {
      EXPLICIT_AFFIRMATIVE_CONSENT: 'Pengguna secara jelas mengizinkan, meminta, atau menyetujui eksekusi aksi/perintah ini sekarang dalam pesannya.',
      EXPLICIT_PROHIBITED: 'Pengguna secara eksplisit melarang, membatalkan, atau meminta untuk tidak menjalankan perintah ini.',
      AMBIGUOUS_OR_UNMENTIONED: 'Pengguna tidak menyinggung perintah ini, atau konteksnya masih bersyarat belum pasti.'
    },
    criteria: 'Tentukan apakah pengguna memberikan persetujuan tegas untuk mengeksekusi perintah ini berdasarkan prompt terakhirnya.',
    timeoutMs
  });
}

/**
 * Specialized gatekeeper: Anti-Kludge & Stub integrity check for modified source files.
 */
async function evaluateCodeIntegrity(filePath, codeSnippet, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return jevDecide({
    context: {
      targetFile: path.basename(filePath),
      codeSnippet: codeSnippet.slice(0, 4000)
    },
    options: {
      PRODUCTION_READY: 'Kode merupakan implementasi fungsional utuh tanpa placeholder palsu atau stub darurat.',
      KLUDGE_OR_STUB: 'Kode memuat stub pemalas, implementasi mock darurat, TODO/placeholder yang belum tuntas yang melanggar mandat Zero Kludge.',
      ACCEPTABLE_COMMENT: 'Komentar wajar atau dokumentasi teknis yang bukan merupakan penghindaran implementasi fungsi.'
    },
    criteria: 'Evaluasi integritas semantik kode: apakah kode siap produksi atau memuat stub/kludge yang belum diselesaikan.',
    timeoutMs
  });
}

/**
 * Specialized gatekeeper: Classifies subagent prompt delegation.
 */
async function evaluateSubagentDelegation(subagentPrompt, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return jevDecide({
    context: {
      subagentPrompt: subagentPrompt.slice(0, 3000)
    },
    options: {
      FOCUSED_TASK: 'Tugas subagent berfokus pada analisis terarah, implementasi fungsi spesifik, atau pengujian.',
      RAW_DUMP_OR_BYPASS: 'Tugas subagent berupaya membaca, mencetak, atau mengekstrak seluruh isi berkas mentah untuk menghindari batas baris harness utama.',
      AMBIGUOUS_SCOPE: 'Cakupan tugas tidak terdefinisi secara jelas atau tanpa batasan terukur.'
    },
    criteria: 'Periksa apakah delegasi tugas subagent ini merupakan tugas terarah atau upaya dumping file mentah.',
    timeoutMs
  });
}

/**
 * Ekstraksi deterministik untuk target entitas yang dimention pengguna (file, folder, @mentions).
 *
 * @param {string} text
 * @returns {string[]}
 */
function extractMentionedEntities(text) {
  if (!text || typeof text !== 'string') return [];
  const entities = new Set();

  // 1. @mention paths: @folder/file.ext atau @file atau @folder
  const atRegex = /@([a-zA-Z0-9_\-./\\]+)/g;
  let match;
  while ((match = atRegex.exec(text)) !== null) {
    const raw = match[1].trim().replace(/[.,:;!?]+$/, '');
    if (raw && !raw.includes('@') && raw.length > 1) {
      entities.add(raw);
    }
  }

  // 2. File dengan ekstensi umum (.md, .php, .js, .ts, .json, .vue, dll)
  const fileExtRegex = /(?:^|[\s"'\`(\[])([a-zA-Z0-9_\-./\\]+\.(?:md|php|js|ts|tsx|jsx|json|vue|html|css|py|go|sql|sh|ya?ml|txt|cjs|mjs|env))\b/gi;
  while ((match = fileExtRegex.exec(text)) !== null) {
    const raw = match[1].trim().replace(/[.,:;!?]+$/, '');
    // Abaikan versi semver seperti 1.13 atau angka murni
    if (raw && !/^\d+\.\d+$/.test(raw)) {
      entities.add(raw);
    }
  }

  // 3. Pola eksplisit penyebutan direktori/folder: folder <path>, dir <path>, direktori <path>, path <path>
  // Hindari mencocokkan kata berhubung hyphen (misal: happy-path) atau kata teks biasa
  const folderRegex = /(?:^|[\s"'])dir(?:ektori)?\s+[`"']?([a-zA-Z0-9_\-./\\]+)[`"']?|(?:^|[\s"'])folder\s+[`"']?([a-zA-Z0-9_\-./\\]+)[`"']?|(?:^|[\s"'])path\s+[`"']([a-zA-Z0-9_\-./\\]+)[`"']/gi;
  while ((match = folderRegex.exec(text)) !== null) {
    const raw = (match[1] || match[2] || match[3] || '').trim().replace(/[.,:;!?]+$/, '');
    if (raw && raw.length > 1 && !/\b(file|folder|ini|itu|tersebut|proyek|project|repo|workspace)\b/i.test(raw)) {
      // Pastikan memiliki struktur direktori nyata (memuat slash atau diawali .)
      if (raw.includes('/') || raw.includes('\\') || raw.startsWith('.')) {
        entities.add(raw);
      }
    }
  }

  return Array.from(entities);
}

/**
 * Specialized Cognitive Arbiter: Evaluates user intent and prescribes the token-optimal MCP toolchain.
 * Uses TypeSafe Jev System One with deterministic fallback (0ms) and dynamic active-server verification.
 */
async function evaluateIntentAndRouting(userPrompt, timeoutMs = DEFAULT_TIMEOUT_MS, context = {}, conversationHistory = null) {
  const { getActiveMcpServers, getCompactCapabilityCatalog } = require('./mcp-registry.cjs');
  const activeServers = getActiveMcpServers();
  const activeNames = new Set(activeServers.map(s => s.name));
  const catalog = getCompactCapabilityCatalog();

  const trimmed = (userPrompt || '').trim();
  const mentionedEntities = extractMentionedEntities(trimmed);

  const docExtRegex = /\.(md|mdx|txt|rst|adoc)$/i;
  const isDocEntity = (e) => docExtRegex.test(e);
  const isCodeEntity = (e) => !docExtRegex.test(e);
  const codeEntities = mentionedEntities.filter(isCodeEntity);
  const docEntities = mentionedEntities.filter(isDocEntity);
  const hasOnlyDocEntities = mentionedEntities.length > 0 && codeEntities.length === 0;

  // Pattern A: Widget interactive response (A1:, B2:, etc.), approved artifact, or affirmative continuation
  const isWidgetResponse = /^([A-Z]\d+:|A\d+:)/i.test(trimmed);
  const isLastActionAsk = context && context.lastActionName === 'ask_question';
  const isApprovedArtifact = /^\[Approved\]/i.test(trimmed);
  const actionVerbPattern = /\b(kerjakan|eksekusi|terapkan|buatkan|buat|lanjutkan|lanjut|tulis|refactor|hapus|ubah|gas|setuju|oke|ok|approved|approve)\b/i;
  const isAutonomousConfirmation = /\b(sampai selesai|tanpa konfirmasi|tidak perlu minta konfirmasi|semuanya|sekalian)\b/i.test(trimmed);
  const isShortConfirmation = (trimmed.split(/\s+/).length <= 15 && actionVerbPattern.test(trimmed)) || isAutonomousConfirmation;

  if (isWidgetResponse || isLastActionAsk || isShortConfirmation || isApprovedArtifact) {
    const recommendedTools = [];
    if (activeNames.has('sequential-thinking')) recommendedTools.push('sequentialthinking');
    recommendedTools.push('replace_file_content', 'write_to_file');
    return {
      classification: 'EXECUTION_CONFIRMED',
      isFromJev: false,
      confidence: 1.0,
      recommendedTools,
      routeStrategy: 'Pengguna telah mengonfirmasi aksi/parameter arsitektur secara eksplisit. Lanjutkan eksekusi dan penulisan kode/artifact tanpa klarifikasi ulang.',
      mentionedEntities,
      activeServersCount: activeNames.size
    };
  }

  // Pattern B: Meta Discussion, system reflection, or non-coding prompt
  const metaPatterns = [
    /prompt\s+engineering/i,
    /bagaimana\s+menurutmu/i,
    /apa\s+pendapatmu/i,
    /evaluasi\s+sistem/i,
    /kenapa\s+bisa/i,
    /apakah\s+ada\s+saran/i,
    /^tanya:/i,
    /^diskusi:/i,
    /\brfc\b/i,
    /\bsaran\b/i
  ];
  // Jangan klaim sebagai meta murni jika menyebut entitas kode spesifik atau perintah teknis
  const hasTechnicalTarget = codeEntities.length > 0 || /\b(folder|path|dir|hook|script|\.cjs|\.js|\.ts|\.json|brief|buatkan|buat)\b/i.test(trimmed);
  const isMetaDiscussion = !hasTechnicalTarget && metaPatterns.some(p => p.test(trimmed));
  if (isMetaDiscussion) {
    return {
      classification: 'META_DISCUSSION',
      isFromJev: false,
      confidence: 0.95,
      recommendedTools: ['view_file (read-only)', 'write_to_file (jika buat laporan/brief)'],
      routeStrategy: 'Pengguna sedang berdiskusi konseptual atau meta-evaluasi. Berikan analisis teknis mendalam dan gunakan tool inspeksi berkas jika diperlukan.',
      mentionedEntities,
      activeServersCount: activeNames.size
    };
  }

  // Pattern B2: Document / Note / Specification reading or modification (.md, .txt)
  const docActionPattern = /\b(baca|lihat|tampilkan|cek|periksa|evaluasi|edit|ubah|update|tulis|dokumentasi|doc|notes?|catatan)\b/i;
  if (hasOnlyDocEntities && (docActionPattern.test(trimmed) || trimmed.length <= 100)) {
    const recommendedTools = [];
    if (activeNames.has('sequential-thinking') && /\b(evaluasi|analisis|arsitektur|bandingkan)\b/i.test(trimmed)) {
      recommendedTools.push('sequentialthinking');
    }
    recommendedTools.push('view_file');
    const isEdit = /\b(edit|ubah|update|ganti|tulis|tambahkan)\b/i.test(trimmed);
    if (isEdit) {
      recommendedTools.push('replace_file_content', 'write_to_file');
    }
    return {
      classification: 'DOCUMENTATION_OR_NOTE',
      isFromJev: false,
      confidence: 1.0,
      recommendedTools,
      routeStrategy: 'Target adalah berkas dokumentasi/catatan naratif (.md/.txt). Gunakan view_file secara langsung tanpa melalui codegraph, septum, atau sandbox context-mode.',
      mentionedEntities,
      activeServersCount: activeNames.size
    };
  }

  // Pattern C: Explicit testing & verification request (Phase 4)
  const testPattern = /\b(run\s+test|artisan\s+test|npm\s+test|vitest|jest|phpstan|phpunit|jalankan\s+test|jalankan\s+pengujian|cek\s+test|cek\s+lint|linter)\b/i;
  if (testPattern.test(trimmed)) {
    return {
      classification: 'TEST_AND_VERIFICATION',
      isFromJev: false,
      confidence: 0.95,
      recommendedTools: ['run_command (test/lint)'],
      routeStrategy: 'Jalankan suite verifikasi dan static analysis, parse error log, dan laporkan status hasil pengujian.',
      activeServersCount: activeNames.size
    };
  }

  // Pattern D: Explicit operational git delivery (Phase 5)
  const deliveryPattern = /\b(git\s+commit|atomic\s+commit|buat\s+commit|push\s+branch|buat\s+pr|pull\s+request|stage\s+git)\b/i;
  if (deliveryPattern.test(trimmed)) {
    return {
      classification: 'OPERATIONAL_DELIVERY',
      isFromJev: false,
      confidence: 0.95,
      recommendedTools: ['run_command (git commands)'],
      routeStrategy: 'Eksekusi alur kerja kontrol versi Git (staging atomik, Conventional Commits, push/PR) sesuai standar industri.',
      activeServersCount: activeNames.size
    };
  }

  // Fast-path heuristic router (used as fallback or for instant classification)
  function getHeuristicClassification(prompt) {
    const text = (prompt || '').toLowerCase();
    if (hasOnlyDocEntities) {
      return 'DOCUMENTATION_OR_NOTE';
    }
    if (metaPatterns.some(p => p.test(text))) {
      return 'META_DISCUSSION';
    }
    if (testPattern.test(text)) {
      return 'TEST_AND_VERIFICATION';
    }
    if (deliveryPattern.test(text)) {
      return 'OPERATIONAL_DELIVERY';
    }
    if (text.length < 15 && /\b(benerin|tolong|error|rusak|help|fix|kenapa)\b/i.test(text) && !actionVerbPattern.test(text)) {
      return 'AMBIGUOUS_PROMPT';
    }
    if (/\b(vue|ui|button|modal|component|css|style|tailwind|layout|html|blade|react|frontend|halaman)\b/i.test(text)) {
      return 'FRONTEND_UI';
    }
    if (/\b(query|database|sql|migration|model|controller|api|endpoint|route|backend|service|orm)\b/i.test(text)) {
      return 'BACKEND_LOGIC';
    }
    if (/\b(baca banyak|semua file|batch|agregasi|log|cari di seluruh|compare|hitung baris)\b/i.test(text)) {
      return 'BATCH_DATA_OR_LOG';
    }
    if (/\b(git|commit|push|pull|branch|merge|rebase|stash|checkout)\b/i.test(text)) {
      return 'OPERATIONAL_DELIVERY';
    }
    return 'GENERAL_REASONING';
  }

  let classification = 'GENERAL_REASONING';
  let isFromJev = false;
  let confidence = 0.5;
  let probabilities = null;
  let usage = null;
  let resolvedModel = JEV_DEFAULT_MODEL;

  if (trimmed.length > 5) {
    try {
      const jevContext = {
        activeMcpCatalog: catalog,
        latestUserPrompt: trimmed.slice(0, 3500)
      };

      if (mentionedEntities.length > 0) {
        jevContext.targetEntitiesMentioned = mentionedEntities;
      }

      if (conversationHistory && Array.isArray(conversationHistory.turns) && conversationHistory.turns.length > 0) {
        jevContext.recentConversationTurns = conversationHistory.turns;
        if (conversationHistory.activeGoal) {
          jevContext.activeGoalOrTopic = conversationHistory.activeGoal;
        }
        if (conversationHistory.activeProject) {
          jevContext.activeWorkspaceProject = conversationHistory.activeProject;
        }
        if (conversationHistory.recentFilesTouched && conversationHistory.recentFilesTouched.length > 0) {
          jevContext.recentFilesTouched = conversationHistory.recentFilesTouched;
        }
      } else if (context && context.prevUserPrompt) {
        jevContext.previousUserPrompt = context.prevUserPrompt.slice(0, 600);
      }

      const decision = await jevDecide({
        context: jevContext,
        options: {
          FRONTEND_UI: 'Tugas terkait tampilan, komponen UI, Vue, React, CSS, props, atau visual state (Fase 1: Investigasi Frontend).',
          BACKEND_LOGIC: 'Tugas terkait API, routing, controller, database query, backend flow, atau call graph (Fase 1: Investigasi Backend).',
          BATCH_DATA_OR_LOG: 'Tugas membaca banyak file, agregasi data besar, perbandingan log, atau pencarian lintas modul (Fase 1: Investigasi Batch).',
          ALIGNMENT_DECISION: 'Tugas perumusan opsi desain atau keputusan arsitektural yang memerlukan persetujuan pengguna (Fase 2: Alignment).',
          EXECUTION_CONFIRMED: 'Konfirmasi pelaksanaan rencana, afirmasi persetujuan pengguna ("setuju", "kerjakan", "eksekusi") (Fase 3: Modifikasi).',
          TEST_AND_VERIFICATION: 'Tugas menjalankan pengujian kode, tes unit/integrasi, atau static analysis (Fase 4: Verifikasi).',
          OPERATIONAL_DELIVERY: 'Tugas terkait kontrol versi git, pembuatan commit atomik, push, atau penyiapan Pull Request (Fase 5: Delivery).',
          META_DISCUSSION: 'Diskusi konseptual, evaluasi sistem/harness, tanya-jawab reflektif, review dokumen/RFC, atau non-coding (Fase 0: Meta).',
          AMBIGUOUS_PROMPT: 'Prompt pengguna terlalu abstrak, ambigu, atau tidak spesifik apa yang harus dikerjakan.',
          GENERAL_REASONING: 'Pertanyaan umum, perencanaan arsitektur konseptual, atau diskusi teknis.'
        },
        criteria: 'Klasifikasikan intent pengguna ke dalam domain eksekusi yang paling tepat dan hemat token berdasarkan prompt terakhir DAN konteks percakapan riwayat multi-turn sebelumnya yang disertakan.',
        timeoutMs
      });

      if (decision && !decision.uncertain && decision.value !== 'UNCERTAIN' && decision.confidence >= 0.40) {
        classification = decision.value;
        isFromJev = true;
        confidence = decision.confidence;
        probabilities = decision.probabilities || null;
        usage = decision.usage || null;
        resolvedModel = decision.model || JEV_DEFAULT_MODEL;
      } else {
        classification = getHeuristicClassification(userPrompt);
      }
    } catch (_) {
      classification = getHeuristicClassification(userPrompt);
    }
  }

  // Construct active toolchain recommendations based on actual active servers
  const recommendedTools = [];
  let routeStrategy = '';

  if (activeNames.has('sequential-thinking') && classification !== 'META_DISCUSSION') {
    recommendedTools.push('sequentialthinking');
  }

  switch (classification) {
    case 'EXECUTION_CONFIRMED':
      recommendedTools.push('replace_file_content', 'write_to_file');
      routeStrategy = 'Pengguna telah mengonfirmasi aksi/parameter arsitektur secara eksplisit. Lanjutkan penulisan kode tanpa klarifikasi ulang.';
      break;

    case 'DOCUMENTATION_OR_NOTE':
      recommendedTools.push('view_file');
      if (/\b(edit|ubah|update|ganti|tulis|tambahkan)\b/i.test(trimmed)) {
        recommendedTools.push('replace_file_content', 'write_to_file');
      }
      routeStrategy = 'Target adalah berkas dokumentasi/catatan naratif (.md/.txt). Gunakan view_file secara langsung tanpa melalui codegraph, septum, atau sandbox context-mode.';
      break;

    case 'ALIGNMENT_DECISION':
      recommendedTools.unshift('ask_question');
      routeStrategy = 'Rumuskan alternatif arsitektural dan minta konfirmasi trade-off pengguna via modal ask_question.';
      break;

    case 'META_DISCUSSION':
      recommendedTools.push('view_file (read-only)', 'write_to_file (brief/report)');
      routeStrategy = 'Pengguna sedang berdiskusi konseptual atau meta-evaluasi. Berikan analisis teknis mendalam dan gunakan tool inspeksi berkas atau pembuatan dokumen/brief jika diperlukan.';
      break;

    case 'TEST_AND_VERIFICATION':
      const isNegated = /\b(jangan|tidak|nggak|bukan|stop|no|don't|dont|not|never|pause|skip|hold|tahan|pending|batalkan|cancel|tanpa)\s+(\w+\s+){0,3}(test|uji|jalankan|run)\b/i.test(trimmed);
      const hasExplicitAffirmation = !isNegated && /\b(jalankan|run|eksekusi|test|uji)\b/i.test(trimmed) && !/\b(unit\s+test|cakupan|coverage|audit|review)\b/i.test(trimmed.replace(/\b(jalankan|run|eksekusi)\b/gi, ''));
      if (hasExplicitAffirmation) {
        recommendedTools.push('run_command (test/lint)');
        routeStrategy = 'Jalankan suite verifikasi dan static analysis, parse error log, dan laporkan status hasil pengujian.';
      } else {
        recommendedTools.push('view_file (read-only audit)', 'ask_question (jika butuh izin eksekusi test)');
        routeStrategy = 'Analisis statis dan review logika kode secara non-destruktif. Minta izin afirmatif pengguna jika perlu menjalankan test suite.';
      }
      break;

    case 'OPERATIONAL_DELIVERY':
    case 'SYSTEM_OR_GIT':
      recommendedTools.push('run_command (git commands)');
      routeStrategy = 'Eksekusi alur kerja kontrol versi Git (staging atomik, Conventional Commits, push/PR) sesuai standar industri.';
      break;

    case 'FRONTEND_UI':
      if (activeNames.has('strata-mcp')) {
        recommendedTools.push('strata-mcp:inspect_component', 'strata-mcp:trace_state');
        routeStrategy = 'Gunakan strata-mcp untuk inspeksi AST komponen/props tanpa mendump template mentah.';
      } else {
        recommendedTools.push('view_file (precision-slice <= 40 baris)');
        routeStrategy = 'strata-mcp tidak aktif; gunakan precision slicing view_file.';
      }
      break;

    case 'BACKEND_LOGIC':
      if (activeNames.has('codegraph')) {
        recommendedTools.push('codegraph:codegraph_explore');
        routeStrategy = 'Gunakan codegraph untuk memetakan inbound/outbound callers & blast radius dalam 1 call.';
      } else {
        recommendedTools.push('find_by_name', 'view_file (precision-slice)');
        routeStrategy = 'codegraph tidak aktif; telusuri via find_by_name & precision slicing.';
      }
      break;

    case 'BATCH_DATA_OR_LOG':
      if (activeNames.has('context-mode')) {
        recommendedTools.push('context-mode:ctx_execute', 'context-mode:ctx_search');
        routeStrategy = 'Gunakan context-mode (ctx_execute sandbox) untuk mengagregasi berkas menjadi ringkasan <= 30 baris.';
      } else {
        recommendedTools.push('grep_search terarah');
        routeStrategy = 'context-mode tidak aktif; gunakan grep_search terarah dengan Includes sempit.';
      }
      break;

    case 'AMBIGUOUS_PROMPT':
      if (context && (context.hasActivePlan || context.prevUserPrompt)) {
        recommendedTools.push('sequentialthinking', 'replace_file_content', 'write_to_file');
        routeStrategy = 'Intent ringkas dalam sesi aktif: lanjutkan eksekusi rencana kerja yang telah disetujui tanpa klarifikasi ulang.';
      } else {
        recommendedTools.unshift('ask_question');
        routeStrategy = 'PERINGATAN: Intent pengguna ambigu dan tidak ada rencana aktif! Dilarang blind search; ajukan klarifikasi via ask_question.';
      }
      break;

    default:
      routeStrategy = 'Awali dengan pemetaan langkah mendalam sebelum memodifikasi kode.';
      break;
  }

  // Macro-First Architecture Check: Hanya aktif jika ada entitas CODE yang dimention (abaikan .md / .txt murni)
  const hasCodegraph = activeNames.has('codegraph');
  const hasSeptum = activeNames.has('septum');
  let macroFirstMandate = null;

  if (codeEntities.length > 0) {
    const macroTools = [];
    if (hasCodegraph) macroTools.push('codegraph (codegraph_explore)');
    if (hasSeptum) macroTools.push('septum (septum_trace_vertical_slice / septum_locate_symbol / septum_check_boundary)');

    if (macroTools.length > 0) {
      macroFirstMandate = [
        `Target entitas kode terdeteksi: [${codeEntities.join(', ')}].`,
        `1. [Fase Makro-Level Wajib]: Dilarang langsung membaca berkas/folder mentah dengan view_file secara buta.`,
        `2. Gunakan ${macroTools.join(' dan ')} untuk memetakan arsitektur, daftar fungsi di berkas tersebut, pemanggil (inbound/outbound callers), dan batasan domain (boundaries) terlebih dahulu.`,
        `3. [Init Check]: Jika index Codegraph atau Septum belum tersedia di workspace ini, lakukan atau rekomendasikan inisialisasi terlebih dahulu.`,
        `4. [Fase Mikro-Level Presisi]: Setelah relasi simbol dan fungsi terpetakan, gunakan view_file secara terarah (precision slicing <= 200 baris) agar investigasi tidak salah arah.`
      ].join('\n  ');
    } else {
      macroFirstMandate = [
        `Target entitas kode terdeteksi: [${codeEntities.join(', ')}].`,
        `Catatan: Codegraph / Septum belum aktif di MCP config. Rekomendasikan inisialisasi / aktivasi Codegraph atau Septum untuk pemetaan makro-level sebelum inspeksi kode.`
      ].join('\n  ');
    }

    // Re-order recommendedTools jika bukan tugas git atau test
    if (!['OPERATIONAL_DELIVERY', 'TEST_AND_VERIFICATION', 'EXECUTION_CONFIRMED', 'DOCUMENTATION_OR_NOTE'].includes(classification)) {
      const macroItems = [];
      if (hasCodegraph && !recommendedTools.includes('codegraph:codegraph_explore')) {
        macroItems.push('codegraph:codegraph_explore');
      }
      if (hasSeptum && !recommendedTools.some(t => t.startsWith('septum:'))) {
        macroItems.push('septum:septum_trace_vertical_slice');
      }
      if (!hasCodegraph && !hasSeptum) {
        macroItems.push('init codegraph/septum');
      }

      // Sisipkan setelah sequentialthinking (jika ada)
      const seqIdx = recommendedTools.indexOf('sequentialthinking');
      const insertIdx = seqIdx !== -1 ? seqIdx + 1 : 0;
      recommendedTools.splice(insertIdx, 0, ...macroItems);

      // Pastikan ada precision view_file
      if (!recommendedTools.some(t => t.includes('view_file'))) {
        recommendedTools.push('view_file (precision-slice <= 200 baris)');
      }

      routeStrategy = `[Macro-First]: Terdeteksi target entitas kode [${codeEntities.join(', ')}]. Wajib petakan fungsi & relasi via codegraph/septum (init jika belum tersedia) sebelum inspeksi baris file secara presisi. ${routeStrategy}`;
    }
  } else if (docEntities.length > 0) {
    // Entitas HANYA berkas dokumen/teks (.md, .txt, dll.)
    // Pastikan tidak ada codegraph / septum di recommendedTools
    const filteredTools = recommendedTools.filter(t => !t.startsWith('codegraph') && !t.startsWith('septum'));
    recommendedTools.length = 0;
    recommendedTools.push(...filteredTools);
    if (!recommendedTools.some(t => t.includes('view_file'))) {
      const seqIdx = recommendedTools.indexOf('sequentialthinking');
      const insertIdx = seqIdx !== -1 ? seqIdx + 1 : 0;
      recommendedTools.splice(insertIdx, 0, 'view_file');
    }
    routeStrategy = `Target adalah berkas dokumen/catatan naratif [${docEntities.join(', ')}]. Gunakan view_file secara langsung tanpa pemanggilan codegraph, septum, atau context-mode. ${routeStrategy}`;
  }

  return {
    classification,
    isFromJev,
    confidence,
    probabilities,
    usage,
    model: resolvedModel,
    recommendedTools,
    routeStrategy,
    mentionedEntities,
    macroFirstMandate,
    activeServersCount: activeNames.size
  };
}

module.exports = {
  jevDecide,
  evaluateCommandConsent,
  evaluateCodeIntegrity,
  evaluateSubagentDelegation,
  evaluateIntentAndRouting,
  extractMentionedEntities,
  JEV_DEFAULT_MODEL
};
