const fs = require('fs');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (_) {
    return '';
  }
}

function main() {
  readStdin(); // Consume stdin to follow hook lifecycle contract

  const directive = [
    '[ENGINEERING MANDATE]',
    '• Zero Kludge: Strictly prohibit hacky workarounds ("tambal sulam") and tech-debt shortcuts.',
    '• Industry Standard: Fix root causes via robust, production-grade architecture (12-Factor, SSOT).',
    '• Technical Directness: Concise, actionable correctness over pleasantries.'
  ].join('\n');

  const payload = {
    injectSteps: [
      {
        ephemeralMessage: directive
      }
    ]
  };

  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

main();
