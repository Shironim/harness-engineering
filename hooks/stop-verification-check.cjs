const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  getLatestUserTurn,
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

function sendDecision(decision, reason) {
  if (decision === 'deny' && globalTranscriptPath) {
    recordTurnDenial(globalTranscriptPath);
  }
  const payload = { decision };
  if (reason) payload.reason = reason;
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function checkGitConflictMarkers(content) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^<{7}\s+/.test(line) || /^={7}$/.test(line) || /^>{7}\s+/.test(line)) {
      return `Baris ${i + 1}: Ditemukan unresolved git conflict marker (\`${line.trim()}\`)`;
    }
  }
  return null;
}

function checkSyntax(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // 1. JSON Structural Validation
  if (ext === '.json') {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      JSON.parse(content);
      return null;
    } catch (err) {
      return `Format JSON tidak valid: ${err.message}`;
    }
  }

  // 2. JavaScript / CommonJS / ES Modules Validation
  if (['.js', '.cjs', '.mjs'].includes(ext)) {
    try {
      const res = spawnSync(process.execPath, ['--check', filePath], {
        encoding: 'utf-8',
        timeout: 4000,
        windowsHide: true
      });
      if (res.status !== 0) {
        const errorDetails = (res.stderr || res.stdout || '').trim().split('\n').slice(0, 5).join('\n');
        return `Syntax error (Node.js):\n${errorDetails}`;
      }
      return null;
    } catch (err) {
      return null; // Non-fatal jika spawn gagal
    }
  }

  // 3. TypeScript Validation (Node 22 native type-stripping)
  if (['.ts', '.mts', '.cts'].includes(ext)) {
    try {
      const res = spawnSync(process.execPath, ['--experimental-strip-types', '--check', filePath], {
        encoding: 'utf-8',
        timeout: 4000,
        windowsHide: true
      });
      if (res.status !== 0) {
        const errText = (res.stderr || res.stdout || '').trim();
        if (errText && !errText.includes('ExperimentalWarning')) {
          const errorDetails = errText.split('\n').slice(0, 5).join('\n');
          return `Syntax error (TypeScript parser):\n${errorDetails}`;
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  // 4. PHP Validation (if php CLI is present)
  if (ext === '.php') {
    try {
      const res = spawnSync('php', ['-l', filePath], {
        encoding: 'utf-8',
        timeout: 4000,
        windowsHide: true
      });
      if (res.status !== 0 && res.stderr) {
        return `Syntax error (PHP Lint):\n${res.stderr.trim().split('\n').slice(0, 3).join('\n')}`;
      }
      return null;
    } catch (_) {
      return null; // php CLI not available in environment
    }
  }

  // 5. Python Validation (if python CLI is present)
  if (ext === '.py') {
    try {
      const res = spawnSync('python', ['-m', 'py_compile', filePath], {
        encoding: 'utf-8',
        timeout: 4000,
        windowsHide: true
      });
      if (res.status !== 0 && res.stderr) {
        return `Syntax error (Python py_compile):\n${res.stderr.trim().split('\n').slice(0, 3).join('\n')}`;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  return null;
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
  if (!globalTranscriptPath || !fs.existsSync(globalTranscriptPath)) {
    sendDecision('allow');
  }

  // 0. CIRCUIT BREAKER: Jangan lakukan infinite loop jika sudah 3x ditolak berturut-turut
  if (isCircuitBreakerTripped(globalTranscriptPath, 3)) {
    sendDecision('allow');
  }

  const userTurn = getLatestUserTurn(globalTranscriptPath);
  const modifiedFiles = new Set();

  // 1. Ekstrak berkas-berkas yang dimodifikasi oleh agen dalam turn aktif
  for (const step of userTurn.turnSteps) {
    if (step.tool_calls && Array.isArray(step.tool_calls)) {
      for (const call of step.tool_calls) {
        if (call.name === 'replace_file_content' || call.name === 'write_to_file') {
          const args = call.args || {};
          const target = normalizePath(args.TargetFile || args.targetFile || '');
          if (target) {
            // Abaikan dokumen internal artefak brain atau scratch
            const isInternalArtifact =
              /\/(antigravity-cli|antigravity-ide|\.antigravity|\.gemini)\/brain\/[a-f0-9-]+\//i.test(target) ||
              /\/scratch\/.*$/i.test(target);
            if (!isInternalArtifact) {
              modifiedFiles.add(target);
            }
          }
        }
      }
    }
  }

  // Jika tidak ada berkas kode yang diubah pada turn ini, izinkan stop
  if (modifiedFiles.size === 0) {
    sendDecision('allow');
  }

  const failures = [];

  // 2. Jalankan validasi pada setiap berkas yang dimodifikasi
  for (const file of modifiedFiles) {
    if (!fs.existsSync(file)) continue;

    try {
      const content = fs.readFileSync(file, 'utf-8');

      // A. Pemeriksaan Unresolved Conflict Markers
      const conflictError = checkGitConflictMarkers(content);
      if (conflictError) {
        failures.push(`• [${path.basename(file)}]: ${conflictError}`);
        continue;
      }

      // B. Pemeriksaan Sintaksis
      const syntaxError = checkSyntax(file);
      if (syntaxError) {
        failures.push(`• [${path.basename(file)}]: ${syntaxError}`);
      }
    } catch (readErr) {
      // Lewati jika berkas terhalang akses atau terhapus
    }
  }

  // 3. Evaluasi Hasil
  if (failures.length > 0) {
    sendDecision(
      'deny',
      `[STOP BLOCKED: VERIFICATION GATEKEEPER]\n` +
      `Agen dilarang menyelesaikan tugas karena ditemukan berkas kode dengan kesalahan sintaks atau konflik:\n\n` +
      failures.join('\n\n') +
      `\n\nTINDAKAN WAJIB:\n` +
      `Perbaiki kesalahan sintaks/konflik pada berkas di atas menggunakan 'replace_file_content' sebelum mengakhiri turn.`
    );
  }

  sendDecision('allow');
}

main();
