import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ecosystemRoutes,
  type EcosystemOptions,
} from '../src/ecosystem/routes.ts';
import {
  createTestEcosystemStore,
  EcosystemError,
} from '../src/ecosystem/store.ts';
import type {
  Did,
  EcosystemResource,
} from '../../../src/lib/ecosystem/types.ts';

const owner: Did = 'did:plc:owner';
const visitor: Did = 'did:plc:visitor';
const reviewer: Did = 'did:plc:reviewer';
function setup(moderation = true, extra: Partial<EcosystemOptions> = {}) {
  const store = createTestEcosystemStore();
  const app = ecosystemRoutes({
    store,
    authenticate: async h => {
      if (h === `Bearer ${owner}`) return owner;
      if (h === `Bearer ${visitor}`) return visitor;
      if (h === `Bearer ${reviewer}`) return reviewer;
      throw new EcosystemError(401, 'Unauthorized');
    },
    reviewerDids: [reviewer],
    allowedAppOrigins: ['https://bundles.example.test'],
    runnerOrigin: 'https://runner.example.test',
    ...(moderation
      ? { canView: async () => true, canReference: async () => true }
      : {}),
    ...extra,
  });
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    actor = owner,
  ) =>
    app.request(path, {
      method,
      headers: {
        authorization: `Bearer ${actor}`,
        'content-type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const create = async (kind: string, extra = {}) => {
    const res = await request('/resources', 'POST', {
      kind,
      name: 'AQUA',
      slug: `aqua-${randomUUID()}`,
      description: 'Real reference test',
      visibility: 'public',
      ...extra,
    });
    expect(res.status).toBe(201);
    return (await res.json()) as EcosystemResource;
  };
  const action = (
    r: EcosystemResource,
    action: string,
    extra = {},
    actor = owner,
  ) =>
    request(
      `/resources/${r.id}/actions`,
      'POST',
      { revision: r.revision, action, ...extra },
      actor,
    );
  return { store, app, request, create, action };
}
describe('Ecosystem endpoints and authorization', () => {
  it('reports unavailable services honestly and fails closed', async () => {
    const app = ecosystemRoutes();
    expect((await app.request('/resources?kind=community')).status).toBe(503);
    expect((await (await app.request('/capabilities')).json()).storage).toBe(
      false,
    );
  });
  it('requires a verified caller and does not trust ownerDid in the body', async () => {
    const s = setup();
    expect((await s.app.request('/resources?kind=community')).status).toBe(401);
    const r = await s.create('community', { ownerDid: visitor });
    expect(r.ownerDid).toBe(owner);
  });
  it('rejects invalid IDs, kinds and malformed JSON', async () => {
    const s = setup();
    expect((await s.request('/resources/not-uuid')).status).toBe(400);
    expect((await s.request('/resources?kind=sql')).status).toBe(400);
    expect(
      (
        await s.app.request('/resources', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${owner}`,
            'content-type': 'application/json',
          },
          body: '{',
        })
      ).status,
    ).toBe(400);
  });
  it('does not expose private resources through listing, lookup or search', async () => {
    const s = setup();
    const r = await s.create('portal', { visibility: 'private' });
    expect(
      (await s.request(`/resources/${r.id}`, 'GET', undefined, visitor)).status,
    ).toBe(404);
    expect(
      (
        await (
          await s.request('/search?q=AQUA', 'GET', undefined, visitor)
        ).json()
      ).resources,
    ).toEqual([]);
    expect(
      (
        await (
          await s.request('/resources?kind=portal', 'GET', undefined, visitor)
        ).json()
      ).resources,
    ).toEqual([]);
  });
  it('hides non-owned discovery when moderation is missing', async () => {
    const s = setup(false);
    const r = await s.create('community');
    expect(
      (await s.request(`/resources/${r.id}`, 'GET', undefined, visitor)).status,
    ).toBe(404);
    expect(
      (
        await s.action(r, 'post', {
          uri: `at://${owner}/app.bsky.feed.post/post1`,
        })
      ).status,
    ).toBe(503);
  });
  it('joins and leaves with the existing DID without inventing another account', async () => {
    const s = setup();
    let r = await s.create('community');
    r = await (await s.action(r, 'join', {}, visitor)).json();
    expect((r.data as any).members).toContainEqual({
      did: visitor,
      role: 'contributor',
    });
    r = await (await s.action(r, 'leave', {}, visitor)).json();
    expect((r.data as any).members).not.toContainEqual({
      did: visitor,
      role: 'contributor',
    });
    expect((await s.action(r, 'leave')).status).toBe(403);
  });
  it('limits channel management and announcements to authorized roles', async () => {
    const s = setup();
    let r = await s.create('community');
    expect(
      (
        await s.action(
          r,
          'channel',
          { name: 'news', type: 'announcements' },
          visitor,
        )
      ).status,
    ).toBe(403);
    r = await (
      await s.action(r, 'channel', { name: 'news', type: 'announcements' })
    ).json();
    r = await (await s.action(r, 'join', {}, visitor)).json();
    expect(
      (
        await s.action(
          r,
          'post',
          {
            channelId: (r.data as any).channels[0].id,
            uri: `at://${visitor}/app.bsky.feed.post/p1`,
          },
          visitor,
        )
      ).status,
    ).toBe(403);
  });
  it('references canonical posts, prevents author spoofing and deduplicates retries', async () => {
    const s = setup();
    let r = await s.create('community');
    r = await (
      await s.action(r, 'channel', { name: 'general', type: 'text' })
    ).json();
    const channelId = (r.data as any).channels[0].id;
    expect(
      (
        await s.action(r, 'post', {
          channelId,
          uri: `at://${visitor}/app.bsky.feed.post/p1`,
        })
      ).status,
    ).toBe(403);
    const body = { channelId, uri: `at://${owner}/app.bsky.feed.post/p1` };
    r = await (await s.action(r, 'post', body)).json();
    r = await (await s.action(r, 'post', body)).json();
    expect((r.data as any).channels[0].posts).toHaveLength(1);
    expect(
      (await s.action(r, 'pin', { ...body, pinned: true }, visitor)).status,
    ).toBe(403);
  });
  it('prevents role escalation, owner reassignment and rejoining after moderation ban', async () => {
    const s = setup();
    let r = await s.create('community');
    r = await (
      await s.action(r, 'member', { did: visitor, role: 'admin' })
    ).json();
    expect(
      (await s.action(r, 'member', { did: reviewer, role: 'admin' }, visitor))
        .status,
    ).toBe(403);
    expect(
      (await s.action(r, 'member', { did: owner, role: 'viewer' }, visitor))
        .status,
    ).toBe(403);
    r = await (await s.action(r, 'ban', { did: visitor })).json();
    expect((await s.action(r, 'join', {}, visitor)).status).toBe(404);
  });
  it('detects concurrent writes and does not change data or audit on failed permission checks', async () => {
    const s = setup();
    const r = await s.create('community');
    await s.action(r, 'channel', { name: 'general', type: 'text' });
    expect(
      (await s.action(r, 'channel', { name: 'other', type: 'text' })).status,
    ).toBe(409);
    expect(await s.store.audit(r.id)).toHaveLength(2);
  });
  it('stores portal sources with provenance and rejects public +18 refs', async () => {
    const s = setup();
    let r = await s.create('portal');
    r = await (
      await s.action(r, 'source', {
        title: 'Primary source',
        uri: 'https://official.example.test/report',
      })
    ).json();
    expect((r.data as any).sections.sources[0].source).toBe(
      'https://official.example.test/report',
    );
    expect(
      (
        await s.action(r, 'reference', {
          title: 'Adult',
          section: 'media',
          type: 'video',
          uri: `at://${owner}/app.aqua.adult.video/one`,
        })
      ).status,
    ).toBe(400);
  });
  it('keeps verification requests private and uses an audited review state machine', async () => {
    const s = setup();
    let r = await s.create('verification', {
      data: {
        entityType: 'creator',
        legalName: 'A',
        displayName: 'A',
        website: 'https://official.example.test',
        country: 'BR',
      },
    });
    expect(r.visibility).toBe('private');
    expect(
      (await s.request(`/resources/${r.id}`, 'GET', undefined, visitor)).status,
    ).toBe(404);
    r = await (await s.action(r, 'submit')).json();
    expect(
      (
        await s.request(
          `/verification/${r.id}/review`,
          'POST',
          { revision: r.revision, action: 'reject', notes: 'Reason' },
          visitor,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await s.request(
          `/verification/${r.id}/review`,
          'POST',
          { revision: r.revision, action: 'approve' },
          reviewer,
        )
      ).status,
    ).toBe(503);
    r = await (
      await s.request(
        `/verification/${r.id}/review`,
        'POST',
        {
          revision: r.revision,
          action: 'request_more_info',
          notes: 'Official registry required',
        },
        reviewer,
      )
    ).json();
    expect((r.data as any).status).toBe('needs_information');
    expect(await s.store.audit(r.id)).toHaveLength(3);
    expect(
      (await s.request(`/resources/${r.id}/audit`, 'GET', undefined, visitor))
        .status,
    ).toBe(404);
  });
  it('cannot self-review, approve itself or publish a pretend badge', async () => {
    const s = setup();
    const res = await s.request(
      '/resources',
      'POST',
      {
        kind: 'verification',
        name: 'Test',
        slug: 'test-review',
        data: {
          entityType: 'person',
          legalName: 'Test',
          displayName: 'Test',
          website: 'https://example.test',
          country: 'BR',
        },
      },
      reviewer,
    );
    const r = await res.json();
    expect(
      (
        await s.request(
          `/verification/${r.id}/review`,
          'POST',
          { revision: 1, action: 'approve' },
          reviewer,
        )
      ).status,
    ).toBe(403);
  });
  it('starts analytics disabled, strips private context and deduplicates events', async () => {
    const s = setup();
    const r = await s.create('portal');
    const id = randomUUID();
    const body = {
      id,
      event: 'view',
      resourceId: r.id,
      context: { surface: 'portal', durationMs: 100, privateText: 'secret' },
    };
    expect(
      (await (await s.request('/events', 'POST', body, visitor)).json())
        .recorded,
    ).toBe(false);
    await s.request('/me/privacy', 'PUT', { analytics: true }, visitor);
    await s.request('/events', 'POST', body, visitor);
    await s.request('/events', 'POST', body, visitor);
    expect((await (await s.request('/me/analytics')).json()).metrics).toEqual([
      { event: 'view', count: 1, durationMs: 100 },
    ]);
    expect(
      (
        await (
          await s.request('/me/analytics', 'GET', undefined, visitor)
        ).json()
      ).metrics,
    ).toEqual([]);
    await s.request('/me/privacy', 'PUT', { analytics: false }, visitor);
    await s.request('/events', 'POST', { ...body, id: randomUUID() }, visitor);
    expect((await s.store.analytics(owner))[0]!.count).toBe(1);
  });
  it('rejects financial analytics spoofing and private-resource events', async () => {
    const s = setup();
    const r = await s.create('portal', { visibility: 'private' });
    await s.request('/me/privacy', 'PUT', { analytics: true }, visitor);
    expect(
      (
        await s.request(
          '/events',
          'POST',
          { id: randomUUID(), resourceId: r.id, event: 'view' },
          visitor,
        )
      ).status,
    ).toBe(404);
    await s.request('/me/privacy', 'PUT', { analytics: true });
    expect(
      (
        await s.request('/events', 'POST', {
          id: randomUUID(),
          resourceId: r.id,
          event: 'purchase',
        })
      ).status,
    ).toBe(403);
  });
  it('does not fabricate a wallet balance or accept client ledger writes', async () => {
    const s = setup();
    const wallet = await (await s.request('/me/wallet')).json();
    expect(wallet.entries).toEqual([]);
    expect(wallet.summaries).toEqual([]);
    expect(wallet.paymentsConfigured).toBe(false);
    expect(
      (await s.request('/me/wallet', 'POST', { available: 100000 })).status,
    ).toBe(404);
  });
  it('executes a deterministic automaton once, respecting decisions and workspace privacy', async () => {
    const s = setup();
    let r = await s.create('workspace');
    expect(r.visibility).toBe('private');
    r = await (
      await s.action(r, 'task', {
        title: 'Architecture choice',
        needsDecision: true,
      })
    ).json();
    const plan = await (
      await s.request(`/workspaces/${r.id}/ask`, 'POST', { intent: 'build' })
    ).json();
    expect(plan.plan.status).toBe('NEEDS_DECISION');
    r = await (
      await s.action(r, 'automaton', { mission: 'Inspect context' })
    ).json();
    const automatonId = (r.data as any).automata[0].id;
    r = await (
      await s.request(`/workspaces/${r.id}/run`, 'POST', {
        revision: r.revision,
        automatonId,
      })
    ).json();
    expect((r.data as any).automata[0].status).toBe('COMPLETED');
    expect(
      (
        await s.request(`/workspaces/${r.id}/run`, 'POST', {
          revision: r.revision,
          automatonId,
        })
      ).status,
    ).toBe(409);
  });
  it('validates schedule windows, overlap and broadcast ownership', async () => {
    const s = setup();
    let r = await s.create('broadcast', { data: { type: 'radio' } });
    const schedule = {
      title: 'Program',
      startAt: '2026-01-01T12:00:00Z',
      endAt: '2026-01-01T13:00:00Z',
      mediaUri: 'https://media.example.test/a.mp3',
    };
    expect((await s.action(r, 'schedule', schedule, visitor)).status).toBe(403);
    r = await (await s.action(r, 'schedule', schedule)).json();
    expect((await s.action(r, 'schedule', schedule)).status).toBe(400);
  });
  it('rejects app permissions, script injection, HTTP and unapproved origins', async () => {
    const s = setup();
    for (const data of [
      { entry: 'https://bundles.example.test/a.js', permissions: ['camera'] },
      { entry: 'javascript:alert(1)' },
      { entry: 'http://bundles.example.test/a.js' },
      { entry: 'https://other.example.test/a.js' },
    ])
      expect(
        (
          await s.request('/resources', 'POST', {
            kind: 'app',
            name: 'Test',
            slug: 'test',
            data,
          })
        ).status,
      ).not.toBe(201);
  });
  it('uses expiring one-use sandbox tickets, not caller DID parameters or host cookies', async () => {
    const s = setup();
    const r = await s.create('app', {
      data: { entry: 'https://bundles.example.test/a.js' },
    });
    expect(
      (await s.request(`/apps/${r.id}/run-ticket`, 'POST', {}, visitor)).status,
    ).toBe(200);
    const { url } = await (
      await s.request(`/apps/${r.id}/run-ticket`, 'POST', {})
    ).json();
    const parsed = new URL(url);
    const runPath = parsed.pathname.replace('/ecosystem', '') + parsed.search;
    const res = await s.app.request(runPath, {
      headers: { host: 'runner.example.test' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain(
      "connect-src 'none'",
    );
    expect(res.headers.get('content-security-policy')).not.toContain(
      'allow-same-origin',
    );
    expect(
      (
        await s.app.request(runPath, {
          headers: { host: 'runner.example.test' },
        })
      ).status,
    ).toBe(403);
    const privateApp = await s.create('app', {
      visibility: 'private',
      data: { entry: 'https://bundles.example.test/a.js' },
    });
    expect(
      (
        await s.request(
          `/apps/${privateApp.id}/run-ticket`,
          'POST',
          {},
          visitor,
        )
      ).status,
    ).toBe(404);
  });
  it('shares only explicitly selected context through an owner-authorized AI gateway', async () => {
    let calls = 0;
    let sent = '';
    const s = setup(true, {
      ai: {
        providers: ['openai'],
        send: async (_provider, messages) => {
          calls++;
          sent = JSON.stringify(messages);
          return 'Provider contract fixture';
        },
      },
    });
    let r = await s.create('workspace');
    r = await (
      await s.action(r, 'context', {
        layer: 'GLOBAL',
        text: 'GLOBAL_NOT_GRANTED',
      })
    ).json();
    r = await (
      await s.action(r, 'context', {
        layer: 'PROJECT',
        text: 'PROJECT_GRANTED',
      })
    ).json();
    await s.request(`/workspaces/${r.id}/ask`, 'POST', { intent: 'review' });
    expect(calls).toBe(0);
    expect(
      (
        await s.request(
          `/workspaces/${r.id}/ask`,
          'POST',
          {
            intent: 'review',
            authorizeExternal: true,
            provider: 'openai',
            layers: ['PROJECT'],
          },
          visitor,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await s.request(`/workspaces/${r.id}/ask`, 'POST', {
          intent: 'review',
          authorizeExternal: true,
          provider: 'unconfigured',
        })
      ).status,
    ).toBe(400);
    const response = await s.request(`/workspaces/${r.id}/ask`, 'POST', {
      intent: 'review',
      authorizeExternal: true,
      provider: 'openai',
      layers: ['PROJECT'],
    });
    expect(response.status).toBe(200);
    expect(calls).toBe(1);
    expect(sent).toContain('PROJECT_GRANTED');
    expect(sent).not.toContain('GLOBAL_NOT_GRANTED');
    expect(((await s.store.get(r.id))!.data as any).messages).toHaveLength(2);
  });
  it('persists sourced country facts and forbids publishing private workspace context', async () => {
    const s = setup();
    let r = await s.create('portal');
    const fact = {
      countryCode: 'BR',
      field: 'culture',
      value: 'Source-provided fact',
      source: 'https://official.example.test/source',
      retrievedAt: '2026-01-01T00:00:00Z',
    };
    r = await (await s.action(r, 'country_fact', fact)).json();
    expect((r.data as any).country.facts.culture.source).toBe(fact.source);
    expect(
      (await s.action(r, 'country_fact', { ...fact, countryCode: 'MX' }))
        .status,
    ).toBe(409);
    const w = await s.create('workspace');
    expect(
      (await s.action(w, 'settings', { visibility: 'public' })).status,
    ).toBe(403);
  });
  it('applies bounded rate limiting without a client-controlled IP identity', async () => {
    const s = setup();
    for (let i = 0; i < 120; i++)
      expect((await s.request('/me/privacy')).status).toBe(200);
    expect((await s.request('/me/privacy')).status).toBe(429);
  });
});
