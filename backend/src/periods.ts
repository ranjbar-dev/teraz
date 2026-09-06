import { randomUUID } from 'node:crypto';
import {
  db,
  D,
  money,
  Principal,
  Scope,
  ApiError,
  requirePermission,
  requireSubscription,
  transaction,
  validDate,
  audit,
  json,
  masters,
} from './core';
import { AccountingService } from './accounting';
export class PeriodService {
  async close(p: Principal, s: Scope, input: any) {
    requirePermission(p, 'fiscal-years.write');
    return transaction(`org:${s.organizationId}`, async (tx) => {
      await requireSubscription(tx, p);
      const year = await tx.record.findFirst({
        where: { id: s.yearId, companyId: s.companyId, module: 'fiscal-years' },
      });
      if (!year) throw new ApiError('سال مالی یافت نشد.', 404);
      if (year.status === 'بسته') return { ok: true, alreadyClosed: true };
      const data = year.data as any;
      const draftCount = await tx.record.count({
        where: {
          companyId: s.companyId,
          yearId: year.id,
          module: { notIn: [...masters, 'quotes', 'checks'] },
          postedAt: null,
          status: { notIn: ['لغو شده'] },
        },
      });
      if (draftCount)
        throw new ApiError(
          `${draftCount} سند پیش‌نویس باقی مانده است؛ ابتدا تعیین تکلیف کنید.`,
          409,
          'DRAFTS_EXIST',
        );
      const prior = await tx.record.findFirst({
        where: {
          companyId: s.companyId,
          module: 'fiscal-years',
          status: 'باز',
          date: { lt: year.date! },
        },
      });
      if (prior) throw new ApiError('ابتدا سال مالی قبلی را ببندید.', 409);
      const nextStart = new Date(validDate(data.endDate).getTime() + 86400000);
      let next = await tx.record.findFirst({
        where: { companyId: s.companyId, module: 'fiscal-years', date: nextStart },
      });
      if (!next) {
        const nextEnd = validDate(input.nextEndDate);
        if (nextEnd <= nextStart) throw new ApiError('پایان سال مالی بعد را وارد کنید.', 422);
        const overlap = await tx.record.findMany({
          where: { companyId: s.companyId, module: 'fiscal-years' },
        });
        if (
          overlap.some(
            (y) =>
              (y.data as any).startDate <= nextEnd.toISOString().slice(0, 10) &&
              (y.data as any).endDate >= nextStart.toISOString().slice(0, 10),
          )
        )
          throw new ApiError('دورهٔ بعد با سال موجود هم‌پوشانی دارد.', 422);
        next = await tx.record.create({
          data: {
            organizationId: s.organizationId,
            companyId: s.companyId,
            module: 'fiscal-years',
            code: String(input.nextCode || nextStart.getUTCFullYear()),
            name: String(input.nextName || 'سال مالی بعد'),
            status: 'باز',
            date: nextStart,
            data: {
              startDate: nextStart.toISOString().slice(0, 10),
              endDate: nextEnd.toISOString().slice(0, 10),
            },
          },
        });
      }
      const lines = await tx.journalLine.findMany({
        where: {
          accountType: { in: ['درآمد', 'هزینه'] },
          journal: { companyId: s.companyId, yearId: year.id },
        },
        include: { journal: true },
      });
      const groups = new Map<
        string,
        { branchId: string; accountId: string; balance: ReturnType<typeof D> }
      >();
      for (const l of lines) {
        const key = l.journal.branchId + ':' + l.accountId;
        const a = groups.get(key) || {
          branchId: l.journal.branchId,
          accountId: l.accountId,
          balance: D(0),
        };
        a.balance = a.balance.add(D(l.debit)).sub(D(l.credit));
        groups.set(key, a);
      }
      const accounting = new AccountingService();
      for (const branch of new Set([...groups.values()].map((g) => g.branchId))) {
        const selected = [...groups.values()].filter((g) => g.branchId === branch);
        const balance = selected.reduce((a, g) => a.add(g.balance), D(0));
        const entries: any[] = selected.map((g) => ({
          accountId: g.accountId,
          debit: g.balance.lt(0) ? g.balance.neg().toString() : 0,
          credit: g.balance.gt(0) ? g.balance.toString() : 0,
        }));
        entries.push({
          system: 'retained',
          debit: balance.gt(0) ? balance.toString() : 0,
          credit: balance.lt(0) ? balance.neg().toString() : 0,
        });
        await accounting.journal(
          tx,
          p,
          s,
          {
            id: year.id,
            module: 'fiscal-years',
            code: `بستن ${year.code}`,
            date: validDate(data.endDate),
            yearId: year.id,
            branchId: branch,
          },
          entries,
          `close:${branch}`,
        );
      }
      await tx.record.update({
        where: { id: year.id },
        data: {
          status: 'بسته',
          version: { increment: 1 },
          data: json({ ...data, closedAt: new Date(), closedBy: p.userId, nextYearId: next.id }),
        },
      });
      await audit(
        tx,
        p,
        'fiscal-years.close',
        'حساب‌های موقت بسته و سال مالی قفل شد؛ ماندهٔ حساب‌های دائمی به‌صورت تجمعی منتقل می‌شود.',
        s.companyId,
        year.id,
      );
      return { ok: true, nextYearId: next.id };
    });
  }
}
