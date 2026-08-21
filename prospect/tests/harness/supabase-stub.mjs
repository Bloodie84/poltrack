/**
 * Banc d'essai : expose la VRAIE base PostgreSQL via le sous-ensemble de l'API
 * Supabase que l'application utilise (PostgREST + `/auth/v1/user`).
 *
 * Il ne remplace pas Supabase et n'est jamais utilisé en production : il sert
 * uniquement aux tests de bout en bout, là où aucun projet Supabase n'est
 * joignable. Le SQL exécuté, les fonctions et la sécurité au niveau des lignes
 * sont ceux du produit — chaque requête est jouée sous le rôle `authenticated`
 * avec le claim JWT de l'utilisateur de test.
 */
import { createServer } from 'node:http';
import pg from 'pg';

// PostgREST sérialise numeric et bigint en nombres JSON ; node-postgres les
// rend en chaînes par défaut. On aligne le banc d'essai sur le vrai service.
pg.types.setTypeParser(1700, (value) => Number(value)); // numeric
pg.types.setTypeParser(20, (value) => Number(value)); // int8

const FILTERS = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(name) {
  if (!IDENTIFIER.test(name)) throw new Error(`Identifiant refusé : ${name}`);
  return name;
}

function json(response, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  response.end(payload);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function startSupabaseStub({ databaseUrl, userId, email, port }) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });

  /** Types des colonnes, pour caster les paramètres comme le ferait PostgREST. */
  const columnTypes = new Map();
  async function typeOf(relation, column) {
    const key = `${relation}.${column}`;
    if (columnTypes.has(key)) return columnTypes.get(key);

    const { rows } = await pool.query(
      `select udt_name from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [relation, column],
    );
    const type = rows[0]?.udt_name ?? 'text';
    columnTypes.set(key, type);
    return type;
  }

  /** Signatures des fonctions, pour caster les arguments nommés. */
  const functionArgs = new Map();
  async function argumentsOf(name) {
    if (functionArgs.has(name)) return functionArgs.get(name);

    const { rows } = await pool.query(
      `select pg_get_function_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1
        limit 1`,
      [name],
    );
    if (!rows[0]) throw new Error(`Fonction inconnue : ${name}`);

    const map = new Map();
    for (const part of rows[0].args.split(',')) {
      const cleaned = part.trim().replace(/\s+DEFAULT\s+.*$/i, '');
      const [argName, ...typeParts] = cleaned.split(/\s+/);
      if (argName) map.set(argName, typeParts.join(' '));
    }

    functionArgs.set(name, map);
    return map;
  }

  /** Exécute une requête sous l'identité de l'utilisateur de test. */
  async function asUser(run) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await client.query('set local role authenticated');
      const result = await run(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function buildWhere(relation, searchParams, params) {
    const clauses = [];
    for (const [key, raw] of searchParams) {
      if (RESERVED.has(key)) continue;
      const column = assertIdentifier(key);
      const separator = raw.indexOf('.');
      const operator = separator === -1 ? 'eq' : raw.slice(0, separator);
      const value = separator === -1 ? raw : raw.slice(separator + 1);

      if (operator === 'is') {
        clauses.push(`${column} is ${value === 'null' ? 'null' : value === 'true'}`);
        continue;
      }

      const sqlOperator = FILTERS[operator];
      if (!sqlOperator) throw new Error(`Filtre non géré : ${operator}`);

      params.push(value);
      clauses.push(`${column} ${sqlOperator} $${params.length}::${await typeOf(relation, column)}`);
    }
    return clauses.length ? `where ${clauses.join(' and ')}` : '';
  }

  function buildOrder(searchParams) {
    const order = searchParams.get('order');
    if (!order) return '';
    const parts = order.split(',').map((entry) => {
      const [column, ...modifiers] = entry.split('.');
      const direction = modifiers.includes('desc') ? 'desc' : 'asc';
      const nulls = modifiers.includes('nullslast') ? ' nulls last' : '';
      return `${assertIdentifier(column)} ${direction}${nulls}`;
    });
    return `order by ${parts.join(', ')}`;
  }

  function pagination(request, searchParams) {
    let limit = searchParams.get('limit');
    let offset = searchParams.get('offset') ?? '0';

    const range = request.headers['range'];
    if (range && /^\d+-\d*$/.test(range)) {
      const [from, to] = range.split('-');
      offset = from;
      if (to) limit = String(Number(to) - Number(from) + 1);
    }

    const clauses = [];
    if (limit) clauses.push(`limit ${Number(limit)}`);
    if (Number(offset) > 0) clauses.push(`offset ${Number(offset)}`);
    return clauses.join(' ');
  }

  function wantsSingleObject(request) {
    return String(request.headers.accept ?? '').includes('vnd.pgrst.object+json');
  }

  function respondRows(request, response, rows) {
    if (!wantsSingleObject(request)) return json(response, 200, rows);
    if (rows.length === 1) return json(response, 200, rows[0]);
    return json(response, 406, {
      code: 'PGRST116',
      message: `JSON object requested, ${rows.length} rows returned`,
      details: null,
      hint: null,
    });
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);

      if (request.method === 'OPTIONS') return json(response, 204);

      if (url.pathname === '/auth/v1/user') {
        return json(response, 200, {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email,
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date(0).toISOString(),
        });
      }

      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = assertIdentifier(url.pathname.slice('/rest/v1/rpc/'.length));
        const body = (await readBody(request)) ?? {};
        const signature = await argumentsOf(name);

        const params = [];
        const args = Object.entries(body).map(([key, value]) => {
          const argName = assertIdentifier(key);
          const type = signature.get(argName);
          if (!type) throw new Error(`Argument inconnu : ${name}(${argName})`);
          params.push(type.includes('json') ? JSON.stringify(value) : value);
          return `${argName} => $${params.length}::${type}`;
        });

        const rows = await asUser((client) =>
          client
            .query(`select public.${name}(${args.join(', ')}) as result`, params)
            .then((result) => result.rows),
        );

        return json(response, 200, rows[0]?.result ?? null);
      }

      if (url.pathname.startsWith('/rest/v1/')) {
        const relation = assertIdentifier(url.pathname.slice('/rest/v1/'.length));

        if (request.method === 'GET') {
          const params = [];
          const where = await buildWhere(relation, url.searchParams, params);
          const sql = [
            `select * from public.${relation}`,
            where,
            buildOrder(url.searchParams),
            pagination(request, url.searchParams),
          ]
            .filter(Boolean)
            .join(' ');

          const rows = await asUser((client) =>
            client.query(sql, params).then((result) => result.rows),
          );
          return respondRows(request, response, rows);
        }

        if (request.method === 'POST') {
          const body = await readBody(request);
          const records = Array.isArray(body) ? body : [body];
          const columns = Object.keys(records[0]).map(assertIdentifier);
          const params = [];
          const values = records
            .map(
              (record) =>
                `(${columns
                  .map((column) => {
                    params.push(record[column]);
                    return `$${params.length}`;
                  })
                  .join(', ')})`,
            )
            .join(', ');

          const rows = await asUser((client) =>
            client
              .query(
                `insert into public.${relation} (${columns.join(', ')}) values ${values} returning *`,
                params,
              )
              .then((result) => result.rows),
          );
          return respondRows(request, response, rows);
        }

        if (request.method === 'PATCH') {
          const body = await readBody(request);
          const params = [];
          const assignments = Object.entries(body).map(([key, value]) => {
            params.push(value);
            return `${assertIdentifier(key)} = $${params.length}`;
          });
          const where = await buildWhere(relation, url.searchParams, params);

          const rows = await asUser((client) =>
            client
              .query(
                `update public.${relation} set ${assignments.join(', ')} ${where} returning *`,
                params,
              )
              .then((result) => result.rows),
          );
          return respondRows(request, response, rows);
        }
      }

      return json(response, 404, { message: `Route non gérée : ${request.method} ${url.pathname}` });
    } catch (error) {
      return json(response, 400, {
        code: error.code ?? 'STUB',
        message: error.message,
        details: null,
        hint: null,
      });
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}
