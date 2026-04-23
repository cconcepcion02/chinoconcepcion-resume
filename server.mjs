import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function parseEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

parseEnvFile();

const PORT = Number(process.env.CHAT_API_PORT || 11435);
const HOST = process.env.CHAT_API_HOST || '127.0.0.1';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const FASTER_WHISPER_MODEL = process.env.FASTER_WHISPER_MODEL || 'tiny';
const PYTHON_BIN = existsSync(resolve(process.cwd(), '.venv/bin/python'))
  ? resolve(process.cwd(), '.venv/bin/python')
  : 'python3';
const ATTACHMENT_HELPER = resolve(process.cwd(), 'tools/process_attachment.py');
const systemPrompt =
  process.env.OLLAMA_SYSTEM_PROMPT ||
  [
    'You are assisting Chino Concepcion, a Full-Stack Developer based in Cebu, Philippines.',
    'Answer practically and concisely.',
    'Focus on scalable architecture, AI workflows, APIs, Docker deployment, and production-ready implementation.',
    'Avoid unnecessary explanations and prefer implementable responses.'
  ].join(' ');

function createAppError(message, options = {}) {
  const error = new Error(message);
  error.code = options.code || 'APP_ERROR';
  error.statusCode = options.statusCode || 500;
  error.details = options.details;
  return error;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  response.end(JSON.stringify(payload));
}

function writeTempFile(base64Payload, suffix) {
  try {
    const tempPath = resolve(tmpdir(), `chino-attachment-${randomUUID()}${suffix}`);
    writeFileSync(tempPath, Buffer.from(base64Payload, 'base64'));
    return tempPath;
  } catch (error) {
    throw createAppError('Unable to prepare a temporary attachment file.', {
      code: 'ATTACHMENT_WRITE_ERROR',
      statusCode: 500,
      details: error instanceof Error ? error.message : 'Unknown file write error'
    });
  }
}

function decodeTextAttachment(base64Payload) {
  try {
    return Buffer.from(base64Payload, 'base64').toString('utf8');
  } catch (error) {
    throw createAppError('Unable to decode the text attachment.', {
      code: 'ATTACHMENT_DECODE_ERROR',
      statusCode: 400,
      details: error instanceof Error ? error.message : 'Unknown decode error'
    });
  }
}

async function runAttachmentHelper(command, filePath, extraArg) {
  try {
    const args = [ATTACHMENT_HELPER, command, filePath];
    if (extraArg) {
      args.push(extraArg);
    }

    const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 20
    });

    try {
      return JSON.parse(stdout || '{}');
    } catch (error) {
      throw createAppError('Attachment helper returned invalid JSON.', {
        code: 'ATTACHMENT_HELPER_INVALID_JSON',
        statusCode: 500,
        details: stderr || (error instanceof Error ? error.message : 'Unknown helper parse error')
      });
    }
  } catch (error) {
    if (error?.code && error?.statusCode) {
      throw error;
    }

    throw createAppError('Attachment processing failed.', {
      code: 'ATTACHMENT_PROCESSING_ERROR',
      statusCode: 500,
      details: error instanceof Error ? error.message : 'Unknown attachment processing error'
    });
  }
}

async function enrichAttachments(attachments) {
  const lines = [];

  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') {
      continue;
    }

    const name = typeof attachment.name === 'string' ? attachment.name : 'unnamed';
    const type = typeof attachment.type === 'string' ? attachment.type : 'application/octet-stream';
    const size = typeof attachment.size === 'number' ? attachment.size : 0;
    const kind = typeof attachment.kind === 'string' ? attachment.kind : 'file';
    const content = typeof attachment.content === 'string' ? attachment.content : '';

    if (!name || size < 0) {
      throw createAppError('Attachment payload is invalid.', {
        code: 'INVALID_ATTACHMENT',
        statusCode: 400,
        details: `Attachment metadata was malformed for ${name || 'unknown file'}.`
      });
    }

    if (kind === 'audio' && content) {
      let tempPath = '';
      try {
        const extension = name.includes('.') ? `.${name.split('.').pop()}` : '.bin';
        tempPath = writeTempFile(content, extension);
        const result = await runAttachmentHelper('audio', tempPath, FASTER_WHISPER_MODEL);
        if (result?.text) {
          lines.push(`- audio transcription from ${name}: ${String(result.text).trim()}`);
        } else {
          lines.push(`- audio attachment: ${name} (${type}, ${Math.max(1, Math.round(size / 1024))} KB)`);
        }
      } catch (error) {
        lines.push(
          `- audio attachment: ${name} (${type}) could not be transcribed locally: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      } finally {
        if (tempPath) {
          try {
            unlinkSync(tempPath);
          } catch {}
        }
      }
      continue;
    }

    if (type === 'application/pdf' && content) {
      let tempPath = '';
      try {
        tempPath = writeTempFile(content, '.pdf');
        const result = await runAttachmentHelper('pdf', tempPath);
        const extracted = String(result?.text || '').trim();
        if (extracted) {
          lines.push(`- extracted PDF text from ${name}:\n${extracted.slice(0, 8000)}`);
        } else {
          lines.push(`- PDF attachment: ${name} (no readable text extracted)`);
        }
      } catch (error) {
        lines.push(
          `- PDF attachment: ${name} could not be extracted locally: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      } finally {
        if (tempPath) {
          try {
            unlinkSync(tempPath);
          } catch {}
        }
      }
      continue;
    }

    if (
      content &&
      (type.startsWith('text/') ||
        ['application/json', 'text/markdown', 'application/xml'].includes(type) ||
        name.endsWith('.md') ||
        name.endsWith('.csv') ||
        name.endsWith('.txt') ||
        name.endsWith('.json'))
    ) {
      const extracted = decodeTextAttachment(content).trim();
      lines.push(`- extracted text from ${name}:\n${extracted.slice(0, 8000)}`);
      continue;
    }

    lines.push(`- ${kind}: ${name} (${type}, ${Math.max(1, Math.round(size / 1024))} KB)`);
  }

  return lines;
}

