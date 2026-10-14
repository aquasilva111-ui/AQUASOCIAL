import { randomUUID } from 'node:crypto';
import { validateSchedule } from '../../../../src/lib/ecosystem/broadcast.ts';
import {
  ENTITY_TYPES,
  type AppManifest,
  type BroadcastChannel,
  type Community,
  type Did,
  type EcosystemResource,
  type Portal,
  type ResourceKind,
  type VerificationRequest,
  type Workspace,
} from '../../../../src/lib/ecosystem/types.ts';
import { EcosystemError } from './store.ts';

export function fail(message: string): never {
  throw new EcosystemError(400, message);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('Objeto inválido');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 200, required = true): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  )
    return fail('Texto inválido');
  return value.trim();
}
export function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
): T {
  if (!choices.includes(value as T)) return fail('Opção inválida');
  return value as T;
}
export function array(value: unknown, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    return fail('Lista inválida');
  return value;
}
export function uuid(value: unknown) {
  const id = text(value, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return fail('ID inválido');
  return id;
}
export function did(value: unknown): Did {
  const s = text(value, 512);
  if (!/^did:(plc|web):[a-zA-Z0-9._:%-]+$/.test(s)) return fail('DID inválido');
  return s as Did;
}
export function integer(value: unknown, min: number, max: number) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    return fail('Inteiro inválido');
  return value as number;
}
export function https(value: unknown) {
  const s = text(value, 2048);
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return fail('URL inválida');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    return fail('Use HTTPS sem credenciais ou fragmentos');
  return url.href;
}
export function atUri(value: unknown) {
  const s = text(value, 1024);
  if (
    !/^at:\/\/did:(plc|web):[a-zA-Z0-9._:%-]+\/[a-zA-Z0-9.]+\/[a-zA-Z0-9._~-]+$/.test(
      s,
    )
  )
    return fail('Referência AT inválida');
  if (s.includes('/app.aqua.adult.'))
    return fail('Conteúdo +18 não pertence a este ambiente');
  return s;
}
export const KINDS: ResourceKind[] = [
  'community',
  'portal',
  'app',
  'broadcast',
  'workspace',
  'verification',
];
export const roleOf = (r: EcosystemResource, actor: Did) =>
  r.ownerDid === actor
    ? 'owner'
    : r.kind === 'community' || r.kind === 'portal'
      ? (r.data as Community | Portal).members.find(m => m.did === actor)?.role
      : undefined;
export function requireRole(r: EcosystemResource, actor: Did, roles: string[]) {
  if (!roles.includes(roleOf(r, actor) ?? ''))
    throw new EcosystemError(403, 'Permissão insuficiente');
}
export function initialResource(
  body: unknown,
  ownerDid: Did,
  allowedAppOrigins: string[],
): EcosystemResource {
  const b = object(body);
  const kind = choice(b.kind, KINDS);
  const slug = text(b.slug, 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return fail('Slug deve usar letras minúsculas, números e hífens');
  const now = new Date().toISOString();
  const r: EcosystemResource = {
    id: randomUUID(),
    kind,
    ownerDid,
    slug,
    name: text(b.name, 120),
    description: text(b.description ?? '', 2000, false),
    visibility: choice(b.visibility ?? 'private', [
      'private',
      'public',
      'unlisted',
    ]),
    createdAt: now,
    updatedAt: now,
    revision: 1,
    data: {} as Community,
  };
  const d = b.data ? object(b.data) : {};
  if (kind === 'community')
    r.data = {
      members: [{ did: ownerDid, role: 'owner' }],
      channels: [],
      bannedDids: [],
    };
  if (kind === 'portal')
    r.data = {
      members: [{ did: ownerDid, role: 'owner' }],
      topics: [],
      languages: [],
      regions: [],
      sections: {},
    };
  if (kind === 'broadcast')
    r.data = {
      type: choice(d.type ?? 'video', ['video', 'radio']),
      schedule: [],
      followers: [],
    } satisfies BroadcastChannel;
  if (kind === 'workspace') {
    r.visibility = 'private';
    r.data = {
      context: {},
      decisions: [],
      tasks: [],
      files: [],
      linkedRepos: [],
      linkedServices: [],
      automata: [],
    } satisfies Workspace;
  }
  if (kind === 'app') {
    const entry = https(d.entry);
    if (!allowedAppOrigins.includes(new URL(entry).origin))
      throw new EcosystemError(
        403,
        'Origem de publicação de apps não autorizada',
      );
    if (!new URL(entry).pathname.endsWith('.js'))
      return fail('Entrada deve ser um bundle JavaScript .js publicado');
    // Only zero-privilege apps until capability grants and bridge have been reviewed.
    if (array(d.permissions ?? [], 6).length)
      return fail('Permissões adicionais ainda não suportadas; padrão negar');
    r.data = {
      id: r.id,
      ownerDid,
      name: r.name,
      slug,
      version: text(d.version ?? '1.0.0', 40),
      description: r.description,
      entry,
      permissions: [],
      runtime: choice(d.runtime ?? 'web', ['web', 'wasm', 'webgl']),
      createdAt: now,
      updatedAt: now,
      ...(d.projectId ? { projectId: text(d.projectId, 200) } : {}),
    } satisfies AppManifest;
  }
  if (kind === 'verification') {
    r.visibility = 'private';
    r.data = {
      applicantDid: ownerDid,
      entityType: choice(d.entityType, ENTITY_TYPES),
      legalName: text(d.legalName, 200),
      displayName: text(d.displayName, 200),
      website: https(d.website),
      country: text(d.country, 2).toUpperCase(),
      evidence: [{ type: 'website', reference: https(d.website) }],
      status: 'draft',
    } satisfies VerificationRequest;
    if (!/^[A-Z]{2}$/.test((r.data as VerificationRequest).country))
      return fail('Código de país inválido');
  }
  return r;
}
export function scheduleItem(body: unknown, channelId: string) {
  const b = object(body);
  const item = {
    id: randomUUID(),
    channelId,
    title: text(b.title, 200),
    description: text(b.description ?? '', 2000, false),
    startAt: text(b.startAt, 40),
    endAt: text(b.endAt, 40),
    ...(b.mediaUri ? { mediaUri: https(b.mediaUri) } : {}),
    ...(b.liveSource ? { liveSource: https(b.liveSource) } : {}),
  };
  const zoned =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!zoned.test(item.startAt) || !zoned.test(item.endAt))
    return fail('Use ISO 8601 com fuso explícito');
  try {
    validateSchedule([item]);
  } catch (e) {
    return fail((e as Error).message);
  }
  return item;
}
