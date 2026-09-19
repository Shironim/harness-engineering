const fs = require('fs');
const { getLatestUserTurn, getLastTurnContext, getRecentConversationHistory } = require('./lib/session-state.cjs');
const { evaluateIntentAndRouting } = require('./lib/jev-client.cjs');
const { logHookDecision } = require('./lib/audit-logger.cjs');

const startTime = Date.now();

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (_) {
    return '';
  }
}

async function main() {
  const rawInput = readStdin();
  let data = {};
  try {
    if (rawInput.trim()) {
      data = JSON.parse(rawInput);
    }
  } catch (_) {}

  const transcriptPath = data.transcriptPath || '';
  let routingResult = null;

  let rawPromptLength = 0;

  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const userTurn = getLatestUserTurn(transcriptPath);
      const userPrompt = userTurn.content || '';
      rawPromptLength = userPrompt.length;
      const context = getLastTurnContext(transcriptPath);
      const conversationHistory = getRecentConversationHistory(transcriptPath, 4);

      if (userPrompt.trim()) {
        const isShortFollowUp = userPrompt.trim().split(/\s+/).length <= 6 &&
          /\b(ok|oke|lanjutkan|lanjut|kerjakan|eksekusi|setuju|gas|terapkan|buat|buatkan|approved|approve)\b/i.test(userPrompt);

        let enrichedPrompt = userPrompt;
        if (isShortFollowUp && context && (context.prevUserPrompt || context.hasActivePlan)) {
          const prevSummary = (context.prevUserPrompt || '').slice(0, 150).replace(/\n/g, ' ');
          enrichedPrompt = `[Konteks Lanjutan: ${prevSummary}] ${userPrompt}`;
        }
        routingResult = await evaluateIntentAndRouting(enrichedPrompt, 5000, context, conversationHistory);
      }
    } catch (_) {}
  }

  const directiveParts = [
    '[ENGINEERING MANDATE]',
    '• Zero Kludge: Strictly prohibit hacky workarounds ("tambal sulam") and tech-debt shortcuts.',
    '• Industry Standard: Fix root causes via robust, production-grade architecture (12-Factor, SSOT).',
    '• Technical Directness: Concise, actionable correctness over pleasantries.'
  ];

  if (routingResult) {
    const sourceLabel = routingResult.isFromJev
      ? `TypeSafe Jev (${(routingResult.confidence * 100).toFixed(0)}% conf)`
      : 'Deterministic Heuristic Router';

    directiveParts.push(
      '',
      `[JEV COGNITIVE & TOOL ROUTING DIRECTIVE (${sourceLabel})]`,
      `• Intent Domain: ${routingResult.classification} (${routingResult.activeServersCount} Active MCPs)`
    );

    if (routingResult.mentionedEntities && routingResult.mentionedEntities.length > 0) {
      directiveParts.push(`• Mentioned Target Entities: ${routingResult.mentionedEntities.join(', ')}`);
    }

    directiveParts.push(
      `• Prescribed Toolchain: ${routingResult.recommendedTools.length ? routingResult.recommendedTools.join(' ➔ ') : 'NONE (Direct Response)'}`,
      `• Strategi Eksekusi: ${routingResult.routeStrategy}`
    );

    if (routingResult.macroFirstMandate) {
      directiveParts.push(
        '',
        `[MACRO-FIRST ARCHITECTURE MANDATE (Codegraph & Septum First)]`,
        routingResult.macroFirstMandate
      );
    }
  }

  logHookDecision({
    hookName: 'pre-invocation-mindset',
    toolName: 'prompt_intent_router',
    decision: 'inject_directive',
    reason: routingResult ? routingResult.classification : 'default_mandate',
    durationMs: Date.now() - startTime,
    extra: {
      transcriptPath,
      source: routingResult ? (routingResult.isFromJev ? 'typesafe_jev' : 'heuristic') : 'default',
      confidence: routingResult ? routingResult.confidence : null,
      probabilities: routingResult ? routingResult.probabilities : null,
      usage: routingResult ? routingResult.usage : null,
      promptLength: rawPromptLength,
      mentionedEntities: routingResult ? (routingResult.mentionedEntities || []) : []
    }
  });

  const payload = {
    injectSteps: [
      {
        ephemeralMessage: directiveParts.join('\n')
      }
    ]
  };

  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

main().catch(() => {
  const fallback = {
    injectSteps: [
      {
        ephemeralMessage: [
          '[ENGINEERING MANDATE]',
          '• Zero Kludge: Strictly prohibit hacky workarounds ("tambal sulam") and tech-debt shortcuts.',
          '• Industry Standard: Fix root causes via robust, production-grade architecture (12-Factor, SSOT).',
          '• Technical Directness: Concise, actionable correctness over pleasantries.'
        ].join('\n')
      }
    ]
  };
  process.stdout.write(JSON.stringify(fallback));
  process.exit(0);
});
