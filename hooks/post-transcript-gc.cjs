const fs = require('fs');
const path = require('path');
const { runDcpPipeline } = require('./lib/dcp-core.cjs');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (_) {
    return '';
  }
}

function main() {
  const rawInput = readStdin();
  if (!rawInput.trim()) {
    process.stdout.write('{}');
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(rawInput);
  } catch (_) {
    process.stdout.write('{}');
    process.exit(0);
  }

  const transcriptPath = data.transcriptPath || data.transcript_path || data.transcriptFile || data.transcript_file || data.path || '';
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    process.stdout.write('{}');
    process.exit(0);
  }

  try {
    const rawContent = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = rawContent.split('\n');
    if (lines.length === 0) {
      process.stdout.write('{}');
      process.exit(0);
    }

    const steps = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        steps.push(JSON.parse(line));
      } catch (_) {
        // preserve non-parsable lines as-is
      }
    }

    if (steps.length === 0) {
      process.stdout.write('{}');
      process.exit(0);
    }

    // 1. Temukan index step USER_INPUT terbaru
    let latestUserStepIdx = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].type === 'USER_INPUT') {
        latestUserStepIdx = steps[i].step_index;
        break;
      }
    }

    // Jika tidak ditemukan USER_INPUT atau hanya ada 1 turn awal, jangan pangkas
    if (latestUserStepIdx <= 0) {
      process.stdout.write('{}');
      process.exit(0);
    }

    // 2. Lakukan Dynamic Context Pruning (DCP) pada step-step masa lalu
    const initialStepsCount = steps.length;
    const modified = runDcpPipeline(steps, latestUserStepIdx);

    // 3. Tulis kembali ke disk secara aman jika ada perubahan
    if (modified) {
      const compactedLines = steps.map(s => JSON.stringify(s)).join('\n') + '\n';
      const tmpPath = `${transcriptPath}.gc_tmp_${Date.now()}`;
      try {
        fs.writeFileSync(tmpPath, compactedLines, 'utf-8');
        fs.renameSync(tmpPath, transcriptPath);
      } catch (renameErr) {
        // Fallback untuk Windows jika fs.renameSync terhalang file lock (EBUSY/EPERM)
        try {
          fs.writeFileSync(transcriptPath, compactedLines, 'utf-8');
        } catch (_) {}
      } finally {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (_) {}
      }

      // 4. Telemetri metrik pemangkasan (Observability)
      try {
        const logDir = path.dirname(transcriptPath);
        const metricsPath = path.join(logDir, 'gc-metrics.jsonl');
        const originalBytes = rawContent.length;
        const compactedBytes = compactedLines.length;
        const savedBytes = Math.max(0, originalBytes - compactedBytes);
        const savedPercent = originalBytes > 0
          ? ((savedBytes / originalBytes) * 100).toFixed(1) + '%'
          : '0.0%';

        const metricRecord = JSON.stringify({
          timestamp: new Date().toISOString(),
          transcript: path.basename(transcriptPath),
          originalSteps: initialStepsCount,
          compactedSteps: steps.length,
          originalBytes,
          compactedBytes,
          savedBytes,
          savedPercent
        }) + '\n';
        fs.appendFileSync(metricsPath, metricRecord, 'utf-8');
      } catch (_) {}
    }
  } catch (err) {
    // Non-blocking: Jika terjadi kesalahan parsing file, jangan hentikan eksekusi
  }

  process.stdout.write('{}');
  process.exit(0);
}

main();
