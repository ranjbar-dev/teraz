import { toJalaali, toGregorian } from 'jalaali-js';
import {
  db,
  D,
  money,
  ApiError,
  Principal,
  Scope,
  requirePermission,
  serializeRecord,
  recordWhere,
  validDate,
} from './core';
const sum = (rows: any[], key: string) => rows.reduce((s, r) => s.add(D(r[key])), D(0));
export class ReportsService {
  async entries(s: Scope, q: any = {}, cumulative = false) {
    const year = s.yearId ? await db.record.findUnique({ where: { id: s.yearId } }) : null;
    const from = q.from || (!cumulative ? (year?.data as any)?.startDate : undefined),
      to = q.to || (year?.data as any)?.endDate;
    if (from && to && from > to) throw new ApiError('بازهٔ تاریخ معتبر نیست.', 422);
    const rows = await db.journalLine.findMany({
      where: {
        journal: {
          companyId: s.companyId,
          organizationId: s.organizationId,
          ...(s.branchId !== 'all' ? { branchId: s.branchId } : {}),
          date: {
            ...(from ? { gte: validDate(from) } : {}),
            ...(to ? { lte: validDate(to) } : {}),
          },
        },
      },
      include: { journal: true },
      orderBy: [{ journal: { date: 'asc' } }, { journal: { number: 'asc' } }, { id: 'asc' }],
    });
    return rows.map((l) => ({
      ...l,
      code: String(l.journal.number),
      date: l.journal.date.toISOString().slice(0, 10),
      account: l.accountName,
      debit: money(l.debit),
      credit: money(l.credit),
      description: l.description || l.journal.description,
      sourceId: l.journal.sourceId,
      sourceModule: l.journal.sourceModule,
    }));
  }
  async inventory(s: Scope, to?: string) {
    const year = s.yearId ? await db.record.findUnique({ where: { id: s.yearId } }) : null;
    to = to || (year?.data as any)?.endDate;
    const movements = await db.stockMovement.groupBy({
      by: ['productId', 'warehouseId'],
      where: {
        companyId: s.companyId,
        ...(s.branchId !== 'all' ? { branchId: s.branchId } : {}),
        ...(to ? { date: { lte: validDate(to) } } : {}),
      },
      _sum: { quantity: true, value: true },
    });
    const records = await db.record.findMany({
      where: { companyId: s.companyId, module: { in: ['products', 'warehouses'] } },
    });
    const lookup = new Map(records.map((r) => [r.id, r]));
    return movements.map((m) => {
      const p = lookup.get(m.productId),
        w = lookup.get(m.warehouseId),
        d = p?.data as any;
      return {
        id: `${m.productId}:${m.warehouseId}`,
        productId: m.productId,
        warehouseId: m.warehouseId,
        code: p?.code || '',
        name: p?.name || '',
        warehouse: w?.name || '',
        quantity: money(m._sum.quantity || 0),
        value: money(m._sum.value || 0),
        unit: d?.unit || '',
        minStock: d?.minStock || 0,
      };
    });
  }
  async report(p: Principal, s: Scope, key: string, q: any = {}) {
    requirePermission(p, 'reports.read');
    const all = (await this.entries(s, q, ['balance-sheet', 'receivables'].includes(key))).filter(
      (e) => key !== 'profit-loss' || e.sourceModule !== 'fiscal-years',
    );
    const accounts = await db.record.findMany({
      where: { companyId: s.companyId, module: 'accounts' },
      orderBy: { code: 'asc' },
    });
    const balances = accounts.map((a) => {
      const es = all.filter((e) => e.accountId === a.id),
        debit = sum(es, 'debit'),
        credit = sum(es, 'credit');
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: (a.data as any).type,
        debit: money(debit),
        credit: money(credit),
        balance: money(debit.sub(credit)),
      };
    });
    const type = (t: string) =>
      sum(
        balances.filter((a) => a.type === t),
        'balance',
      );
    const profit = type('درآمد').neg().sub(type('هزینه'));
    const summary = (label: string, value: any, unit?: string) => ({
      label,
      value: money(value),
      ...(unit ? { unit } : {}),
    });
    if (key === 'profit-loss')
      return {
        rows: balances
          .filter((a) => ['درآمد', 'هزینه'].includes(a.type))
          .map((a) => ({ ...a, amount: money(D(a.balance).mul(a.type === 'درآمد' ? -1 : 1)) })),
        summary: [
          summary('کل درآمد', type('درآمد').neg()),
          summary('کل هزینه', type('هزینه')),
          summary('سود خالص', profit),
        ],
      };
    if (key === 'balance-sheet')
      return {
        rows: [
          ...balances
            .filter((a) => ['دارایی', 'بدهی', 'سرمایه'].includes(a.type))
            .map((a) => ({ ...a, amount: money(D(a.balance).mul(a.type === 'دارایی' ? 1 : -1)) })),
          {
            id: 'profit',
            code: '—',
            name: 'سود (زیان) انباشتهٔ بسته‌نشده',
            type: 'سرمایه',
            amount: money(profit),
          },
        ],
        summary: [
          summary('دارایی‌ها', type('دارایی')),
          summary('بدهی‌ها', type('بدهی').neg()),
          summary('حقوق مالکانه', type('سرمایه').neg().add(profit)),
          summary('اختلاف تراز', type('دارایی').add(type('بدهی')).add(type('سرمایه')).sub(profit)),
        ],
      };
    if (key === 'trial-balance')
      return {
        rows: balances.map((a) => ({
          ...a,
          debitBalance: money(D(a.balance).gt(0) ? a.balance : 0),
          creditBalance: money(D(a.balance).lt(0) ? D(a.balance).neg() : 0),
        })),
        summary: [
          summary('جمع بدهکار', sum(all, 'debit')),
          summary('جمع بستانکار', sum(all, 'credit')),
          summary('اختلاف', sum(all, 'debit').sub(sum(all, 'credit'))),
        ],
      };
    if (['journal', 'ledger', 'cashflow'].includes(key)) {
      let running = D(0);
      if (key === 'ledger' && q.accountId && !accounts.some((a) => a.id === q.accountId))
        throw new ApiError('حساب معتبر نیست.', 422);
      const selected = all.filter(
        (e) =>
          (key !== 'ledger' || !q.accountId || e.accountId === q.accountId) &&
          (key !== 'cashflow' || e.bankId),
      );
      if (key === 'ledger') {
        const year = await db.record.findUnique({ where: { id: s.yearId } });
        const from = q.from || (year?.data as any)?.startDate;
        if (from) {
          const before = new Date(validDate(from).getTime() - 86400000).toISOString().slice(0, 10);
          const opening = (await this.entries(s, { to: before }, true)).filter(
            (e) => !q.accountId || e.accountId === q.accountId,
          );
          running = sum(opening, 'debit').sub(sum(opening, 'credit'));
        }
      }
      const opening = running;
      const rows = selected.map((e) => {
        const amount = D(e.debit).sub(D(e.credit));
        running = running.add(amount);
        return { ...e, journal: undefined, balance: money(running), amount: money(amount) };
      });
      return {
        rows,
        opening: money(opening),
        summary: [
          summary('گردش بدهکار', sum(rows, 'debit')),
          summary('گردش بستانکار', sum(rows, 'credit')),
          summary(key === 'ledger' ? 'مانده پایانی' : 'خالص گردش', running),
        ],
      };
    }
    if (key === 'receivables') {
      const people = await db.record.findMany({
        where: { companyId: s.companyId, module: 'people' },
      });
      const rows = people.map((p) => {
        const es = all.filter(
            (e) => e.personId === p.id && ['1200', '2100', '1600', '2400'].includes(e.accountCode),
          ),
          balance = sum(es, 'debit').sub(sum(es, 'credit'));
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          phone: (p.data as any).phone,
          debit: money(balance.gt(0) ? balance : 0),
          credit: money(balance.lt(0) ? balance.neg() : 0),
          balance: money(balance),
        };
      });
      return {
        rows,
        summary: [
          summary('مانده بدهکاران', sum(rows, 'debit')),
          summary('مانده بستانکاران', sum(rows, 'credit')),
        ],
      };
    }
    if (key === 'inventory') {
      const rows = await this.inventory(s, q.to);
      return {
        rows,
        summary: [
          summary('ارزش موجودی', sum(rows, 'value')),
          summary('تعداد کالا', new Set(rows.map((r) => r.productId)).size, 'کالا'),
          summary(
            'نیازمند تأمین',
            rows.filter((r) => D(r.quantity).lt(D(r.minStock))).length,
            'مورد',
          ),
        ],
      };
    }
    if (key === 'tax') {
      const relevant = all.filter((l) =>
        ['sales', 'purchases', 'sales-returns', 'purchase-returns'].includes(l.sourceModule),
      );
      const records = await db.record.findMany({
        where: {
          companyId: s.companyId,
          id: { in: [...new Set(relevant.map((l) => l.sourceId))] },
        },
      });
      const journals = [...new Map(relevant.map((l) => [l.journal.id, l.journal])).values()];
      const rows = journals.map((j) => {
        const r = records.find((r) => r.id === j.sourceId)!;
        const d = r.data as any;
        const taxLines = all.filter(
          (l) => l.journalId === j.id && ['1500', '2200'].includes(l.accountCode),
        );
        const side = r.module.startsWith('sale') ? 1 : -1;
        const tax = sum(taxLines, 'credit').sub(sum(taxLines, 'debit')).mul(side);
        return {
          id: j.id,
          code: r.code + (j.reversalOfId ? ' · برگشتی' : ''),
          date: j.date.toISOString().slice(0, 10),
          name: d.partySnapshot?.name || '',
          type: {
            sales: 'فروش',
            purchases: 'خرید',
            'sales-returns': 'برگشت از فروش',
            'purchase-returns': 'برگشت از خرید',
          }[r.module],
          amount: money(
            D(d.totals?.net || 0)
              .mul(D(d.exchangeRate || 1))
              .mul(j.reversalOfId ? -1 : 1)
              .mul(r.module.endsWith('returns') ? -1 : 1),
          ),
          tax: money(tax),
          side,
        };
      });
      return {
        rows,
        summary: [
          summary(
            'مالیات فروش',
            sum(
              rows.filter((r) => r.side === 1),
              'tax',
            ),
          ),
          summary(
            'اعتبار مالیات خرید',
            sum(
              rows.filter((r) => r.side === -1),
              'tax',
            ),
          ),
          summary(
            'خالص مالیات',
            rows.reduce((s, r) => s.add(D(r.tax).mul(r.side)), D(0)),
          ),
        ],
      };
    }
    if (key === 'project-profit') {
      const projects = await db.record.findMany({
        where: { companyId: s.companyId, module: 'projects' },
      });
      const rows = projects.map((r) => {
        const es = all.filter((e) => e.projectId === r.id),
          expenses = es.filter((e) => e.accountType === 'هزینه'),
          income = es.filter((e) => e.accountType === 'درآمد'),
          cost = sum(expenses, 'debit').sub(sum(expenses, 'credit')),
          revenue = sum(income, 'credit').sub(sum(income, 'debit')),
          d = r.data as any;
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          budget: d.budget || '0',
          progress: d.progress || '0',
          cost: money(cost),
          income: money(revenue),
          profit: money(revenue.sub(cost)),
          remaining: money(D(d.budget || 0).sub(cost)),
        };
      });
      return {
        rows,
        summary: [
          summary('بودجه کل', sum(rows, 'budget')),
          summary('هزینه انجام‌شده', sum(rows, 'cost')),
          summary('سود پروژه‌ها', sum(rows, 'profit')),
        ],
      };
    }
    throw new ApiError('گزارش یافت نشد.', 404);
  }
  async dashboard(p: Principal, s: Scope, months = 6) {
    const [all, year, banks, sales, checks, inventory, receivables, activities] = await Promise.all(
      [
        this.entries(s).then((rows) => rows.filter((l) => l.sourceModule !== 'fiscal-years')),
        db.record.findUnique({ where: { id: s.yearId } }),
        db.record.findMany({ where: { companyId: s.companyId, module: 'banks' } }),
        db.record.findMany({ where: recordWhere(s, 'sales'), orderBy: { date: 'desc' }, take: 6 }),
        db.record.findMany({
          where: { ...recordWhere(s, 'checks'), status: 'در جریان' },
          orderBy: { date: 'asc' },
        }),
        this.inventory(s),
        this.report(p, s, 'receivables'),
        db.auditEvent.findMany({
          where: { companyId: s.companyId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ],
    );
    const start = (year?.data as any)?.startDate,
      end = (year?.data as any)?.endDate,
      jy = toJalaali(new Date((start || new Date().toISOString().slice(0, 10)) + 'T12:00:00')).jy;
    const iso = (y: number, m: number) => {
      const g = toGregorian(y, m, 1);
      return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
    };
    const chart = Array.from({ length: months === 12 ? 12 : 6 }, (_, i) => {
      const from = iso(jy, i + 1),
        to = i === 11 ? iso(jy + 1, 1) : iso(jy, i + 2),
        es = all.filter((e) => e.date >= from && e.date < to),
        revenue = es.filter((e) => e.accountType === 'درآمد'),
        expense = es.filter((e) => e.accountType === 'هزینه');
      return {
        month: from,
        income: Number(sum(revenue, 'credit').sub(sum(revenue, 'debit'))),
        expense: Number(sum(expense, 'debit').sub(sum(expense, 'credit'))),
      };
    });
    const bankRows = await Promise.all(
      banks.map(async (b) => {
        const ls = await db.journalLine.findMany({
          where: {
            bankId: b.id,
            journal: { companyId: s.companyId, ...(end ? { date: { lte: validDate(end) } } : {}) },
          },
        });
        return {
          id: b.id,
          name: b.name,
          ...(b.data as any),
          balance: money(sum(ls, 'foreignAmount')),
        };
      }),
    );
    const categories = [
      ...new Set(all.filter((l) => l.accountType === 'هزینه').map((l) => l.accountId)),
    ].map((id) => {
      const es = all.filter((l) => l.accountId === id);
      return { name: es[0].accountName, value: Number(sum(es, 'debit').sub(sum(es, 'credit'))) };
    });
    const people = await db.record.findMany({
      where: { companyId: s.companyId, module: 'people' },
    });
    const cash = await this.entries(s, {}, true);
    return {
      sales: money(
        sum(
          all.filter((l) => l.accountCode === '4100'),
          'credit',
        ).sub(
          sum(
            all.filter((l) => l.accountCode === '4100'),
            'debit',
          ),
        ),
      ),
      balance: money(
        sum(
          cash.filter((l) => l.bankId),
          'debit',
        ).sub(
          sum(
            cash.filter((l) => l.bankId),
            'credit',
          ),
        ),
      ),
      profit: money(
        sum(
          all.filter((l) => l.accountType === 'درآمد'),
          'credit',
        )
          .sub(
            sum(
              all.filter((l) => l.accountType === 'درآمد'),
              'debit',
            ),
          )
          .sub(
            sum(
              all.filter((l) => l.accountType === 'هزینه'),
              'debit',
            ),
          )
          .add(
            sum(
              all.filter((l) => l.accountType === 'هزینه'),
              'credit',
            ),
          ),
      ),
      receivables: receivables.summary[0].value,
      payables: receivables.summary[1].value,
      chart,
      banks: bankRows,
      recent: sales.map((r) => ({
        ...serializeRecord(r),
        person: people.find((p) => p.id === (r.data as any).personId)?.name || '',
      })),
      categories,
      checks: checks.map(serializeRecord),
      lowStock: inventory.filter((r) => D(r.quantity).lt(D(r.minStock))),
      activities: activities.map((a) => ({
        ...a,
        date: a.createdAt.toISOString(),
        user: a.userName,
      })),
      start,
      end,
    };
  }
}
