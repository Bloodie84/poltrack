/**
 * Local stand-in for the Supabase API, used only to run the end-to-end tests
 * in this repository. It speaks just enough GoTrue / PostgREST / Storage to
 * drive the real application, and it talks to a real PostgreSQL database that
 * has the real migrations applied — so Row Level Security is genuinely
 * exercised, not simulated.
 *
 * This is test infrastructure. It is never imported by the application.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54321);
const DB = process.env.FAKE_SUPABASE_DB ?? 'sonora_e2e';
const STORAGE_DIR = process.env.FAKE_SUPABASE_STORAGE ?? '/tmp/sonora-storage';
export const ANON_KEY = 'anon-key-for-tests';
export const SERVICE_KEY = 'service-key-for-tests';

const pool = new pg.Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: DB,
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
  max: 8,
});
const sessions = new Map(); // access_token -> user id

fs.mkdirSync(STORAGE_DIR, { recursive: true });

/* ------------------------------------------------------------------ utils */

const json = (res, status, body, headers = {}) => {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    ...headers,
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function mintToken(userId, email) {
  const now = Math.floor(Date.now() / 1000);
  const token = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: userId, email, role: 'authenticated', iat: now, exp: now + 3600, aud: 'authenticated' }),
    crypto.randomBytes(24).toString('base64url'),
  ].join('.');
  sessions.set(token, userId);
  return token;
}

const hash = (s) => crypto.createHash('sha256').update(`sonora:${s}`).digest('hex');

function bearer(req) {
  const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (raw === SERVICE_KEY) return { role: 'service_role', userId: null };
  const userId = sessions.get(raw);
  if (userId) return { role: 'authenticated', userId };
  return { role: 'anon', userId: null };
}