async function readRequestBody(request) {
  try {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw createAppError('Request body is not valid JSON.', {
        code: 'INVALID_JSON',
        statusCode: 400,
        details: error instanceof Error ? error.message : 'Unknown JSON parse error'
      });
    }
  } catch (error) {
    if (error?.code && error?.statusCode) {
      throw error;
    }

    throw createAppError('Unable to read the request body.', {
      code: 'REQUEST_READ_ERROR',
      statusCode: 400,
      details: error instanceof Error ? error.message : 'Unknown request read error'
    });
  }
}

function isCreditLimitResponse(statusCode, details) {
  if (statusCode === 402) {
    return true;
  }

  const normalized = String(details || '').toLowerCase();
  return ['credit', 'quota', 'billing', 'payment required', 'insufficient balance'].some((token) =>
    normalized.includes(token)
  );
}

function isRateLimitResponse(statusCode, details) {
  if (statusCode === 429) {
    return true;
  }

  const normalized = String(details || '').toLowerCase();
  return ['rate limit', 'too many requests', 'throttle'].some((token) => normalized.includes(token));
}

function mapOllamaError(statusCode, details) {
  if (isCreditLimitResponse(statusCode, details)) {
    return createAppError('The Ollama model hit its credit or quota limit.', {
      code: 'OLLAMA_CREDIT_LIMIT',
      statusCode: 502,
      details
    });
  }

  if (isRateLimitResponse(statusCode, details)) {
    return createAppError('The Ollama model is rate-limited.', {
      code: 'OLLAMA_RATE_LIMIT',
      statusCode: 502,
      details
    });
  }

  if (statusCode === 404) {
    return createAppError('The configured Ollama model was not found.', {
      code: 'OLLAMA_MODEL_NOT_FOUND',
      statusCode: 502,
      details
    });
  }

  return createAppError('Ollama request failed.', {
    code: 'OLLAMA_UPSTREAM_ERROR',
    statusCode: 502,
    details
  });
}

function mapUnhandledError(error) {
  if (error?.code && error?.statusCode) {
    return error;
  }

  if (error instanceof TypeError) {
    return createAppError('Unable to reach the local Ollama service.', {
      code: 'OLLAMA_UNAVAILABLE',
      statusCode: 503,
      details: error.message
    });
  }

  return createAppError('Local chat bridge failed.', {
    code: 'CHAT_BRIDGE_ERROR',
    statusCode: 500,
    details: error instanceof Error ? error.message : 'Unknown error'
  });
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing request URL.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === 'GET' && request.url === '/api/health') {
    sendJson(response, 200, {
      status: 'ok',
      model: OLLAMA_MODEL,
      host: OLLAMA_HOST
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/chat') {
    try {
      const body = await readRequestBody(request);
      const prompt = typeof body.message === 'string' ? body.message.trim() : '';
      const attachments = Array.isArray(body.attachments) ? body.attachments : [];

      if (!prompt && attachments.length === 0) {
        sendJson(response, 400, { error: 'Message or attachment is required.' });
        return;
      }

      const imageAttachments = attachments.filter(
        (attachment) =>
          attachment &&
          attachment.kind === 'image' &&
          typeof attachment.content === 'string' &&
          attachment.content.length > 0
      );

      const extraAttachmentContext = await enrichAttachments(
        attachments.filter((attachment) => attachment && attachment.kind !== 'image')
      );

      const contentParts = [];
      if (prompt) {
        contentParts.push(prompt);
      }
      if (extraAttachmentContext.length > 0) {
        contentParts.push(
          'Additional attachment context provided by the user:\n' + extraAttachmentContext.join('\n')
        );
      }
      if (imageAttachments.length > 0 && !prompt) {
        contentParts.push('The user attached image input. Describe or analyze it usefully.');
      }

      const ollamaResponse = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: contentParts.join('\n\n'),
              images: imageAttachments.map((attachment) => attachment.content)
            }
          ]
        })
      });

      if (!ollamaResponse.ok) {
        const details = await ollamaResponse.text();
        throw mapOllamaError(ollamaResponse.status, details);
      }

      const rawUpstream = await ollamaResponse.text();
      let data;
      try {
        data = rawUpstream ? JSON.parse(rawUpstream) : {};
      } catch (error) {
        throw createAppError('The model service returned invalid JSON.', {
          code: 'OLLAMA_INVALID_JSON',
          statusCode: 502,
          details: rawUpstream.slice(0, 400) || (error instanceof Error ? error.message : 'Unknown parse error')
        });
      }

      sendJson(response, 200, {
        reply: data?.message?.content || 'No response returned by Ollama.',
        model: OLLAMA_MODEL
      });
    } catch (error) {
      const mapped = mapUnhandledError(error);
      sendJson(response, mapped.statusCode || 500, {
        error: mapped.message || 'Local chat bridge failed.',
        code: mapped.code || 'CHAT_BRIDGE_ERROR',
        details: mapped.details || 'Unknown error'
      });
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

server.listen(PORT, HOST, () => {
  console.log(`Local chat bridge listening on http://${HOST}:${PORT}`);
  console.log(`Using Ollama model: ${OLLAMA_MODEL}`);
});
