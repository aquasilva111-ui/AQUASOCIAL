import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { validateSchedule } from '../../../../src/lib/ecosystem/broadcast.ts';
import {
  planMission,
  runAutomaton,
  selectContext,
  type AIMessage,
  type ProviderId,
} from '../../../../src/lib/ecosystem/intelligence.ts';
import { summarizeLedger } from '../../../../src/lib/ecosystem/ledger.ts';
import {
  ANALYTICS_EVENTS,
  type AppManifest,
  type Automaton,
  type BroadcastChannel,
  type Community,
  type Did,
  type EcosystemResource,
  type Portal,
  type VerificationRequest,
  type Workspace,
} from '../../../../src/lib/ecosystem/types.ts';
import { EcosystemError, type EcosystemStore } from './store.ts';
import {
  array,
  atUri,
  choice,
  did,
  fail,
  https,
  initialResource,
  integer,
  KINDS,
  object,
  requireRole,
  roleOf,
  scheduleItem,
  text,
  uuid,
} from './validation.ts';
import { sandboxDocument } from './sandbox.ts';

export interface EcosystemOptions {
  store?: EcosystemStore;
  authenticate?: (authorization: string | undefined) => Promise<Did>;
  reviewerDids?: Did[];
  allowedAppOrigins?: string[];
  runnerOrigin?: string;
  /** Resolves blocks, mutes, labels, visibility and adult isolation against existing moderation. */
  canView?: (viewer: Did, resource: EcosystemResource) => Promise<boolean>;
  canReference?: (viewer: Did, uri: string) => Promise<boolean>;
  /** Existing AT verifier; must publish/revoke app.bsky.graph.verification, idempotently. */
  issueVerification?: (
    request: EcosystemResource,
    action: 'approve' | 'revoke',
    key: string,
  ) => Promise<string>;
  ai?: {
    providers: ProviderId[];
    send: (
      provider: ProviderId,
      messages: AIMessage[],
      signal: AbortSignal,
    ) => Promise<string>;
  };
}
type Env = { Variables: { actor: Did } };
export function ecosystemRoutes(options: EcosystemOptions = {}) {
  const app = new Hono<Env>();
  const {
    store,
    authenticate,
    reviewerDids = [],
    allowedAppOrigins = [],
  } = options;
  const rates = new Map<string, { start: number; count: number }>();
  const tickets = new Map<string, { id: string; expires: number }>();
  app.use('*', bodyLimit({ maxSize: 128 * 1024 }));
  app.get('/capabilities', c =>
    c.json({
      storage: !!store,
      authentication: !!authenticate,
      moderation: !!options.canView && !!options.canReference,
      verificationIssuer: false,
      appRunner: !!options.runnerOrigin && !!store && !!authenticate,
      payments: false,
      aiProviders: options.ai?.providers ?? [],
      reviewer: false,
    }),
  );
  app.get('/apps/:id/run', async c => {
    if (!store || !options.runnerOrigin)
      throw new EcosystemError(503, 'Runner não configurado');
    if (c.req.header('host') !== new URL(options.runnerOrigin).host)
      throw new EcosystemError(403, 'Runner exige origem separada');
    const key = c.req.query('ticket') ?? '';
    const ticket = tickets.get(key);
    tickets.delete(key);
    if (
      !ticket ||
      ticket.id !== c.req.param('id') ||
      ticket.expires < Date.now()
    )
      throw new EcosystemError(403, 'Autorização de execução expirada');
    const r = await store.get(ticket.id);
    if (!r || r.kind !== 'app')
      throw new EcosystemError(404, 'App não encontrado');
    const doc = sandboxDocument(r.data as AppManifest, allowedAppOrigins);
    c.header('Content-Security-Policy', doc.csp);
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
    return c.html(doc.html);
  });
  app.use('*', async (c, next) => {
    if (!store || !authenticate)
      throw new EcosystemError(503, 'Serviço AQUA não configurado');
    const actor = await authenticate(c.req.header('authorization'));
    c.set('actor', actor);
    const now = Date.now();
    const rate = rates.get(actor);
    if (rates.size > 10000)
      for (const [key, value] of rates)
        if (now - value.start > 60000) rates.delete(key);
    if (rate && now - rate.start < 60000) {
      if (++rate.count > 120)
        throw new EcosystemError(429, 'Aguarde antes de continuar');
    } else {
      if (rates.size >= 10000) throw new EcosystemError(503, 'Serviço ocupado');
      rates.set(actor, { start: now, count: 1 });
    }
    await next();
  });
  const visible = async (r: EcosystemResource, actor: Did) => {
    if (r.kind === 'verification')
      return r.ownerDid === actor || reviewerDids.includes(actor);
    if (r.ownerDid === actor) return true;
    if (r.kind === 'workspace') return false;
    if (
      r.kind === 'community' &&
      (r.data as Community).bannedDids.includes(actor)
    )
      return false;
    if (r.visibility === 'private' && !roleOf(r, actor)) return false;
    // No public discovery island that bypasses graph/labels/moderation.
    return options.canView ? options.canView(actor, r) : false;
  };
  const load = async (id: string, actor: Did) => {
    const r = await store!.get(uuid(id));
    if (!r || !(await visible(r, actor)))
      throw new EcosystemError(404, 'Recurso não encontrado');
    return r;
  };
  const mutate = async (
    id: string,
    actor: Did,
    action: string,
    b: Record<string, unknown>,
    change: (r: EcosystemResource) => void,
  ) =>
    store!.mutate(
      uuid(id),
      actor,
      action,
      integer(b.revision, 1, 2147483646),
      change,
    );
  app.get('/me/capabilities', c =>
    c.json({ reviewer: reviewerDids.includes(c.get('actor')) }),
  );
  app.get('/resources', async c => {
    const kind = choice(c.req.query('kind'), KINDS);
    const query = (c.req.query('q') ?? '').slice(0, 200).toLocaleLowerCase();
    const list = await store!.list(kind);
    const results: EcosystemResource[] = [];
    for (const r of list)
      if (
        (await visible(r, c.get('actor'))) &&
        (!query ||
          `${r.name} ${r.description}`.toLocaleLowerCase().includes(query))
      )
        results.push(r);
    return c.json({
      resources: results,
      discoveryConfigured: !!options.canView,
      limited: list.length === 200,
    });
  });
  app.post('/resources', async c => {
    const r = initialResource(
      await c.req.json(),
      c.get('actor'),
      allowedAppOrigins,
    );
    await store!.create(r, c.get('actor'));
    return c.json(r, 201);
  });
  app.get('/resources/:id', async c =>
    c.json(await load(c.req.param('id'), c.get('actor'))),
  );
  app.get('/apps/:creator/:slug', async c => {
    const r = await store!.find(
      'app',
      did(c.req.param('creator')),
      text(c.req.param('slug'), 80),
    );
    if (!r || !(await visible(r, c.get('actor'))))
      throw new EcosystemError(404, 'App não encontrado');
    return c.json(r);
  });
  app.get('/search', async c => {
    const query = text(c.req.query('q'), 200).toLocaleLowerCase();
    const resources: EcosystemResource[] = [];
    for (const kind of ['community', 'portal', 'app', 'broadcast'] as const)
      for (const r of await store!.list(kind))
        if (
          (await visible(r, c.get('actor'))) &&
          `${r.name} ${r.description}`.toLocaleLowerCase().includes(query)
        )
          resources.push(r);
    return c.json({
      resources: resources.slice(0, 100),
      discoveryConfigured: !!options.canView,
    });
  });
  app.post('/apps/:id/run-ticket', async c => {
    if (
      !options.runnerOrigin ||
      new URL(options.runnerOrigin).protocol !== 'https:'
    )
      throw new EcosystemError(503, 'Runner HTTPS não configurado');
    const r = await load(c.req.param('id'), c.get('actor'));
    if (r.kind !== 'app') fail('Recurso não é app');
    sandboxDocument(r.data as AppManifest, allowedAppOrigins);
    const now = Date.now();
    for (const [key, ticket] of tickets)
      if (ticket.expires < now) tickets.delete(key);
    if (tickets.size >= 1000) throw new EcosystemError(429, 'Runner ocupado');
    const key = randomUUID();
    tickets.set(key, { id: r.id, expires: now + 60000 });
    return c.json({
      url: `${options.runnerOrigin}/ecosystem/apps/${r.id}/run?ticket=${key}`,
    });
  });
  app.get('/resources/:id/audit', async c => {
    const r = await load(c.req.param('id'), c.get('actor'));
    if (!reviewerDids.includes(c.get('actor')))
      requireRole(r, c.get('actor'), ['owner', 'admin']);
    return c.json({ events: await store!.audit(r.id) });
  });
  app.post('/resources/:id/actions', async c => {
    const actor = c.get('actor');
    const id = c.req.param('id');
    const b = object(await c.req.json());
    const action = text(b.action, 40);
    const current = await load(id, actor);
    if (action === 'post' || action === 'reference') {
      const uri = atUri(b.uri);
      if (!options.canReference || !(await options.canReference(actor, uri)))
        throw new EcosystemError(
          503,
          'Moderação de referências não configurada ou referência indisponível',
        );
    }
    const result = await mutate(id, actor, action, b, r => {
      if (action === 'settings') {
        requireRole(r, actor, ['owner']);
        if (b.name !== undefined) r.name = text(b.name, 120);
        if (b.description !== undefined)
          r.description = text(b.description, 2000, false);
        if (b.visibility !== undefined) {
          const visibility = choice(b.visibility, [
            'public',
            'unlisted',
            'private',
          ]);
          if (
            ['workspace', 'verification'].includes(r.kind) &&
            visibility !== 'private'
          )
            throw new EcosystemError(
              403,
              'Dados privados não podem ser publicados',
            );
          r.visibility = visibility;
        }
        if (r.kind === 'app') {
          (r.data as AppManifest).name = r.name;
          (r.data as AppManifest).description = r.description;
        }
        return;
      }
      if (r.kind === 'community' || r.kind === 'portal') {
        const d = r.data as Community | Portal;
        if (action === 'join') {
          if (r.visibility !== 'public')
            throw new EcosystemError(403, 'Entrada exige convite');
          if (
            r.kind === 'community' &&
            (d as Community).bannedDids.includes(actor)
          )
            throw new EcosystemError(403, 'Membro removido pela moderação');
          if (!d.members.some(m => m.did === actor)) {
            if (d.members.length >= 1000) fail('Limite de membros');
            d.members.push({ did: actor, role: 'contributor' });
          }
          return;
        }
        if (action === 'leave') {
          if (actor === r.ownerDid)
            throw new EcosystemError(
              403,
              'Proprietário não pode abandonar o recurso',
            );
          d.members = d.members.filter(m => m.did !== actor);
          return;
        }
        if (action === 'member' || action === 'ban') {
          requireRole(
            r,
            actor,
            action === 'ban'
              ? ['owner', 'admin', 'moderator']
              : ['owner', 'admin'],
          );
          const target = did(b.did);
          if (target === r.ownerDid)
            throw new EcosystemError(
              403,
              'Não é permitido alterar o proprietário',
            );
          if (roleOf(r, target) === 'admin' && actor !== r.ownerDid)
            throw new EcosystemError(
              403,
              'Somente proprietário altera administradores',
            );
          d.members = d.members.filter(m => m.did !== target);
          if (action === 'ban' && r.kind === 'community') {
            const community = d as Community;
            if (community.bannedDids.length >= 1000)
              fail('Limite de moderação');
            if (!community.bannedDids.includes(target))
              community.bannedDids.push(target);
            return;
          }
          const role = choice(b.role, [
            'admin',
            'editor',
            'researcher',
            'contributor',
            'moderator',
            'viewer',
          ]);
          if (role === 'admin' && actor !== r.ownerDid)
            throw new EcosystemError(403, 'Somente proprietário concede admin');
          if (d.members.length >= 1000) fail('Limite de membros');
          d.members.push({ did: target, role });
          return;
        }
        if (r.kind === 'community') {
          const community = d as Community;
          if (action === 'channel') {
            requireRole(r, actor, ['owner', 'admin']);
            if (community.channels.length >= 100) fail('Limite de canais');
            community.channels.push({
              id: randomUUID(),
              name: text(b.name, 80),
              type: choice(b.type, ['text', 'forum', 'media', 'announcements']),
              posts: [],
            });
            return;
          }
          const channel = community.channels.find(x => x.id === b.channelId);
          if (!channel) fail('Canal não encontrado');
          if (action === 'post') {
            requireRole(
              r,
              actor,
              channel.type === 'announcements'
                ? ['owner', 'admin', 'moderator']
                : ['owner', 'admin', 'moderator', 'contributor', 'editor'],
            );
            const uri = atUri(b.uri);
            const uriDid = uri.slice(5).split('/')[0];
            if (uriDid !== actor || !uri.includes('/app.bsky.feed.post/'))
              throw new EcosystemError(
                403,
                'Publique apenas seu próprio post AT',
              );
            if (channel.posts.length >= 500) fail('Limite de referências');
            if (!channel.posts.some(p => p.uri === uri))
              channel.posts.push({
                uri,
                authorDid: actor,
                pinned: false,
                createdAt: new Date().toISOString(),
              });
            return;
          }
          if (action === 'pin' || action === 'remove_post') {
            requireRole(r, actor, ['owner', 'admin', 'moderator']);
            const uri = atUri(b.uri);
            if (action === 'pin') {
              const post = channel.posts.find(p => p.uri === uri);
              if (!post) fail('Post não encontrado');
              post.pinned = b.pinned === true;
            } else channel.posts = channel.posts.filter(p => p.uri !== uri);
            return;
          }
        }
        if (r.kind === 'portal' && action === 'reference') {
          requireRole(r, actor, [
            'owner',
            'admin',
            'editor',
            'researcher',
            'contributor',
          ]);
          const portal = d as Portal;
          const section = choice(b.section, [
            'overview',
            'research',
            'sources',
            'documents',
            'data',
            'timeline',
            'discussions',
            'people',
            'organizations',
            'media',
            'conventions',
            'related',
          ]);
          const refs = portal.sections[section] ?? [];
          if (refs.length >= 500) fail('Limite de referências');
          const uri = atUri(b.uri);
          if (!refs.some(x => x.uri === uri))
            refs.push({
              type: choice(b.type, [
                'post',
                'video',
                'image',
                'book',
                'music',
                'doc',
                'app',
                'dataset',
                'source',
              ]),
              uri,
              title: text(b.title, 200),
              ...(b.source ? { source: https(b.source) } : {}),
            });
          portal.sections[section] = refs;
          return;
        }
        if (r.kind === 'portal' && action === 'source') {
          requireRole(r, actor, ['owner', 'admin', 'editor', 'researcher']);
          const portal = d as Portal;
          const refs = portal.sections.sources ?? [];
          if (refs.length >= 500) fail('Limite de fontes');
          const uri = https(b.uri);
          if (!refs.some(x => x.uri === uri))
            refs.push({
              type: 'source',
              uri,
              title: text(b.title, 200),
              source: uri,
            });
          portal.sections.sources = refs;
          return;
        }
        if (r.kind === 'portal' && action === 'country_fact') {
          requireRole(r, actor, ['owner', 'admin', 'editor', 'researcher']);
          const portal = d as Portal;
          const countryCode = text(b.countryCode, 2).toUpperCase();
          if (!/^[A-Z]{2}$/.test(countryCode)) fail('Código de país inválido');
          const key = choice(b.field, [
            'population',
            'economy',
            'health',
            'education',
            'geography',
            'culture',
            'government',
          ]);
          const retrievedAt = text(b.retrievedAt, 40);
          if (!Number.isFinite(Date.parse(retrievedAt)))
            fail('Data da fonte inválida');
          if (portal.country && portal.country.countryCode !== countryCode)
            throw new EcosystemError(409, 'Portal já vinculado a outro país');
          portal.country ??= { countryCode, facts: {} };
          portal.country.facts[key] = {
            value: text(b.value, 1000),
            source: https(b.source),
            retrievedAt,
          };
          return;
        }
      }
      if (r.kind === 'broadcast') {
        const channel = r.data as BroadcastChannel;
        if (action === 'follow') {
          if (!channel.followers.includes(actor)) {
            if (channel.followers.length >= 1000) fail('Limite de seguidores');
            channel.followers.push(actor);
          }
          return;
        }
        if (action === 'unfollow') {
          channel.followers = channel.followers.filter(d => d !== actor);
          return;
        }
        if (action === 'schedule') {
          requireRole(r, actor, ['owner']);
          if (channel.schedule.length >= 500) fail('Limite da grade');
          const item = scheduleItem(b, r.id);
          try {
            channel.schedule = validateSchedule([...channel.schedule, item]);
          } catch (e) {
            fail((e as Error).message);
          }
          return;
        }
        if (action === 'remove_schedule') {
          requireRole(r, actor, ['owner']);
          channel.schedule = channel.schedule.filter(
            i => i.id !== uuid(b.scheduleId),
          );
          return;
        }
      }
      if (r.kind === 'workspace') {
        requireRole(r, actor, ['owner']);
        const workspace = r.data as Workspace;
        if (action === 'context') {
          workspace.context[
            choice(b.layer, ['GLOBAL', 'PROJECT', 'TASK', 'TEMPORARY'])
          ] = text(b.text, 12000, false);
          return;
        }
        if (action === 'decision') {
          if (workspace.decisions.length >= 200) fail('Limite de decisões');
          workspace.decisions.push({
            id: randomUUID(),
            text: text(b.text, 2000),
            authorDid: actor,
            createdAt: new Date().toISOString(),
          });
          return;
        }
        if (action === 'task') {
          if (workspace.tasks.length >= 200) fail('Limite de tarefas');
          workspace.tasks.push({
            id: randomUUID(),
            title: text(b.title, 200),
            status: b.needsDecision === true ? 'NEEDS_DECISION' : 'pending',
          });
          return;
        }
        if (action === 'resolve_task') {
          const task = workspace.tasks.find(t => t.id === b.taskId);
          if (!task) fail('Tarefa não encontrada');
          task.status = choice(b.status, [
            'pending',
            'completed',
            'blocked',
            'NEEDS_DECISION',
          ]);
          return;
        }
        if (action === 'automaton') {
          if (workspace.automata.length >= 100) fail('Limite de autômatos');
          workspace.automata.push({
            id: randomUUID(),
            mission: text(b.mission, 200),
            territory: ['workspace/**'],
            capabilities: ['inspect_workspace'],
            permissions: {
              read: ['workspace/**'],
              write: [],
              execute: [],
              denied: ['billing/**', 'auth/**', 'secrets/**', 'database/**'],
            },
            limits: { maxSteps: 1, maxDurationMs: 5000, maxExternalCalls: 0 },
            successCondition: 'Contexto inspecionado sem sair do workspace',
            status: 'EQUIPPED',
            logs: [],
          });
          return;
        }
        if (action === 'link') {
          const uri = https(b.uri);
          const type = choice(b.type, ['repo', 'service']);
          const list =
            type === 'repo' ? workspace.linkedRepos : workspace.linkedServices;
          if (list.length >= 100) fail('Limite de vínculos');
          if (!list.includes(uri)) list.push(uri);
          return;
        }
        if (action === 'file') {
          if (workspace.files.length >= 200) fail('Limite de referências');
          const uri = atUri(b.uri);
          if (!workspace.files.some(f => f.uri === uri))
            workspace.files.push({
              uri,
              title: text(b.title, 200),
              type: choice(b.type, [
                'doc',
                'image',
                'video',
                'post',
                'dataset',
              ]),
            });
          return;
        }
      }
      if (r.kind === 'verification' && action === 'submit') {
        requireRole(r, actor, ['owner']);
        const request = r.data as VerificationRequest;
        if (!['draft', 'needs_information'].includes(request.status))
          throw new EcosystemError(409, 'Solicitação já enviada');
        request.status = 'submitted';
        return;
      }
      fail('Ação não suportada para este recurso');
    });
    return c.json(result);
  });
  app.post('/verification/:id/review', async c => {
    const actor = c.get('actor');
    if (!reviewerDids.includes(actor))
      throw new EcosystemError(403, 'Revisor não autorizado');
    const b = object(await c.req.json());
    const action = choice(b.action, [
      'under_review',
      'approve',
      'reject',
      'request_more_info',
      'revoke',
    ]);
    const r = await load(c.req.param('id'), actor);
    if (r.kind !== 'verification') fail('Recurso não é solicitação');
    if (actor === r.ownerDid)
      throw new EcosystemError(
        403,
        'Não é permitido revisar a própria solicitação',
      );
    // Approval/revocation stay disabled until an idempotent AT issuer/outbox is integrated.
    if (action === 'approve' || action === 'revoke')
      throw new EcosystemError(
        503,
        'Emissor AT e conciliação de verificação não configurados',
      );
    return c.json(
      await mutate(r.id, actor, `review:${action}`, b, next => {
        const request = next.data as VerificationRequest;
        const valid =
          action === 'under_review'
            ? ['submitted']
            : ['submitted', 'under_review'];
        if (!valid.includes(request.status))
          throw new EcosystemError(409, 'Transição de revisão inválida');
        request.status =
          action === 'under_review'
            ? 'under_review'
            : action === 'reject'
              ? 'rejected'
              : 'needs_information';
        request.reviewerDid = actor;
        request.reviewNotes = text(
          b.notes ?? '',
          2000,
          action !== 'under_review',
        );
      }),
    );
  });
  app.post('/workspaces/:id/run', async c => {
    const actor = c.get('actor');
    const b = object(await c.req.json());
    const r = await load(c.req.param('id'), actor);
    requireRole(r, actor, ['owner']);
    if (r.kind !== 'workspace') fail('Workspace inválido');
    const workspace = r.data as Workspace;
    const automaton = workspace.automata.find(a => a.id === b.automatonId);
    if (!automaton) fail('Autômato não encontrado');
    await mutate(r.id, actor, 'automaton:claim', b, next => {
      const a = (next.data as Workspace).automata.find(
        a => a.id === automaton.id,
      )!;
      if (a.status !== 'EQUIPPED')
        throw new EcosystemError(409, 'Autômato já executado');
      a.status = 'RUNNING';
      a.startedAt = new Date().toISOString();
    });
    const result: Automaton = await runAutomaton(automaton, [
      {
        operation: {
          capability: 'inspect_workspace',
          mode: 'read',
          target: `workspace/${r.id}`,
        },
        run: async () =>
          `${workspace.tasks.length} tarefas; ${workspace.decisions.length} decisões; ${workspace.files.length} referências`,
        succeeds: r => r.length > 0,
      },
    ]);
    return c.json(
      await store!.mutate(r.id, actor, 'automaton:result', undefined, next => {
        const d = next.data as Workspace;
        const index = d.automata.findIndex(a => a.id === result.id);
        if (index < 0 || d.automata[index]?.status !== 'RUNNING')
          throw new EcosystemError(409, 'Execução mudou');
        d.automata[index] = result;
      }),
    );
  });
  app.post('/workspaces/:id/ask', async c => {
    const actor = c.get('actor');
    const r = await load(c.req.param('id'), actor);
    requireRole(r, actor, ['owner']);
    if (r.kind !== 'workspace') fail('Workspace inválido');
    const b = object(await c.req.json());
    const intent = text(b.intent, 2000);
    const workspace = r.data as Workspace;
    const plan = planMission(
      intent,
      workspace,
      ['inspect_workspace'],
      options.ai?.providers ?? [],
    );
    if (b.authorizeExternal === true) {
      if (!options.ai?.providers.length)
        throw new EcosystemError(503, 'Provedor de IA não configurado');
      const provider = choice(b.provider, options.ai.providers);
      if (plan.status === 'NEEDS_DECISION')
        return c.json({ plan, externalExecution: 'blocked_pending_decision' });
      const layers = array(b.layers ?? [], 4).map(l =>
        choice(l, ['GLOBAL', 'PROJECT', 'TASK', 'TEMPORARY'] as const),
      );
      const context = selectContext(workspace, layers, 12000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const abort = () => controller.abort();
      c.req.raw.signal.addEventListener('abort', abort, { once: true });
      let result: string;
      try {
        result = await options.ai.send(
          provider,
          [
            {
              role: 'system',
              content:
                'Você é um recurso especializado da U.I. AQUA. Preserve as decisões fornecidas. Não invente decisões, execuções ou resultados. Responda NEEDS_DECISION se precisar de uma decisão do usuário.',
            },
            {
              role: 'user',
              content: context ? `${context}\n\n${intent}` : intent,
            },
          ],
          controller.signal,
        );
      } finally {
        clearTimeout(timer);
        c.req.raw.signal.removeEventListener('abort', abort);
      }
      await store!.mutate(r.id, actor, 'ai:response', undefined, next => {
        const w = next.data as Workspace;
        const messages = w.messages ?? [];
        if (messages.length >= 100) messages.splice(0, 2);
        const createdAt = new Date().toISOString();
        messages.push(
          { id: randomUUID(), role: 'user', text: intent, provider, createdAt },
          {
            id: randomUUID(),
            role: 'assistant',
            text: result,
            provider,
            createdAt,
          },
        );
        w.messages = messages;
      });
      return c.json({ plan, result, provider, externalExecution: 'completed' });
    }
    return c.json({
      plan,
      result:
        plan.status === 'ready' && plan.strategy === 'deterministic'
          ? `${workspace.tasks.length} tarefas; ${workspace.decisions.length} decisões`
          : undefined,
      externalExecution: 'not_configured',
    });
  });
  app.get('/me/privacy', async c =>
    c.json({ analytics: await store!.consent(c.get('actor')) }),
  );
  app.put('/me/privacy', async c => {
    const b = object(await c.req.json());
    if (typeof b.analytics !== 'boolean') fail('Consentimento inválido');
    return c.json({
      analytics: await store!.consent(c.get('actor'), b.analytics),
    });
  });
  app.post('/events', async c => {
    const actor = c.get('actor');
    if (!(await store!.consent(actor)))
      return c.json({ recorded: false, reason: 'consent_required' });
    const b = object(await c.req.json());
    const r = await load(uuid(b.resourceId), actor);
    const context = b.context ? object(b.context) : {};
    const event = choice(b.event, ANALYTICS_EVENTS);
    if (['purchase', 'subscribe'].includes(event))
      throw new EcosystemError(
        403,
        'Eventos financeiros exigem provedor confiável',
      );
    await store!.record(r.ownerDid, {
      id: uuid(b.id),
      event,
      resourceType: r.kind,
      resourceId: r.id,
      context: {
        ...(context.surface
          ? {
              surface: choice(context.surface, [
                'aqua',
                'apps',
                'broadcast',
                'community',
                'portal',
              ]),
            }
          : {}),
        ...(context.durationMs !== undefined
          ? { durationMs: integer(context.durationMs, 0, 86400000) }
          : {}),
      },
      timestamp: new Date().toISOString(),
    });
    return c.json({ recorded: true });
  });
  app.get('/me/analytics', async c =>
    c.json({
      window: '30 days',
      metrics: await store!.analytics(c.get('actor')),
      scope: 'ecosystem; historical module ingestion not configured',
    }),
  );
  app.get('/me/wallet', async c => {
    const actor = c.get('actor');
    const entries = await store!.ledger(actor);
    const currencies = [...new Set(entries.map(e => e.currency))];
    return c.json({
      summaries: currencies.map(currency =>
        summarizeLedger(actor, currency, entries),
      ),
      entries,
      paymentsConfigured: false,
      message: 'Pagamento não configurado',
    });
  });
  app.onError((e, c) => {
    if (e instanceof EcosystemError)
      return c.json({ message: e.message }, e.status);
    if (e instanceof SyntaxError)
      return c.json({ message: 'JSON inválido' }, 400);
    console.error(
      'ecosystem operation failed',
      e instanceof Error ? e.name : 'unknown',
    );
    return c.json({ message: 'Falha no serviço AQUA' }, 500);
  });
  return app;
}