/** Runs a statement with the caller's PostgREST role, so RLS applies. */
async function withRole({ role, userId }, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role === 'service_role' ? 'service_role' : role === 'authenticated' ? 'authenticated' : 'anon'}`);
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function asSuperuser(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------- auth */

async function handleAuth(req, res, url) {
  const body = req.method === 'GET' ? {} : JSON.parse((await readBody(req)).toString() || '{}');
  const route = url.pathname.replace('/auth/v1', '');

  if (route === '/signup') {
    const { email, password, data } = body;
    if (!email || !password) return json(res, 400, { message: 'Email and password required' });
    const exists = await asSuperuser((c) => c.query('select id from auth.users where email = $1', [email]));
    if (exists.rowCount) return json(res, 400, { message: 'User already registered' });
    const created = await asSuperuser((c) =>
      c.query(
        `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id, email`,
        [email, JSON.stringify(data ?? {})]
      )
    );
    const user = created.rows[0];
    await asSuperuser((c) =>
      c.query('insert into auth.stub_passwords (user_id, hash) values ($1, $2)', [user.id, hash(password)])
    );
    const token = mintToken(user.id, user.email);
    return json(res, 200, {
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: crypto.randomBytes(16).toString('hex'),
      user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: data ?? {}, created_at: new Date().toISOString() },
    });
  }

  if (route === '/token') {
    const { email, password } = body;
    const found = await asSuperuser((c) =>
      c.query(
        `select u.id, u.email, p.hash from auth.users u
         left join auth.stub_passwords p on p.user_id = u.id where u.email = $1`,
        [email]
      )
    );
    const row = found.rows[0];
    if (!row || row.hash !== hash(password)) {
      return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', message: 'Invalid login credentials' });
    }
    const token = mintToken(row.id, row.email);
    return json(res, 200, {
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: crypto.randomBytes(16).toString('hex'),
      user: { id: row.id, email: row.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    });
  }

  if (route === '/user') {
    const auth = bearer(req);
    if (!auth.userId) return json(res, 401, { message: 'invalid claim: missing sub claim' });
    if (req.method === 'PUT') {
      if (body.password) {
        await asSuperuser((c) =>
          c.query('update auth.stub_passwords set hash = $2 where user_id = $1', [auth.userId, hash(body.password)])
        );
      }
    }
    const found = await asSuperuser((c) => c.query('select id, email from auth.users where id = $1', [auth.userId]));
    const row = found.rows[0];
    return json(res, 200, { id: row.id, email: row.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
  }

  if (route === '/logout') {
    const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    sessions.delete(raw);
    return json(res, 204, undefined);
  }

  return json(res, 404, { message: `unhandled auth route ${route}` });
}

/* --------------------------------------------------------------- postgrest */

const OPERATORS = { eq: '=', gte: '>=', lte: '<=', gt: '>', lt: '<', neq: '<>' };

function buildSelect(table, select) {
  // "a, b, rel(x, y)" -> column list plus one embedded json subquery
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of select) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const columns = [];
  for (const part of parts) {
    const embed = part.match(/^([a-z_]+)\((.*)\)$/s);
    if (embed) {
      const [, rel, cols] = embed;
      const relColumns = cols.split(',').map((c) => c.trim()).filter(Boolean);
      const list = relColumns.map((c) => `'${c}', r.${c}`).join(', ');
      columns.push(
        `(select json_agg(json_build_object(${list})) from public.${rel} r where r.track_id = ${table}.id) as ${rel}`
      );
    } else if (part === '*') {
      columns.push(`${table}.*`);
    } else {
      columns.push(`${table}.${part}`);
    }
  }
  return columns.join(', ');
}

async function handleRest(req, res, url) {
  const auth = bearer(req);
  const table = url.pathname.replace('/rest/v1/', '');
  const params = url.searchParams;
  const prefer = String(req.headers.prefer ?? '');
  const wantsObject = String(req.headers.accept ?? '').includes('vnd.pgrst.object');
  const body = ['POST', 'PATCH', 'PUT'].includes(req.method)
    ? JSON.parse((await readBody(req)).toString() || 'null')
    : null;

  if (table.startsWith('rpc/')) {
    const fn = table.slice(4);
    return withRole(auth, async (c) => {
      const keys = Object.keys(body ?? {});
      const values = keys.map((k) => body[k]);
      const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
      await c.query(`select public.${fn}(${args})`, values);
      return { status: 200, body: null };
    })
      .then((out) => json(res, out.status, out.body))
      .catch((e) => json(res, 400, { message: e.message, code: e.code }));
  }

  const filters = [];
  const values = [];
  for (const [key, value] of params.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const [op, ...rest] = value.split('.');
    if (!OPERATORS[op]) continue;
    values.push(rest.join('.'));
    filters.push(`${key} ${OPERATORS[op]} $${values.length}`);
  }
  const where = filters.length ? `where ${filters.join(' and ')}` : '';

  try {
    const out = await withRole(auth, async (c) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const select = params.get('select') ?? '*';
        const order = params.get('order');
        const limit = params.get('limit');
        const orderSql = order
          ? `order by ${order.split('.')[0]} ${order.includes('.desc') ? 'desc' : 'asc'}`
          : '';
        const wantsCount = prefer.includes('count=exact');

        if (req.method === 'HEAD') {
          const counted = await c.query(`select count(*)::int as n from public.${table} ${where}`, values);
          const n = counted.rows[0].n;
          return {
            status: 200,
            body: undefined,
            headers: {
              'content-range': `0-${Math.max(0, n - 1)}/${n}`,
              'access-control-expose-headers': 'content-range',
            },
          };
        }

        const sql = `select ${buildSelect(table, select)} from public.${table} ${where} ${orderSql} ${limit ? `limit ${Number(limit)}` : ''}`;
        const result = await c.query(sql, values);
        if (wantsObject) {
          if (result.rowCount !== 1) {
            return {
              status: 406,
              body: {
                code: 'PGRST116',
                message: 'JSON object requested, multiple (or no) rows returned',
                details: `Results contain ${result.rowCount} rows`,
              },
            };
          }
          return { status: 200, body: result.rows[0] };
        }
        return {
          status: 200,
          body: result.rows,
          headers: {
            'content-range': `0-${Math.max(0, result.rowCount - 1)}/${result.rowCount}`,
            'access-control-expose-headers': 'content-range',
          },
        };
      }

      if (req.method === 'POST') {
        const rows = Array.isArray(body) ? body : [body];
        const inserted = [];
        for (const row of rows) {
          const keys = Object.keys(row).filter((k) => row[k] !== undefined);
          const placeholders = keys.map((_, i) => `$${i + 1}`);
          const vals = keys.map((k) => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
          const returning = prefer.includes('return=representation')
            ? `returning ${buildSelect(table, params.get('select') ?? '*')}`
            : '';
          const result = await c.query(
            `insert into public.${table} (${keys.join(', ')}) values (${placeholders.join(', ')}) ${returning}`,
            vals
          );
          if (result.rows?.[0]) inserted.push(result.rows[0]);
        }
        if (!prefer.includes('return=representation')) return { status: 201, body: null };
        if (wantsObject) {
          if (inserted.length !== 1) {
            return { status: 406, body: { code: 'PGRST116', message: 'no rows' } };
          }
          return { status: 201, body: inserted[0] };
        }
        return { status: 201, body: inserted };
      }

      if (req.method === 'PATCH') {
        const keys = Object.keys(body).filter((k) => body[k] !== undefined);
        const sets = keys.map((k, i) => `${k} = $${values.length + i + 1}`);
        const vals = [...values, ...keys.map((k) => (body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]))];
        const returning = prefer.includes('return=representation')
          ? `returning ${buildSelect(table, params.get('select') ?? '*')}`
          : '';
        const result = await c.query(`update public.${table} set ${sets.join(', ')} ${where} ${returning}`, vals);
        if (!prefer.includes('return=representation')) return { status: 204, body: undefined };
        if (wantsObject) {
          if (result.rowCount !== 1) {
            return { status: 406, body: { code: 'PGRST116', message: 'no rows' } };
          }
          return { status: 200, body: result.rows[0] };
        }
        return { status: 200, body: result.rows };
      }

      if (req.method === 'DELETE') {
        await c.query(`delete from public.${table} ${where}`, values);
        return { status: 204, body: undefined };
      }

      return { status: 405, body: { message: 'method not allowed' } };
    });

    // Written only once the transaction has committed.
    return json(res, out.status, out.body, out.headers ?? {});
  } catch (e) {
    return json(res, 400, { message: e.message, code: e.code, details: e.detail ?? null });
  }
}

/* ---------------------------------------------------------------- storage */

const objectPath = (bucket, name) => path.join(STORAGE_DIR, bucket, name);

async function handleStorage(req, res, url) {
  const auth = bearer(req);
  const p = url.pathname.replace('/storage/v1', '');

  // createSignedUploadUrl
  let m = p.match(/^\/object\/upload\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === 'POST') {
    const [, bucket, name] = m;
    const token = crypto.randomBytes(12).toString('hex');
    return json(res, 200, { url: `/object/upload/sign/${bucket}/${name}?token=${token}`, path: name, token });
  }

  // PUT to the signed upload URL
  if (m && req.method === 'PUT') {
    const [, bucket, name] = m;
    const buf = await readBody(req);
    const dest = objectPath(bucket, decodeURIComponent(name));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return json(res, 200, { Key: `${bucket}/${name}`, path: name });
  }

  // createSignedUrl
  m = p.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === 'POST') {
    const [, bucket, name] = m;
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (!fs.existsSync(objectPath(bucket, decodeURIComponent(name)))) {
      return json(res, 404, { message: 'Object not found' });
    }
    const token = crypto.randomBytes(10).toString('hex');
    const download = body.download ? `&download=${encodeURIComponent(body.download)}` : '';
    return json(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${token}${download}` });
  }

  // GET a signed / public object, with range support
  m = p.match(/^\/object\/(?:sign|public)\/([^/]+)\/(.+)$/);
  if (m && (req.method === 'GET' || req.method === 'HEAD')) {
    const [, bucket, name] = m;
    const file = objectPath(bucket, decodeURIComponent(name.split('?')[0]));
    if (!fs.existsSync(file)) return json(res, 404, { message: 'Object not found' });
    const stat = fs.statSync(file);
    const download = url.searchParams.get('download');
    const headers = {
      'content-type': 'application/octet-stream',
      'accept-ranges': 'bytes',
      'access-control-allow-origin': '*',
    };
    if (download) headers['content-disposition'] = `attachment; filename="${download}"`;

    const range = req.headers.range;
    if (range) {
      const [start, end] = range.replace('bytes=', '').split('-');
      const from = Number(start);
      const to = end ? Number(end) : stat.size - 1;
      res.writeHead(206, {
        ...headers,
        'content-range': `bytes ${from}-${to}/${stat.size}`,
        'content-length': to - from + 1,
      });
      return fs.createReadStream(file, { start: from, end: to }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'content-length': stat.size });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }

  // list
  m = p.match(/^\/object\/list\/([^/]+)$/);
  if (m && req.method === 'POST') {
    const [, bucket] = m;
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const dir = objectPath(bucket, body.prefix ?? '');
    if (!fs.existsSync(dir)) return json(res, 200, []);
    const names = fs.readdirSync(dir).filter((n) => (body.search ? n.includes(body.search) : true));
    return json(res, 200, names.map((name) => ({ name, id: name, metadata: {} })));
  }

  // remove
  m = p.match(/^\/object\/([^/]+)$/);
  if (m && req.method === 'DELETE') {
    const [, bucket] = m;
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    for (const name of body.prefixes ?? []) {
      const file = objectPath(bucket, name);
      if (fs.existsSync(file)) fs.rmSync(file);
    }
    return json(res, 200, []);
  }

  void auth;
  return json(res, 404, { message: `unhandled storage route ${req.method} ${p}` });
}

/* ------------------------------------------------------------------ server */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      });
      return res.end();
    }
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/rest/v1')) return await handleRest(req, res, url);
    if (url.pathname.startsWith('/storage/v1')) return await handleStorage(req, res, url);
    if (url.pathname.startsWith('/object/')) {
      // signed URLs are returned relative to the storage root
      return await handleStorage(req, res, new URL(`/storage/v1${url.pathname}${url.search}`, `http://localhost:${PORT}`));
    }
    return json(res, 404, { message: `unhandled ${req.method} ${url.pathname}` });
  } catch (e) {
    console.error('[fake-supabase]', e);
    return json(res, 500, { message: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`[fake-supabase] listening on http://127.0.0.1:${PORT} (db ${DB}, storage ${STORAGE_DIR})`);
});
