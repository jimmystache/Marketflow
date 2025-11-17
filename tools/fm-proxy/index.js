const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configuration: path to fm-manager.jar (default: project tools folder)
const FM_MANAGER_JAR = process.env.FM_MANAGER_JAR_PATH || path.join(__dirname, 'fm-manager.jar');

function ensureFmDir() {
  const fmDir = path.join(os.homedir(), '.fm');
  if (!fs.existsSync(fmDir)) fs.mkdirSync(fmDir, { recursive: true });
  return fmDir;
}

app.post('/run-trades', async (req, res) => {
  try {
    const { marketplaceId, sessionId, token, username, password } = req.body || {};

    if (!marketplaceId || !sessionId) {
      return res.status(400).json({ error: 'marketplaceId and sessionId are required' });
    }

    // Prefer a repository-local credential file if present (tools/fm-proxy/credential).
    // This avoids overwriting the user's ~/.fm/credential when a trusted repo credential is available.
    const localCredentialPath = path.join(__dirname, 'credential');
    let credentialPath;

    if (fs.existsSync(localCredentialPath)) {
      console.log('Using local credential file at', localCredentialPath);
      credentialPath = localCredentialPath;
    } else {
      const fmDir = ensureFmDir();
      // Create credential file in ~/.fm/credential. Format: JSON with token or username/password.
      credentialPath = path.join(fmDir, 'credential');
      let credentialContent;
      if (token) {
        credentialContent = JSON.stringify({ token });
      } else if (username && password) {
        credentialContent = JSON.stringify({ username, password });
      } else {
        // No credentials provided; create an empty credential file
        credentialContent = JSON.stringify({});
      }
      fs.writeFileSync(credentialPath, credentialContent, { encoding: 'utf8' });
      console.log('Wrote credential to', credentialPath);
    }

    // Build the command.
    // NOTES / ASSUMPTIONS:
    // - The fm-manager.jar must be present at FM_MANAGER_JAR path or specify FM_MANAGER_JAR_PATH env var
    // - The tool is expected to read the credential file from ~/.fm/credential when --credential credential is used
    // - This proxy runs the jar locally and returns stdout (CSV) as text

    const endpointArg = `https://fm-data.herokuapp.com/api/marketplaces/${marketplaceId}`;
    const jarPath = FM_MANAGER_JAR;

    if (!fs.existsSync(jarPath)) {
      return res.status(500).json({ error: `fm-manager.jar not found at ${jarPath}. Set FM_MANAGER_JAR_PATH env var or place jar there.` });
    }

    // Compose args array
  // Pass the absolute path to the credential file so fm-manager can read it reliably.
  const args = ['-jar', jarPath, '--credential', credentialPath, '--endpoint', endpointArg, 'trades', '--sessions=' + sessionId];

  // Spawn java process (avoid shell:true to keep args escaped)
  const java = spawn('java', args);

    let stdout = '';
    let stderr = '';

    java.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    java.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    java.on('close', (code) => {
      if (code === 0) {
        // Success — return CSV text
        res.setHeader('Content-Type', 'text/csv');
        return res.status(200).send(stdout);
      }
      // Failure — return stderr
      return res.status(500).json({ error: 'fm-manager exited with code ' + code, details: stderr || stdout });
    });
  } catch (err) {
    console.error('Error in /run-trades:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`fm-proxy listening on ${PORT}`));
