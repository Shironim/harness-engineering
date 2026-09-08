const fs = require('fs');
const path = require('path');

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

  const transcriptPath = data.transcriptPath || '';
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

    let modified = false;

    // 2. Lakukan pruning HANYA pada step-step masa lalu (sebelum latestUserStepIdx)
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.step_index >= latestUserStepIdx) {
        // JANGAN SENTUH turn saat ini agar agent tetap memiliki konteks yang diperlukan saat ini
        continue;
      }

      // Pastikan pesan user di masa lalu tidak pernah dirusak
      if (step.type === 'USER_INPUT') {
        continue;
      }

      // A. Pangkas output tool mentah (GENERIC) yang berukuran besar
      if (step.type === 'GENERIC' && typeof step.content === 'string') {
        if (step.content.length > 250 && !step.content.startsWith('[Pruned by GC:')) {
          const originalBytes = step.content.length;
          // Simpan preview 60 karakter pertama agar tetap terbaca secara semantik
          const preview = step.content.slice(0, 60).replace(/\n/g, ' ');
          step.content = `[Pruned by GC: "${preview}..." (${originalBytes} bytes archived to preserve context window)]`;
          
          step.truncated_fields = step.truncated_fields || [];
          if (!step.truncated_fields.includes('content')) {
            step.truncated_fields.push('content');
          }
          modified = true;
        }
      }

      // B. Pangkas internal thinking (Chain-of-Thought) pada turn masa lalu
      if (step.type === 'PLANNER_RESPONSE' && typeof step.thinking === 'string') {
        if (step.thinking.length > 200 && !step.thinking.startsWith('[Pruned by GC:')) {
          const originalBytes = step.thinking.length;
          step.thinking = `[Pruned by GC: Historical CoT (${originalBytes} bytes archived)]`;
          
          step.truncated_fields = step.truncated_fields || [];
          if (!step.truncated_fields.includes('thinking')) {
            step.truncated_fields.push('thinking');
          }
          modified = true;
        }
      }
    }

    // 3. Tulis kembali ke disk secara aman jika ada perubahan
    if (modified) {
      const compactedLines = steps.map(s => JSON.stringify(s)).join('\n') + '\n';
      const tmpPath = `${transcriptPath}.gc_tmp`;
      fs.writeFileSync(tmpPath, compactedLines, 'utf-8');
      fs.renameSync(tmpPath, transcriptPath);
    }
  } catch (err) {
    // Non-blocking: Jika terjadi kesalahan parsing file, jangan hentikan eksekusi
  }

  process.stdout.write('{}');
  process.exit(0);
}

main();
