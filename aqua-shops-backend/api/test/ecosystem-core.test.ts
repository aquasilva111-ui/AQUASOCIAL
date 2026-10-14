import { describe, expect, it } from 'vitest';
import { Secp256k1Keypair } from '@atproto/crypto';
import { createServiceJwt } from '@atproto/xrpc-server';
import {
  CHARTS,
  clusterObservations,
  rankTopics,
  type TopicCluster,
} from '../../../src/lib/ecosystem/charts.ts';
import { nowAndNext } from '../../../src/lib/ecosystem/broadcast.ts';
import { summarizeLedger } from '../../../src/lib/ecosystem/ledger.ts';
import {
  authorizeOperation,
  GatewayAdapter,
  planMission,
  runAutomaton,
  selectContext,
} from '../../../src/lib/ecosystem/intelligence.ts';
import type {
  Automaton,
  Did,
  MonetizationEntry,
  ScheduleItem,
  Workspace,
} from '../../../src/lib/ecosystem/types.ts';
import { createEcosystemAuthenticator } from '../src/ecosystem/auth.ts';
import { sandboxDocument } from '../src/ecosystem/sandbox.ts';
const owner: Did = 'did:plc:owner';
const automaton = (): Automaton => ({
  id: 'one',
  mission: 'Inspect',
  territory: ['workspace/**'],
  capabilities: ['inspect'],
  permissions: {
    read: ['workspace/**'],
    write: [],
    execute: ['typecheck'],
    denied: ['workspace/secrets/**'],
  },
  limits: { maxSteps: 1, maxDurationMs: 100, maxExternalCalls: 0 },
  successCondition: 'inspect returns ok',
  status: 'EQUIPPED',
  logs: [],
});
const workspace = (): Workspace => ({
  context: {
    GLOBAL: 'identity',
    PROJECT: 'project',
    TASK: 'task',
    TEMPORARY: 'private-temp',
  },
  decisions: [],
  tasks: [],
  files: [],
  linkedRepos: [],
  linkedServices: [],
  automata: [],
});
describe('AT authentication', () => {
  it('verifies the signature, audience, expiry and bounded token lifetime', async () => {
    const key = await Secp256k1Keypair.create();
    const service = 'did:web:api.example.test';
    const authenticate = createEcosystemAuthenticator(service, async () =>
      key.did(),
    );
    const token = await createServiceJwt({
      iss: owner,
      aud: service,
      lxm: null,
      exp: Math.floor(Date.now() / 1000) + 120,
      keypair: key,
    });
    expect(await authenticate(`Bearer ${token}`)).toBe(owner);
    await expect(authenticate(undefined)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      authenticate(`Bearer ${token.slice(0, -10)}abcdefghij`),
    ).rejects.toMatchObject({ status: 401 });
    for (const props of [
      {
        aud: 'did:web:wrong.example.test',
        exp: Math.floor(Date.now() / 1000) + 120,
      },
      { aud: service, exp: Math.floor(Date.now() / 1000) - 60 },
      { aud: service, exp: Math.floor(Date.now() / 1000) + 3600 },
    ]) {
      const bad = await createServiceJwt({
        iss: owner,
        lxm: null,
        keypair: key,
        ...props,
      });
      await expect(authenticate(`Bearer ${bad}`)).rejects.toMatchObject({
        status: 401,
      });
    }
  });
});
describe('Autonomous execution boundaries', () => {
  it('executes a registered deterministic tool and checks the success condition', async () => {
    const result = await runAutomaton(automaton(), [
      {
        operation: {
          capability: 'inspect',
          mode: 'read',
          target: 'workspace/project',
        },
        run: async () => 'ok',
        succeeds: r => r === 'ok',
      },
    ]);
    expect(result.status).toBe('COMPLETED');
    expect(result.startedAt).toBeTruthy();
    expect(result.finishedAt).toBeTruthy();
  });
  it.each([
    'workspace/../secrets',
    '/workspace/project',
    'workspace\\project',
    'workspace/secrets/token',
    'other/project',
    'workspace-malicious/project',
  ])('blocks %s without running a tool', async target => {
    let calls = 0;
    const result = await runAutomaton(automaton(), [
      {
        operation: { capability: 'inspect', mode: 'read', target },
        run: async () => (++calls, 'ok'),
        succeeds: () => true,
      },
    ]);
    expect(result.status).toBe('BLOCKED');
    expect(calls).toBe(0);
  });
  it('denies missing capability, writes and external calls by default', async () => {
    expect(
      authorizeOperation(automaton(), {
        capability: 'unknown',
        mode: 'read',
        target: 'workspace/project',
      }),
    ).toBeTruthy();
    expect(
      authorizeOperation(automaton(), {
        capability: 'inspect',
        mode: 'write',
        target: 'workspace/project',
      }),
    ).toBeTruthy();
    let calls = 0;
    const result = await runAutomaton(automaton(), [
      {
        operation: {
          capability: 'inspect',
          mode: 'read',
          target: 'workspace/project',
          external: true,
        },
        run: async () => (++calls, 'ok'),
        succeeds: () => true,
      },
    ]);
    expect(calls).toBe(0);
    expect(result.status).toBe('BLOCKED');
  });
  it('distinguishes failed assertions, thrown errors, missing tools and timeout', async () => {
    const operation = {
      capability: 'inspect',
      mode: 'read' as const,
      target: 'workspace/project',
    };
    expect(
      (
        await runAutomaton(automaton(), [
          { operation, run: async () => 'bad', succeeds: () => false },
        ])
      ).status,
    ).toBe('FAILED');
    expect(
      (
        await runAutomaton(automaton(), [
          {
            operation,
            run: async () => {
              throw new Error('Failure');
            },
            succeeds: () => true,
          },
        ])
      ).status,
    ).toBe('FAILED');
    expect((await runAutomaton(automaton(), [])).status).toBe('BLOCKED');
    const input = automaton();
    input.limits.maxDurationMs = 10;
    expect(
      (
        await runAutomaton(input, [
          {
            operation,
            run: async () => new Promise(() => {}),
            succeeds: () => true,
          },
        ])
      ).status,
    ).toBe('FAILED');
  });
  it('does not invent a decision or send every context layer to an external model', () => {
    const w = workspace();
    w.tasks.push({
      id: 'one',
      title: 'Decision required',
      status: 'NEEDS_DECISION',
    });
    expect(planMission('build', w, [], []).status).toBe('NEEDS_DECISION');
    expect(selectContext(w, ['PROJECT'])).not.toContain('private-temp');
    expect(selectContext(w, ['PROJECT'], 3)).toHaveLength(3);
    w.tasks = [];
    expect(planMission('inspect', w, ['inspect'], ['openai']).strategy).toBe(
      'deterministic',
    );
    expect(planMission('new task', w, [], []).status).toBe('not_configured');
  });
  it('supports gateway cancellation without placing a provider key in client code', async () => {
    const adapter = new GatewayAdapter(
      'openai',
      async (_id, _messages, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new Error('cancelled')),
          ),
        ),
    );
    const request = adapter.sendMessage(
      [{ role: 'user', content: 'Hello' }],
      new AbortController().signal,
    );
    adapter.cancel();
    await expect(request).rejects.toThrow('cancelled');
    expect(
      adapter.estimateUsage([{ role: 'user', content: '12345678' }])
        .estimatedInputTokens,
    ).toBe(2);
  });
});
describe('Charts provenance and anti-spam', () => {
  it('clusters real observations without inventing missing signals or inflating duplicate posts', () => {
    const now = Date.now();
    const observation = {
      uri: `at://${owner}/app.bsky.feed.post/one`,
      authorDid: owner,
      createdAt: new Date(now - 1000).toISOString(),
      canonicalLabel: 'AQUA',
      aliases: ['Aqua Social'],
      keywords: ['ecosystem'],
      entities: ['aqua'],
      regions: ['BR'],
      confidence: 0.9,
      metrics: {},
      source: 'AT public posts',
    };
    const clusters = clusterObservations(
      [
        observation,
        observation,
        {
          ...observation,
          uri: `at://${owner}/app.bsky.feed.post/two`,
          canonicalLabel: 'aqua',
        },
      ],
      60000,
      now,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.postCount).toBe(2);
    expect(clusters[0]!.uniqueAuthors).toBe(1);
    expect(clusters[0]!.metrics.likes).toBeUndefined();
    expect(clusters[0]!.engagementVelocity).toBeUndefined();
    expect(
      clusterObservations(
        [{ ...observation, createdAt: new Date(now + 1000).toISOString() }],
        60000,
        now,
      ),
    ).toEqual([]);
  });

  const cluster = (id: string): TopicCluster => ({
    id,
    canonicalLabel: id,
    aliases: [],
    keywords: [],
    entities: [],
    regions: [],
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    postCount: 20,
    uniqueAuthors: 10,
    velocity: 20,
    engagementVelocity: 10,
    confidence: 1,
    metrics: { velocity: 20, uniqueAuthors: 10, likes: 100 },
    source: 'observed dataset',
    href: '/topic/aqua',
  });
  it('explains the score and excludes missing signals instead of fabricating values', () => {
    const missing = cluster('missing');
    delete missing.metrics.likes;
    const ranked = rankTopics([cluster('real'), missing], CHARTS[0]!);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.explanation.source).toBe('observed dataset');
    expect(ranked[0]!.explanation.terms).toHaveLength(3);
  });
  it('penalizes duplicates, spam and low diversity and caps velocity', () => {
    const normal = cluster('real');
    const spam = cluster('spam');
    spam.metrics.spam = 1;
    const few = cluster('few');
    few.uniqueAuthors = 1;
    const ranked = rankTopics([normal, spam, few], CHARTS[0]!);
    expect(ranked.map(r => r.cluster.id)).toEqual(['real']);
    normal.metrics.velocity = 1e20;
    expect(
      rankTopics([normal], CHARTS[0]!)[0]!.explanation.terms[0]!.value,
    ).toBe(10000);
  });
});
describe('Ledger integers and EPG windows', () => {
  it('does not sum different currencies or owners or mistake refunded income for balance', () => {
    const entry: MonetizationEntry = {
      id: 'e1',
      ownerDid: owner,
      sourceType: 'shop',
      sourceId: 'order1',
      gross: 1000,
      fees: 100,
      net: 900,
      currency: 'BRL',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    expect(
      summarizeLedger(owner, 'BRL', [
        entry,
        { ...entry, ownerDid: 'did:plc:other' },
        { ...entry, currency: 'USD' },
        { ...entry, status: 'refunded' },
      ]).pending,
    ).toBe(900);
    expect(() =>
      summarizeLedger(owner, 'BRL', [{ ...entry, gross: 10.1 }]),
    ).toThrow();
    expect(() =>
      summarizeLedger(owner, 'BRL', [{ ...entry, net: 901 }]),
    ).toThrow();
  });
  it('handles exact start/end boundaries and gaps between programs', () => {
    const item: ScheduleItem = {
      id: 'one',
      channelId: 'channel',
      title: 'Program',
      description: '',
      startAt: '2026-01-01T12:00:00Z',
      endAt: '2026-01-01T13:00:00Z',
      mediaUri: 'https://media.example.test/a.mp3',
    };
    expect(nowAndNext([item], Date.parse(item.startAt)).now?.id).toBe('one');
    expect(nowAndNext([item], Date.parse(item.endAt)).now).toBeUndefined();
    expect(nowAndNext([item], Date.parse(item.endAt)).archive).toHaveLength(1);
  });
  it('escapes app names and forbids iframe privileges and unauthorized bundle origins', () => {
    const manifest = {
      id: 'one',
      ownerDid: owner,
      name: '<script>alert(1)</script>',
      slug: 'game',
      version: '1',
      description: '',
      entry: 'https://bundles.example.test/game.js',
      permissions: [],
      runtime: 'web' as const,
      createdAt: 'now',
      updatedAt: 'now',
    };
    const doc = sandboxDocument(manifest, ['https://bundles.example.test']);
    expect(doc.html).toContain('&lt;script&gt;');
    expect(doc.csp).toContain("worker-src 'none'");
    expect(doc.csp).not.toContain('allow-same-origin');
    expect(() =>
      sandboxDocument(
        { ...manifest, entry: 'https://untrusted.example.test/game.js' },
        ['https://bundles.example.test'],
      ),
    ).toThrow();
  });
});
