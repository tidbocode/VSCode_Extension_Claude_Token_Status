import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  fmt,
  getContextWindowSize,
  parseLatestUsage,
  findMostRecentJsonl,
  buildTooltip,
} from '../parser';

// ─── fmt ────────────────────────────────────────────────────────────────────

describe('fmt', () => {
  it('returns plain number under 1000', () => {
    assert.strictEqual(fmt(0), '0');
    assert.strictEqual(fmt(999), '999');
  });

  it('returns one-decimal k for 1000–99999', () => {
    assert.strictEqual(fmt(1000), '1.0k');
    assert.strictEqual(fmt(5500), '5.5k');
    assert.strictEqual(fmt(45200), '45.2k');
  });

  it('returns rounded k for 100000+', () => {
    assert.strictEqual(fmt(100000), '100k');
    assert.strictEqual(fmt(200000), '200k');
  });
});

// ─── getContextWindowSize ────────────────────────────────────────────────────

describe('getContextWindowSize', () => {
  it('returns fallback when model is undefined', () => {
    assert.strictEqual(getContextWindowSize(undefined, 200000), 200000);
  });

  it('returns fallback for unrecognised model', () => {
    assert.strictEqual(getContextWindowSize('some-future-model', 150000), 150000);
  });
});

// ─── parseLatestUsage ────────────────────────────────────────────────────────

describe('parseLatestUsage', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `claude-test-${Date.now()}.jsonl`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns null for an empty file', () => {
    fs.writeFileSync(tmpFile, '');
    assert.strictEqual(parseLatestUsage(tmpFile), null);
  });

  it('returns null when no assistant messages are present', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ type: 'user', message: { content: 'hello' } }));
    assert.strictEqual(parseLatestUsage(tmpFile), null);
  });

  it('returns null for a non-existent file', () => {
    assert.strictEqual(parseLatestUsage('/does/not/exist.jsonl'), null);
  });

  it('parses a valid assistant message', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
          cache_read_input_tokens: 5000,
          cache_creation_input_tokens: 100,
        },
      },
    });
    fs.writeFileSync(tmpFile, line);
    assert.deepStrictEqual(parseLatestUsage(tmpFile), {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 5000,
      cacheCreationTokens: 100,
      model: 'claude-sonnet-4-6',
    });
  });

  it('returns the LAST assistant message in the file', () => {
    const line = (tokens: number) => JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: tokens, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });
    fs.writeFileSync(tmpFile, [line(100), line(999)].join('\n'));
    assert.strictEqual(parseLatestUsage(tmpFile)?.inputTokens, 999);
  });

  it('skips malformed JSON lines', () => {
    const good = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 42, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });
    fs.writeFileSync(tmpFile, ['not json', good, '{broken}'].join('\n'));
    assert.strictEqual(parseLatestUsage(tmpFile)?.inputTokens, 42);
  });

  it('treats missing cache fields as zero', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 50, output_tokens: 5 } },
    });
    fs.writeFileSync(tmpFile, line);
    const result = parseLatestUsage(tmpFile);
    assert.strictEqual(result?.cacheReadTokens, 0);
    assert.strictEqual(result?.cacheCreationTokens, 0);
  });
});

// ─── findMostRecentJsonl ─────────────────────────────────────────────────────

describe('findMostRecentJsonl', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for an empty directory', () => {
    assert.strictEqual(findMostRecentJsonl(tmpDir), null);
  });

  it('returns null for a non-existent directory', () => {
    assert.strictEqual(findMostRecentJsonl('/does/not/exist'), null);
  });

  it('finds the only jsonl file', () => {
    const file = path.join(tmpDir, 'session.jsonl');
    fs.writeFileSync(file, '');
    assert.strictEqual(findMostRecentJsonl(tmpDir), file);
  });

  it('returns the most recently modified file', (done) => {
    const older = path.join(tmpDir, 'older.jsonl');
    const newer = path.join(tmpDir, 'newer.jsonl');
    fs.writeFileSync(older, '');
    // Small delay so mtime differs
    setTimeout(() => {
      fs.writeFileSync(newer, '');
      assert.strictEqual(findMostRecentJsonl(tmpDir), newer);
      done();
    }, 10);
  });

  it('finds files in subdirectories', () => {
    const subDir = path.join(tmpDir, 'project-abc');
    fs.mkdirSync(subDir);
    const file = path.join(subDir, 'session.jsonl');
    fs.writeFileSync(file, '');
    assert.strictEqual(findMostRecentJsonl(tmpDir), file);
  });
});

// ─── buildTooltip ────────────────────────────────────────────────────────────

describe('buildTooltip', () => {
  const usage = { inputTokens: 45200, outputTokens: 1800, cacheReadTokens: 12000, cacheCreationTokens: 500, model: 'claude-sonnet-4-6' };

  it('includes the model label', () => {
    const tip = buildTooltip(usage, 57200, 200000, 28.6, 'claude-sonnet-4-6');
    assert.ok(tip.includes('claude-sonnet-4-6'));
  });

  it('includes the percentage', () => {
    const tip = buildTooltip(usage, 57200, 200000, 28.6, 'claude-sonnet-4-6');
    assert.ok(tip.includes('28.6%'));
  });
});
