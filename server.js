const express = require('express');
const { exec, execFile } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3030;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper ────────────────────────────────────────────────────────────────────

function runDockerCommand(args, callback) {
  execFile('docker', args, { timeout: 60000 }, (err, stdout, stderr) => {
    if (err && !stdout) {
      return callback({ error: stderr || err.message }, null);
    }
    callback(null, stdout.trim() || stderr.trim());
  });
}

// ─── List Resources ────────────────────────────────────────────────────────────

app.get('/api/containers', (_req, res) => {
  runDockerCommand(
    ['ps', '-a', '--format', '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'],
    (err, out) => {
      if (err) return res.status(500).json(err);
      const containers = out
        ? out.split('\n').filter(Boolean).map(line => {
            const [id, name, image, status, ports] = line.split('|');
            return { id, name, image, status, ports };
          })
        : [];
      res.json(containers);
    }
  );
});

app.get('/api/images', (_req, res) => {
  runDockerCommand(
    ['images', '--format', '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedSince}}'],
    (err, out) => {
      if (err) return res.status(500).json(err);
      const images = out
        ? out.split('\n').filter(Boolean).map(line => {
            const [id, repository, tag, size, created] = line.split('|');
            return { id, repository, tag, size, created };
          })
        : [];
      res.json(images);
    }
  );
});

// ─── Docker Commands ───────────────────────────────────────────────────────────

app.post('/api/command', (req, res) => {
  const { command, target, imageTag } = req.body;

  if (!command || !target) {
    return res.status(400).json({ error: 'command and target are required' });
  }

  const safe = /^[a-zA-Z0-9_\-:/\.]+$/;
  if (!safe.test(target)) {
    return res.status(400).json({ error: 'Invalid target name' });
  }

  let args;
  switch (command) {
    case 'remove': {
      exec(
        `docker stop ${target} 2>/dev/null; docker rm -f ${target} 2>/dev/null; docker rmi -f ${imageTag || target} 2>/dev/null`,
        { timeout: 60000 },
        (_err, stdout, stderr) => {
          res.json({ output: stdout + (stderr || ''), success: true });
        }
      );
      return;
    }
    case 'remove-container': {
      exec(
        `docker stop ${target} 2>/dev/null; docker rm -f ${target} 2>/dev/null`,
        { timeout: 60000 },
        (_err, stdout, stderr) => {
          res.json({ output: stdout + (stderr || ''), success: true });
        }
      );
      return;
    }
    case 'remove-image': {
      exec(
        `docker rmi -f ${target} 2>/dev/null`,
        { timeout: 60000 },
        (_err, stdout, stderr) => {
          res.json({ output: stdout + (stderr || ''), success: true });
        }
      );
      return;
    }
    case 'start':
      args = ['start', target];
      break;
    case 'stop':
      args = ['stop', target];
      break;
    case 'restart':
      args = ['restart', target];
      break;
    case 'logs':
      args = ['logs', '--tail', '100', target];
      break;
    case 'pull':
      args = ['pull', target];
      break;
    case 'build': {
      if (!imageTag) return res.status(400).json({ error: 'imageTag required for build' });
      args = ['build', '-t', imageTag, target];
      break;
    }
    default:
      return res.status(400).json({ error: `Unknown command: ${command}` });
  }

  runDockerCommand(args, (err, out) => {
    if (err) return res.status(500).json(err);
    res.json({ output: out, success: true });
  });
});

const https = require('https');
const http = require('http');
const fs = require('fs');

// Check container root paths first, then local ./ssl fallback
const SSL_CERT = ['/app/fullchain.pem', path.join(__dirname, 'ssl/fullchain.pem')].find(p => fs.existsSync(p));
const SSL_KEY = ['/app/privkey.pem', path.join(__dirname, 'ssl/privkey.pem')].find(p => fs.existsSync(p));

if (SSL_CERT && SSL_KEY) {
  try {
    const options = {
      key: fs.readFileSync(SSL_KEY),
      cert: fs.readFileSync(SSL_CERT)
    };
    https.createServer(options, app).listen(PORT, () => {
      console.log(`\n  Docker Command Panel running securely at https://localhost:${PORT}\n`);
    });
  } catch (err) {
    console.error(`Failed to start HTTPS server: ${err.message}. Falling back to HTTP...`);
    http.createServer(app).listen(PORT, () => {
      console.log(`\n  Docker Command Panel running at http://localhost:${PORT}\n`);
    });
  }
} else {
  http.createServer(app).listen(PORT, () => {
    console.log(`\n  Docker Command Panel running at http://localhost:${PORT}\n`);
  });
}

