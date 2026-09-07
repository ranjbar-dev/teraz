import { Prisma } from '@prisma/client';
import { db, Scope, moduleOf, masters, ApiError, normalize } from './core';
import { toGregorian, isValidJalaaliDate } from 'jalaali-js';
const sql = Prisma.sql;
function jalaliRange(input: string) {
  const match = /^(1[34]\d{2})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?$/.exec(normalize(input).trim());
  if (!match) return null;
  const y = Number(match[1]),
    m = Number(match[2] || 1),
    d = Number(match[3] || 1);
  if (!isValidJalaaliDate(y, m, d)) throw new ApiError('تاریخ جست‌وجو معتبر نیست.', 422);
  const iso = (y: number, m: number, d: number) => {
    const g = toGregorian(y, m, d);
    return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  };
  const start = iso(y, m, d);
  const end = match[3]
    ? new Date(new Date(start).getTime() + 86400000).toISOString().slice(0, 10)
    : match[2]
      ? iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1)
      : iso(y + 1, 1, 1);
  return { start, end };
}
// Only static SQL fragments are raw. All values and JSON field names are bound parameters.
export async function recordIds(s: Scope, key: string, q: Record<string, any>) {
  const mod = moduleOf(key);
  let filters: Record<string, unknown> = {};
  try {
    filters = q.filters ? JSON.parse(String(q.filters)) : {};
  } catch {
    throw new ApiError('ساختار فیلترها معتبر نیست.', 422);
  }
  if (
    !filters ||
    Array.isArray(filters) ||
    typeof filters !== 'object' ||
    Object.keys(filters).length > 60
  )
    throw new ApiError('فیلترها معتبر نیستند.', 422);
  const scalar: Record<string, Prisma.Sql> = {
    id: sql`r."id"::text`,
    code: sql`r."code"`,
    name: sql`r."name"`,
    status: sql`r."status"`,
    total: sql`r."total"::text`,
    date: sql`r."date"::date::text`,
    createdAt: sql`r."createdAt"::text`,
    paid: sql`coalesce((SELECT sum(a."amount") FROM "Allocation" a WHERE a."invoiceId"=r."id"::text AND a."companyId"=r."companyId" AND a."active"),0)::text`,
  };
  scalar.remaining = sql`(r."total" - (${scalar.paid})::numeric)::text`;
  scalar.balance = sql`coalesce((SELECT sum(l."foreignAmount") FROM "JournalLine" l WHERE l."bankId"=r."id"::text),0)::text`;
  scalar.bookValue = sql`(coalesce((r."data"->>'cost')::numeric,0)-coalesce((SELECT sum(d."total") FROM "Record" d WHERE d."companyId"=r."companyId" AND d."module"='depreciation' AND d."postedAt" IS NOT NULL AND d."reversedAt" IS NULL AND d."data"->>'assetId'=r."id"::text),0))::text`;
  const allowed = new Set([...Object.keys(scalar), ...mod.fields.map((f: any) => f.key)]);
  const expr = (field: string) => scalar[field] || sql`r."data"->>${field}`;
  const searchable = (field: string) => {
    const f = mod.fields.find((f: any) => f.key === field);
    return f?.ref
      ? sql`concat(${expr(field)},' ',(SELECT concat(t."name",' ',t."code") FROM "Record" t WHERE t."id"::text=(${expr(field)}) AND t."companyId"=r."companyId" LIMIT 1))`
      : expr(field);
  };
  const where: Prisma.Sql[] = [
    sql`r."organizationId"=${s.organizationId}::uuid`,
    sql`r."companyId"=${s.companyId}::uuid`,
    sql`r."module"=${key}`,
  ];
  if (!masters.has(key)) {
    if (s.yearId) where.push(sql`r."yearId"=${s.yearId}`);
    if (s.branchId !== 'all') where.push(sql`r."branchId"=${s.branchId}`);
  }
  const baseClause = Prisma.join([...where], ' AND ');
  if (q.status && q.status !== 'all') where.push(sql`r."status"=${String(q.status)}`);
  // strpos implements literal substring search, including % and _, without wildcard injection.
  for (const [field, value] of Object.entries(filters)) {
    if (!allowed.has(field)) throw new ApiError('ستون فیلتر معتبر نیست.', 422);
    if (value && typeof value !== 'string') throw new ApiError('مقدار فیلتر باید متن باشد.', 422);
    const range =
      value && (field === 'date' || mod.fields.find((f: any) => f.key === field)?.type === 'date')
        ? jalaliRange(String(value))
        : null;
    if (range) where.push(sql`${expr(field)} >= ${range.start} AND ${expr(field)} < ${range.end}`);
    else if (value)
      where.push(
        sql`strpos(taraz_normalize(${searchable(field)}),taraz_normalize(${String(value).slice(0, 300)}))>0`,
      );
  }
  if (q.q) {
    const refs = sql`coalesce((SELECT string_agg(concat(t."name",' ',t."code"),' ') FROM "RecordReference" x JOIN "Record" t ON t."id"=x."targetId" WHERE x."sourceId"=r."id" AND t."companyId"=r."companyId"),'')`;
    const alternatives = [
      sql`strpos(taraz_normalize(concat(r."code",' ',r."name",' ',r."status",' ',r."total",' ',r."date",' ',r."data"::text,' ',${refs})),taraz_normalize(${String(q.q).slice(0, 300)}))>0`,
    ];
    const range = jalaliRange(String(q.q));
    if (range)
      for (const field of [
        'date',
        ...mod.fields.filter((f: any) => f.type === 'date').map((f: any) => f.key),
      ])
        alternatives.push(
          sql`(${expr(field)} >= ${range.start} AND ${expr(field)} < ${range.end})`,
        );
    where.push(sql`(${Prisma.join(alternatives, ' OR ')})`);
  }
  const sortKey = String(q.sort || '').replace(/^-/, '');
  if (sortKey && !allowed.has(sortKey)) throw new ApiError('ستون مرتب‌سازی معتبر نیست.', 422);
  const numeric =
    ['total', 'paid', 'remaining', 'balance', 'bookValue'].includes(sortKey) ||
    ['money', 'number'].includes(mod.fields.find((f: any) => f.key === sortKey)?.type || '');
  const order = sortKey
    ? sql`${numeric ? sql`NULLIF((${expr(sortKey)}),'')::numeric` : searchable(sortKey)} ${String(q.sort).startsWith('-') ? Prisma.raw('DESC') : Prisma.raw('ASC')} NULLS LAST, r."id" DESC`
    : sql`r."createdAt" DESC, r."id" DESC`;
  const page = Math.max(1, Math.min(1000000, Math.floor(Number(q.page) || 1))),
    limit = Math.max(1, Math.min(100, Math.floor(Number(q.limit) || 25)));
  const clause = Prisma.join(where, ' AND ');
  return db.$transaction(
    async (tx) => {
      const count = await tx.$queryRaw<{ total: bigint }[]>(
        sql`SELECT count(*) AS total FROM "Record" r WHERE ${clause}`,
      );
      const rows = await tx.$queryRaw<{ id: string }[]>(
        sql`SELECT r."id" FROM "Record" r WHERE ${clause} ORDER BY ${order} ${q.limit ? sql`LIMIT ${limit} OFFSET ${(page - 1) * limit}` : Prisma.empty}`,
      );
      const sumKey =
        mod.kind || ['payroll', 'depreciation'].includes(key)
          ? 'total'
          : key === 'banks'
            ? 'balance'
            : key === 'projects'
              ? 'budget'
              : key === 'assets'
                ? 'cost'
                : 'amount';
      const stats = await tx.$queryRaw<{ status: string; count: bigint; total: string }[]>(
        sql`SELECT r."status", count(*) AS count, sum(coalesce(NULLIF((${expr(sumKey)}),''),'0')::numeric * coalesce(NULLIF(r."data"->>'exchangeRate',''),'1')::numeric)::text AS total FROM "Record" r WHERE ${baseClause} GROUP BY r."status"`,
      );
      return {
        ids: rows.map((r) => r.id),
        totalCount: Number(count[0].total),
        page,
        limit,
        summary: stats.map((r) => ({ ...r, count: Number(r.count) })),
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
