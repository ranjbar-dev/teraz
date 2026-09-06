import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import {
  db,
  Principal,
  Scope,
  requirePermission,
  requireSubscription,
  ApiError,
  transaction,
  audit,
} from './core';
const root = path.resolve(__dirname, '../uploads');
export class FilesService {
  async record(s: Scope, id: string) {
    const r = await db.record.findFirst({
      where: {
        id,
        companyId: s.companyId,
        organizationId: s.organizationId,
        ...(s.branchId !== 'all' ? { OR: [{ branchId: s.branchId }, { branchId: null }] } : {}),
      },
    });
    if (!r) throw new ApiError('سند یافت نشد.', 404);
    return r;
  }
  async list(p: Principal, s: Scope, id: string) {
    const r = await this.record(s, id);
    requirePermission(p, `${r.module}.read`);
    return {
      rows: await db.attachment.findMany({
        where: { companyId: s.companyId, recordId: id },
        select: { id: true, name: true, mime: true, size: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }
  async upload(p: Principal, s: Scope, input: any) {
    const r = await this.record(s, String(input.recordId || ''));
    requirePermission(p, `${r.module}.write`);
    const content = Buffer.from(String(input.base64 || ''), 'base64');
    if (!content.length || content.length > 5 * 1024 * 1024)
      throw new ApiError('حداکثر اندازهٔ پیوست ۵ مگابایت است.', 422);
    const detected =
      content.subarray(0, 5).toString() === '%PDF-'
        ? 'application/pdf'
        : content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : content[0] === 255 && content[1] === 216 && content[2] === 255
            ? 'image/jpeg'
            : null;
    if (!detected) throw new ApiError('فقط PDF، PNG و JPEG پذیرفته می‌شود.', 422);
    const name = String(input.name || 'پیوست')
        .replace(/[\x00-\x1f/\\]/g, '')
        .slice(0, 180),
      storageKey = randomUUID();
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, storageKey), content, { flag: 'wx' });
    try {
      return await transaction(`org:${s.organizationId}`, async (tx) => {
        await requireSubscription(tx, p);
        const file = await tx.attachment.create({
          data: {
            organizationId: s.organizationId,
            companyId: s.companyId,
            recordId: r.id,
            name,
            mime: detected,
            size: content.length,
            storageKey,
          },
        });
        await audit(tx, p, 'attachment.upload', 'پیوست ذخیره شد', s.companyId, r.id, undefined, {
          name,
          size: content.length,
        });
        return { id: file.id, name: file.name, size: file.size };
      });
    } catch (e) {
      await unlink(path.join(root, storageKey));
      throw e;
    }
  }
  async download(p: Principal, s: Scope, id: string, res: Response) {
    const file = await db.attachment.findFirst({ where: { id, companyId: s.companyId } });
    if (!file) throw new ApiError('پیوست یافت نشد.', 404);
    const r = await this.record(s, file.recordId);
    requirePermission(p, `${r.module}.read`);
    res.setHeader('Content-Type', file.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(await readFile(path.join(root, file.storageKey)));
  }
  async remove(p: Principal, s: Scope, id: string) {
    const file = await db.attachment.findFirst({ where: { id, companyId: s.companyId } });
    if (!file) throw new ApiError('پیوست یافت نشد.', 404);
    const r = await this.record(s, file.recordId);
    requirePermission(p, `${r.module}.write`);
    if (r.postedAt) throw new ApiError('پیوست سند قطعی حذف نمی‌شود.', 409);
    await transaction(`org:${s.organizationId}`, async (tx) => {
      await requireSubscription(tx, p);
      await tx.attachment.delete({ where: { id } });
      await audit(tx, p, 'attachment.delete', 'پیوست حذف شد', s.companyId, r.id);
    });
    await unlink(path.join(root, file.storageKey));
    return { ok: true };
  }
}
