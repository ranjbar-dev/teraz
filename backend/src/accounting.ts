import Decimal from 'decimal.js';
import { PayrollService } from './payroll';
import { D, money, json, Tx, Scope, Principal, ApiError, validDate, audit } from './core';
type Entry = {
  system?: string;
  accountId?: string;
  debit: Decimal.Value;
  credit: Decimal.Value;
  personId?: string;
  projectId?: string;
  bankId?: string;
  description?: string;
  currency?: string;
  foreignAmount?: Decimal.Value;
  exchangeRate?: Decimal.Value;
};
export function invoiceTotal(data: any, lines: any[]) {
  const rows = lines.map((l) => {
    const gross = D(l.quantity).mul(D(l.price));
    const net = gross.mul(D(1).sub(D(l.discount).div(100)));
    return { gross, net, taxRate: D(l.tax) };
  });
  const afterLine = rows.reduce((s, l) => s.add(l.net), D(0)),
    header = D(data.discount || 0);
  if (header.lt(0) || header.gt(afterLine))
    throw new ApiError('تخفیف کل از مبلغ اقلام بیشتر است.', 422, 'INVALID_DISCOUNT');
  const net = afterLine.sub(header);
  const adjusted = rows.map((r) =>
    r.net.sub(afterLine.isZero() ? 0 : header.mul(r.net).div(afterLine)).toDecimalPlaces(6),
  );
  if (adjusted.length)
    adjusted[adjusted.length - 1] = adjusted
      .at(-1)!
      .add(net.sub(adjusted.reduce((s, v) => s.add(v), D(0))));
  const taxes = adjusted.map((v, i) => v.mul(rows[i].taxRate).div(100).toDecimalPlaces(6));
  const subtotal = rows.reduce((s, l) => s.add(l.gross), D(0)),
    tax = taxes.reduce((s, v) => s.add(v), D(0));
  return {
    subtotal,
    discount: subtotal.sub(net),
    net,
    tax,
    total: net.add(tax),
    lineNet: adjusted,
    lineTax: taxes,
  };
}
export async function openYear(tx: Tx, s: Scope, date: Date) {
  const y = await tx.record.findFirst({
    where: { id: s.yearId, companyId: s.companyId, module: 'fiscal-years' },
  });
  if (!y || y.status !== 'باز')
    throw new ApiError('سال مالی بسته یا نامعتبر است.', 422, 'PERIOD_CLOSED');
  const yd = y.data as any;
  if (date < validDate(yd.startDate) || date > validDate(yd.endDate))
    throw new ApiError('تاریخ سند خارج از سال مالی است.', 422, 'DATE_OUT_OF_PERIOD');
  return y;
}
export class AccountingService {
  async journal(
    tx: Tx,
    p: Principal,
    s: Scope,
    record: any,
    entries: Entry[],
    suffix = 'post',
    reversalOfId?: string,
  ) {
    const nonzero = entries.filter((e) => !D(e.debit).isZero() || !D(e.credit).isZero());
    if (!nonzero.length) return null;
    const debit = nonzero.reduce((v, l) => v.add(D(l.debit).toDecimalPlaces(6)), D(0));
    const credit = nonzero.reduce((v, l) => v.add(D(l.credit).toDecimalPlaces(6)), D(0));
    if (!debit.eq(credit))
      throw new ApiError(
        `سند متوازن نیست؛ اختلاف ${debit.sub(credit)}.`,
        422,
        'UNBALANCED_JOURNAL',
      );
    const accounts = await tx.record.findMany({
      where: { companyId: s.companyId, module: 'accounts' },
    });
    const company = await tx.company.findUniqueOrThrow({ where: { id: s.companyId } });
    const lines = nonzero.map((e) => {
      if (D(e.debit).lt(0) || D(e.credit).lt(0) || (D(e.debit).gt(0) && D(e.credit).gt(0)))
        throw new ApiError('هر آرتیکل فقط یک سمت مثبت دارد.', 422, 'INVALID_ARTICLE');
      const a = accounts.find((a) =>
        e.accountId ? a.id === e.accountId : (a.data as any).system === e.system,
      );
      if (!a || (a.status !== 'فعال' && !reversalOfId && record.module !== 'fiscal-years'))
        throw new ApiError('حساب فعال برای ثبت سند یافت نشد.', 422, 'ACCOUNT_REQUIRED');
      return {
        accountId: a.id,
        accountCode: a.code,
        accountName: a.name,
        accountType: String((a.data as any).type),
        description: e.description || record.name || record.code,
        debit: money(e.debit),
        credit: money(e.credit),
        personId: e.personId,
        projectId: e.projectId,
        bankId: e.bankId,
        currency: e.currency || company.baseCurrency,
        foreignAmount: money(e.foreignAmount ?? D(e.debit).sub(e.credit)),
        exchangeRate: D(e.exchangeRate ?? 1).toFixed(10),
      };
    });
    const latest = await tx.journal.aggregate({
      where: { companyId: s.companyId },
      _max: { number: true },
    });
    const created = await tx.journal.create({
      data: {
        organizationId: s.organizationId,
        companyId: s.companyId,
        sourceId: record.id,
        sourceModule: record.module,
        sourceKey: `${record.id}:${suffix}`,
        number: (latest._max.number || 0) + 1,
        branchId: record.branchId || s.branchId,
        yearId: record.yearId || s.yearId,
        date: record.date,
        description: record.name || record.code,
        createdBy: p.userId,
        reversalOfId,
        lines: { create: lines },
      },
    });
    return tx.journal.update({ where: { id: created.id }, data: { sealed: true } });
  }
  async stock(
    tx: Tx,
    s: Scope,
    record: any,
    warehouseId: string,
    productId: string,
    quantity: Decimal,
    unitCost?: Decimal,
    reversalOfId?: string,
  ) {
    const product = await tx.record.findFirst({
      where: { id: productId, companyId: s.companyId, module: 'products' },
    });
    if (!product) throw new ApiError('کالا یافت نشد.', 422);
    if ((product.data as any).type === 'خدمت') return D(0);
    const warehouse = await tx.record.findFirst({
      where: { id: warehouseId, companyId: s.companyId, module: 'warehouses' },
    });
    if (!warehouse || warehouse.status !== 'فعال')
      throw new ApiError('انبار فعال معتبر نیست.', 422);
    const where = {
      companyId_warehouseId_productId: { companyId: s.companyId, warehouseId, productId },
    };
    const balance = await tx.inventoryBalance.findUnique({ where });
    if (balance?.lastDate && record.date < balance.lastDate)
      throw new ApiError(
        'ثبت موجودی با تاریخ قبل از آخرین گردش مجاز نیست؛ تاریخ سند را اصلاح کنید.',
        422,
        'BACKDATED_STOCK',
      );
    const oldQty = D(balance?.quantity || 0),
      oldValue = D(balance?.value || 0);
    if (oldQty.add(quantity).lt(0))
      throw new ApiError(
        `موجودی ${product.name} کافی نیست؛ موجودی قابل مصرف ${oldQty}.`,
        422,
        'INSUFFICIENT_STOCK',
      );
    const value = quantity.isNegative()
      ? oldQty.isZero()
        ? D(0)
        : oldValue.mul(quantity).div(oldQty).toDecimalPlaces(6)
      : quantity.mul(unitCost || D(0)).toDecimalPlaces(6);
    const nextQty = oldQty.add(quantity),
      nextValue = nextQty.isZero() ? D(0) : oldValue.add(value);
    await tx.inventoryBalance.upsert({
      where,
      create: {
        organizationId: s.organizationId,
        companyId: s.companyId,
        warehouseId,
        productId,
        quantity: money(nextQty),
        value: money(nextValue),
        lastDate: record.date,
      },
      update: { quantity: money(nextQty), value: money(nextValue), lastDate: record.date },
    });
    await tx.stockMovement.create({
      data: {
        organizationId: s.organizationId,
        companyId: s.companyId,
        sourceId: record.id,
        sourceModule: record.module,
        warehouseId,
        productId,
        branchId: warehouse.branchId || record.branchId,
        yearId: record.yearId,
        date: record.date,
        quantity: money(quantity),
        value: money(value),
        reversalOfId,
      },
    });
    return value.abs();
  }
  async post(tx: Tx, p: Principal, s: Scope, record: any) {
    if (record.postedAt)
      throw new ApiError('این سند قبلاً ثبت قطعی شده است.', 409, 'ALREADY_POSTED');
    await openYear(tx, s, record.date);
    const d = record.data as any,
      key = record.module,
      fx = D(d.exchangeRate || 1),
      entries: Entry[] = [];
    const line = (
      system: string,
      debit: Decimal.Value,
      credit: Decimal.Value,
      extra: Partial<Entry> = {},
    ) => entries.push({ system, debit, credit, ...extra });
    const bank = (
      id: string,
      debit: Decimal.Value,
      credit: Decimal.Value,
      foreign: Decimal.Value,
      rate: Decimal = fx,
    ) =>
      line('cash', debit, credit, {
        bankId: id,
        currency: d.currency,
        foreignAmount: foreign,
        exchangeRate: rate,
      });
    const companySnapshot = await tx.company.findUniqueOrThrow({ where: { id: s.companyId } });
    let total = D(record.total),
      snapshot = {
        ...d,
        companySnapshot: {
          ...(companySnapshot.data as any),
          ...(companySnapshot.settings as any),
          id: companySnapshot.id,
          name: companySnapshot.name,
          code: companySnapshot.code,
        },
      };
    if (['sales', 'purchases', 'sales-returns', 'purchase-returns'].includes(key)) {
      const t = invoiceTotal(d, record.lines);
      total = t.total;
      if (total.lte(0)) throw new ApiError('مبلغ فاکتور باید مثبت باشد.', 422);
      const net = t.net.mul(fx).toDecimalPlaces(6),
        tax = t.tax.mul(fx).toDecimalPlaces(6),
        gross = net.add(tax);
      const sales = key === 'sales' || key === 'sales-returns',
        returned = key.endsWith('returns');
      let cost = D(0),
        inventoryPart = D(0),
        servicePart = D(0);
      if (returned) {
        const original = await tx.record.findFirst({
          where: {
            id: String(d.originalInvoiceId),
            companyId: s.companyId,
            module: sales ? 'sales' : 'purchases',
          },
          include: { lines: true },
        });
        if (
          !original?.postedAt ||
          original.reversedAt ||
          (original.data as any).personId !== d.personId ||
          (original.data as any).currency !== d.currency
        )
          throw new ApiError(
            'فاکتور اصلی معتبر و قطعی را برای برگشت انتخاب کنید.',
            422,
            'ORIGINAL_INVOICE_REQUIRED',
          );
        if (record.date < original.date!)
          throw new ApiError('تاریخ برگشت قبل از فاکتور اصلی است.', 422);
        const originalTotals = invoiceTotal(original.data, original.lines);
        for (let i = 0; i < record.lines.length; i++) {
          const l = record.lines[i],
            j = original.lines.findIndex((x) => x.productId === l.productId);
          if (
            j >= 0 &&
            !t.lineNet[i]
              .toDecimalPlaces(6)
              .eq(
                originalTotals.lineNet[j]
                  .mul(D(l.quantity))
                  .div(D(original.lines[j].quantity))
                  .toDecimalPlaces(6),
              )
          )
            throw new ApiError(
              'تخفیف و مبلغ خالص برگشت باید متناسب با فاکتور اصلی باشد.',
              422,
              'RETURN_NET_MISMATCH',
            );
        }
        const oldReturns = await tx.record.findMany({
          where: { companyId: s.companyId, module: key, postedAt: { not: null }, reversedAt: null },
          include: { lines: true },
        });
        for (const l of record.lines) {
          const originalLine = original.lines.find((x) => x.productId === l.productId);
          const returnedQty = oldReturns
            .filter((r) => (r.data as any).originalInvoiceId === original.id)
            .flatMap((r) => r.lines)
            .filter((x) => x.productId === l.productId)
            .reduce((q, l) => q.add(D(l.quantity)), D(0));
          if (
            originalLine &&
            (!D(l.price).eq(D(originalLine.price)) ||
              !D(l.discount).eq(D(originalLine.discount)) ||
              !D(l.tax).eq(D(originalLine.tax)) ||
              !fx.eq(D((original.data as any).exchangeRate || 1)))
          )
            throw new ApiError(
              'مبلغ، تخفیف، مالیات و نرخ ارز برگشت باید مطابق فاکتور اصلی باشد.',
              422,
              'RETURN_VALUE_MISMATCH',
            );
          if (!originalLine || returnedQty.add(D(l.quantity)).gt(D(originalLine.quantity)))
            throw new ApiError(
              'تعداد برگشت از تعداد فاکتور اصلی بیشتر است.',
              422,
              'RETURN_EXCEEDS_ORIGINAL',
            );
        }
      }
      for (let i = 0; i < record.lines.length; i++) {
        const l = record.lines[i],
          product = await tx.record.findUniqueOrThrow({ where: { id: l.productId } });
        const isService = (product.data as any).type === 'خدمت';
        const lineBase =
          i === record.lines.length - 1
            ? net.sub(inventoryPart).sub(servicePart)
            : t.lineNet[i].mul(fx).toDecimalPlaces(6);
        l.data = {
          ...l.data,
          productName: product.name,
          productCode: product.code,
          lineNet: money(t.lineNet[i]),
          lineTax: money(t.lineTax[i]),
          lineTotal: money(t.lineNet[i].add(t.lineTax[i])),
        };
        await tx.recordLine.update({ where: { id: l.id }, data: { data: json(l.data) } });
        if (isService) {
          servicePart = servicePart.add(lineBase);
          continue;
        }
        inventoryPart = inventoryPart.add(lineBase);
        let value: DReturn;
        if (sales && !returned)
          value = await this.stock(tx, s, record, d.warehouseId, l.productId, D(l.quantity).neg());
        else if (sales && returned) {
          const original = await tx.record.findUniqueOrThrow({
            where: { id: d.originalInvoiceId },
            include: { lines: true },
          });
          const old = original.lines.find((x) => x.productId === l.productId)!;
          value = await this.stock(
            tx,
            s,
            record,
            d.warehouseId,
            l.productId,
            D(l.quantity),
            D(old.cost).div(D(old.quantity)),
          );
        } else if (!returned)
          value = await this.stock(
            tx,
            s,
            record,
            d.warehouseId,
            l.productId,
            D(l.quantity),
            lineBase.div(D(l.quantity)),
          );
        else
          value = await this.stock(tx, s, record, d.warehouseId, l.productId, D(l.quantity).neg());
        cost = cost.add(value);
        await tx.recordLine.update({
          where: { id: l.id },
          data: {
            cost: money(value),
            data: json({ ...l.data, productName: product.name, productCode: product.code }),
          },
        });
      }
      if (sales) {
        line('receivable', returned ? 0 : gross, returned ? gross : 0, { personId: d.personId });
        line('sales', returned ? net : 0, returned ? 0 : net);
        line('vat-output', returned ? tax : 0, returned ? 0 : tax);
        line('cogs', returned ? 0 : cost, returned ? cost : 0);
        line('inventory', returned ? cost : 0, returned ? 0 : cost);
      } else if (!returned) {
        line('inventory', inventoryPart, 0);
        line('expense', servicePart, 0);
        line('vat-input', tax, 0);
        line('payable', 0, gross, { personId: d.personId });
      } else {
        line('payable', gross, 0, { personId: d.personId });
        line('inventory', 0, cost);
        line('expense', 0, servicePart);
        line('vat-input', 0, tax);
        const difference = inventoryPart.sub(cost);
        line('cogs', difference.lt(0) ? difference.abs() : 0, difference.gt(0) ? difference : 0);
      }
      const party = await tx.record.findUniqueOrThrow({ where: { id: d.personId } });
      snapshot = {
        ...snapshot,
        partySnapshot: { ...(party.data as any), name: party.name },
        totals: {
          net: money(t.net),
          subtotal: money(t.subtotal),
          discount: money(t.discount),
          tax: money(t.tax),
          total: money(t.total),
        },
        baseTotal: money(gross),
      };
    } else if (key === 'journals') {
      for (const l of record.lines)
        entries.push({
          accountId: l.accountId,
          debit: l.debit.toString(),
          credit: l.credit.toString(),
          description: l.title,
          personId: (l.data as any).personId,
          projectId: (l.data as any).projectId,
        });
      total = record.lines.reduce((s: Decimal, l: any) => s.add(D(l.debit)), D(0));
    } else if (['receipts', 'payments'].includes(key)) {
      const incoming = key === 'receipts';
      total = D(d.amount);
      const cash = total.mul(fx).toDecimalPlaces(6);
      const allocations = d.allocations?.length
        ? d.allocations
        : d.invoiceId
          ? [{ invoiceId: d.invoiceId, amount: total.toString() }]
          : [];
      let applied = D(0),
        settledBase = D(0);
      for (const a of allocations) {
        const inv = await tx.record.findFirst({
          where: {
            id: String(a.invoiceId),
            companyId: s.companyId,
            module: incoming ? 'sales' : 'purchases',
          },
        });
        if (
          !inv?.postedAt ||
          inv.reversedAt ||
          (inv.data as any).personId !== d.personId ||
          (inv.data as any).currency !== d.currency
        )
          throw new ApiError(
            'فاکتور تسویه باید قطعی، هم‌ارز و متعلق به همین طرف حساب باشد.',
            422,
            'INVALID_ALLOCATION',
          );
        const paid = await tx.allocation.aggregate({
          where: { invoiceId: inv.id, active: true },
          _sum: { amount: true },
        });
        const amount = D(a.amount);
        if (amount.lte(0) || amount.gt(D(inv.total).sub(D(paid._sum.amount || 0))))
          throw new ApiError('مبلغ تسویه از ماندهٔ فاکتور بیشتر است.', 422, 'OVERPAYMENT');
        await tx.allocation.create({
          data: {
            organizationId: s.organizationId,
            companyId: s.companyId,
            paymentId: record.id,
            invoiceId: inv.id,
            amount: money(amount),
          },
        });
        applied = applied.add(amount);
        settledBase = settledBase.add(amount.mul(D((inv.data as any).exchangeRate || 1)));
      }
      if (applied.gt(total)) throw new ApiError('جمع تخصیص از مبلغ پرداخت بیشتر است.', 422);
      settledBase = settledBase.add(total.sub(applied).mul(fx)).toDecimalPlaces(6);
      bank(d.bankId, incoming ? cash : 0, incoming ? 0 : cash, incoming ? total : total.neg());
      line(
        incoming ? 'receivable' : 'payable',
        incoming ? 0 : settledBase,
        incoming ? settledBase : 0,
        { personId: d.personId },
      );
      const gain = incoming ? cash.sub(settledBase) : settledBase.sub(cash);
      if (gain.gt(0)) line('fx-gain', 0, gain);
      else if (gain.lt(0)) line('fx-loss', gain.abs(), 0);
    } else if (key === 'transfers') {
      const from = await tx.record.findUniqueOrThrow({ where: { id: d.fromBankId } }),
        to = await tx.record.findUniqueOrThrow({ where: { id: d.toBankId } });
      if ((from.data as any).currency !== (to.data as any).currency)
        throw new ApiError('انتقال وجه به حساب هم‌ارز نیاز دارد.', 422);
      const rate = D((from.data as any).exchangeRate || 1),
        value = D(d.amount).mul(rate);
      bank(from.id, 0, value, D(d.amount).neg(), rate);
      bank(to.id, value, 0, D(d.amount), rate);
      total = D(d.amount);
    } else if (['expenses', 'income', 'project-costs'].includes(key)) {
      total = D(d.amount);
      const value = total.mul(fx);
      const income = key === 'income' || (key === 'project-costs' && d.type === 'درآمد');
      line(income ? 'income' : 'expense', income ? 0 : value, income ? value : 0, {
        projectId: d.projectId,
      });
      bank(d.bankId, income ? value : 0, income ? 0 : value, income ? total : total.neg());
    } else if (key === 'checks') {
      total = D(d.amount);
      const value = total.mul(fx),
        incoming = d.type === 'دریافتی';
      line(
        incoming ? 'checks-receivable' : 'checks-payable',
        incoming ? value : 0,
        incoming ? 0 : value,
        { personId: d.personId },
      );
      line(incoming ? 'receivable' : 'payable', incoming ? 0 : value, incoming ? value : 0, {
        personId: d.personId,
      });
    } else if (key === 'stock') {
      const qty = D(d.quantity);
      let cost: DReturn;
      if (d.type === 'رسید') {
        cost = await this.stock(
          tx,
          s,
          record,
          d.warehouseId,
          d.productId,
          qty,
          D(d.unitCost || 0).mul(fx),
        );
        line('inventory', cost, 0);
        line('equity', 0, cost);
      } else {
        cost = await this.stock(tx, s, record, d.warehouseId, d.productId, qty.neg());
        if (d.type === 'انتقال') {
          if (d.warehouseId === d.destinationId)
            throw new ApiError('انبار مقصد باید متفاوت باشد.', 422);
          await this.stock(tx, s, record, d.destinationId, d.productId, qty, cost.div(qty));
        } else {
          line('expense', cost, 0);
          line('inventory', 0, cost);
        }
      }
      total = cost;
    } else if (key === 'payroll') {
      const calculation = await new PayrollService().calculate(tx, s, d, true);
      Object.assign(d, calculation);
      snapshot = { ...snapshot, ...calculation };
      const duplicate = await tx.record.findFirst({
        where: {
          companyId: s.companyId,
          yearId: s.yearId,
          module: 'payroll',
          postedAt: { not: null },
          reversedAt: null,
          AND: [
            { data: { path: ['employeeId'], equals: d.employeeId } },
            { data: { path: ['month'], equals: d.month } },
          ],
        },
      });
      if (duplicate)
        throw new ApiError('فیش قطعی برای این کارمند و دوره موجود است.', 409, 'DUPLICATE_PAYROLL');
      const base = D(d.base),
        benefits = D(d.benefits || 0),
        insurance = D(d.insurance || 0),
        tax = D(d.tax || 0),
        deductions = D(d.deductions || 0),
        employer = D(d.employerInsurance || 0);
      total = base.add(benefits).sub(insurance).sub(tax).sub(deductions);
      if (total.lt(0)) throw new ApiError('خالص حقوق منفی است.', 422);
      line('salary', base.add(benefits).add(employer), 0);
      line('payroll', 0, total);
      line('insurance', 0, insurance.add(employer));
      line('salary-tax', 0, tax);
      line('payable', 0, deductions);
      snapshot = { ...snapshot, calculationSnapshot: { ...d } };
    } else if (key === 'depreciation') {
      const asset = await tx.record.findUniqueOrThrow({ where: { id: d.assetId } });
      const a = asset.data as any;
      const periodStart = new Date(record.date);
      periodStart.setUTCDate(1);
      const periodEnd = new Date(periodStart);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
      if (
        await tx.record.findFirst({
          where: {
            companyId: s.companyId,
            module: 'depreciation',
            postedAt: { not: null },
            reversedAt: null,
            data: { path: ['assetId'], equals: d.assetId },
            date: { gte: periodStart, lt: periodEnd },
          },
        })
      )
        throw new ApiError('برای این دارایی در این ماه استهلاک ثبت شده است.', 409);
      const past = await tx.record.aggregate({
        where: {
          companyId: s.companyId,
          module: key,
          postedAt: { not: null },
          reversedAt: null,
          data: { path: ['assetId'], equals: d.assetId },
        },
        _sum: { total: true },
      });
      const remaining = D(a.cost)
        .sub(D(a.salvage))
        .sub(D(past._sum.total || 0));
      total = Decimal.min(
        remaining,
        D(a.cost).sub(D(a.salvage)).div(D(a.life)).mul(D(d.months)),
      ).toDecimalPlaces(6);
      if (total.lte(0)) throw new ApiError('ارزش قابل استهلاک باقی نمانده است.', 422);
      line('depreciation', total, 0);
      line('accumulated', 0, total);
      snapshot = { ...snapshot, assetSnapshot: a };
    } else if (key === 'production') {
      const bom = await tx.record.findFirst({
        where: { id: d.bomId, companyId: s.companyId, module: 'boms', status: 'فعال' },
        include: { lines: true },
      });
      if (!bom) throw new ApiError('فرمول ساخت فعال معتبر نیست.', 422);
      let cost = D(0);
      for (const l of bom.lines)
        cost = cost.add(
          await this.stock(
            tx,
            s,
            record,
            d.warehouseId,
            l.productId!,
            D(l.quantity).mul(D(d.quantity)).neg(),
          ),
        );
      const overhead = D(d.overhead || 0);
      await this.stock(
        tx,
        s,
        record,
        d.warehouseId,
        (bom.data as any).productId,
        D(d.quantity),
        cost.add(overhead).div(D(d.quantity)),
      );
      line('inventory', overhead, 0);
      line('payable', 0, overhead);
      total = cost.add(overhead);
      snapshot = { ...snapshot, bomSnapshot: json(bom), materialCost: money(cost) };
    }
    await this.journal(tx, p, s, record, entries);
    await tx.record.update({
      where: { id: record.id },
      data: { postedAt: new Date(), total: money(total), data: json(snapshot) },
    });
    await audit(tx, p, 'record.post', `${record.code} ثبت قطعی شد`, s.companyId, record.id);
  }
  async collectCheck(tx: Tx, p: Principal, s: Scope, record: any) {
    if (!record.postedAt || record.reversedAt) throw new ApiError('چک معتبر و در جریان نیست.', 422);
    await openYear(tx, s, record.date);
    if (
      await tx.journal.findUnique({
        where: {
          companyId_sourceKey: { companyId: s.companyId, sourceKey: `${record.id}:collection` },
        },
      })
    )
      throw new ApiError('چک قبلاً وصول شده است.', 409);
    const d = record.data as any,
      incoming = d.type === 'دریافتی',
      amount = D(d.amount),
      value = amount.mul(D(d.exchangeRate || 1));
    await this.journal(
      tx,
      p,
      s,
      record,
      [
        {
          system: 'cash',
          debit: incoming ? value : 0,
          credit: incoming ? 0 : value,
          bankId: d.bankId,
          currency: d.currency,
          foreignAmount: incoming ? amount : amount.neg(),
          exchangeRate: d.exchangeRate,
        },
        {
          system: incoming ? 'checks-receivable' : 'checks-payable',
          debit: incoming ? 0 : value,
          credit: incoming ? value : 0,
          personId: d.personId,
        },
      ],
      'collection',
    );
    await audit(tx, p, 'checks.collect', 'وصول چک ثبت شد', s.companyId, record.id);
  }
  async payPayroll(tx: Tx, p: Principal, s: Scope, record: any) {
    await openYear(tx, s, record.date);
    if (!record.postedAt || record.reversedAt) throw new ApiError('ابتدا فیش را تأیید کنید.', 422);
    if (
      await tx.journal.findUnique({
        where: {
          companyId_sourceKey: { companyId: s.companyId, sourceKey: `${record.id}:payment` },
        },
      })
    )
      throw new ApiError('حقوق قبلاً پرداخت شده است.', 409);
    const d = record.data as any;
    await this.journal(
      tx,
      p,
      s,
      record,
      [
        { system: 'payroll', debit: record.total.toString(), credit: 0 },
        {
          system: 'cash',
          debit: 0,
          credit: record.total.toString(),
          bankId: d.bankId,
          foreignAmount: D(record.total).neg().toString(),
        },
      ],
      'payment',
    );
  }
  async reverse(tx: Tx, p: Principal, s: Scope, record: any, date: string) {
    if (!record.postedAt || record.reversedAt)
      throw new ApiError('سند قابل برگشت نیست.', 409, 'NOT_REVERSIBLE');
    const reversalDate = validDate(date);
    await openYear(tx, s, reversalDate);
    if (await tx.allocation.findFirst({ where: { invoiceId: record.id, active: true } }))
      throw new ApiError('ابتدا دریافت/پرداخت‌های مرتبط را برگشت دهید.', 409, 'DEPENDENCIES_EXIST');
    const returns = await tx.record.findFirst({
      where: {
        companyId: s.companyId,
        postedAt: { not: null },
        reversedAt: null,
        data: { path: ['originalInvoiceId'], equals: record.id },
      },
    });
    if (returns) throw new ApiError('ابتدا اسناد برگشت وابسته را اصلاح کنید.', 409);
    const movements = await tx.stockMovement.findMany({
      where: { sourceId: record.id, reversalOfId: null },
      orderBy: { createdAt: 'desc' },
    });
    for (const movement of movements) {
      const balance = await tx.inventoryBalance.findUniqueOrThrow({
        where: {
          companyId_warehouseId_productId: {
            companyId: s.companyId,
            warehouseId: movement.warehouseId,
            productId: movement.productId,
          },
        },
      });
      if (balance.lastDate && reversalDate < balance.lastDate)
        throw new ApiError('تاریخ برگشت قبل از آخرین گردش انبار است.', 422);
      const quantity = D(balance.quantity).sub(D(movement.quantity)),
        value = D(balance.value).sub(D(movement.value));
      if (quantity.lt(0) || value.lt(0))
        throw new ApiError(
          'کالای دریافت‌شده مصرف شده و قابل برگشت کامل نیست.',
          409,
          'STOCK_DEPENDENCY',
        );
      if (quantity.isZero() && !value.isZero())
        throw new ApiError(
          'برگشت با ارزش موجودی جاری سازگار نیست؛ ابتدا گردش‌های بعدی را اصلاح کنید.',
          409,
        );
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { quantity: money(quantity), value: money(value), lastDate: reversalDate },
      });
      await tx.stockMovement.create({
        data: {
          organizationId: s.organizationId,
          companyId: s.companyId,
          sourceId: record.id,
          sourceModule: record.module,
          warehouseId: movement.warehouseId,
          productId: movement.productId,
          branchId: movement.branchId,
          yearId: s.yearId,
          date: reversalDate,
          quantity: money(D(movement.quantity).neg()),
          value: money(D(movement.value).neg()),
          reversalOfId: movement.id,
        },
      });
    }
    const journals = await tx.journal.findMany({
      where: { companyId: s.companyId, sourceId: record.id, reversalOfId: null },
      include: { lines: true },
    });
    for (const j of journals) {
      await this.journal(
        tx,
        p,
        s,
        { ...record, date: reversalDate, yearId: s.yearId },
        j.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.credit.toString(),
          credit: l.debit.toString(),
          personId: l.personId || undefined,
          projectId: l.projectId || undefined,
          bankId: l.bankId || undefined,
          currency: l.currency,
          foreignAmount: D(l.foreignAmount).neg().toString(),
          exchangeRate: l.exchangeRate.toString(),
          description: `برگشت ${j.number}`,
        })),
        `reverse:${j.id}`,
        j.id,
      );
    }
    await tx.allocation.updateMany({
      where: { paymentId: record.id, active: true },
      data: { active: false },
    });
    await tx.record.update({
      where: { id: record.id },
      data: { reversedAt: new Date(), status: 'لغو شده', version: { increment: 1 } },
    });
    await audit(
      tx,
      p,
      'record.reverse',
      `${record.code} با سند برگشتی اصلاح شد`,
      s.companyId,
      record.id,
    );
  }
}
type DReturn = Decimal;
