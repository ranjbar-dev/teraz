import { db, passwordHash, transaction, ApiError } from './core';
async function seed() {
  const email = process.env.SUPER_ADMIN_EMAIL,
    password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required; run local setup.');
  await transaction('seed:platform', async (tx) => {
    if (!(await tx.plan.count()))
      await tx.plan.createMany({
        data: [
          {
            name: 'رشد',
            price: '9900000',
            durationDays: 30,
            companyLimit: 3,
            userLimit: 10,
            documentLimit: 5000,
          },
          {
            name: 'کسب‌وکار',
            price: '24900000',
            durationDays: 30,
            companyLimit: 10,
            userLimit: 50,
            documentLimit: 30000,
          },
          {
            name: 'سازمانی',
            price: '69900000',
            durationDays: 30,
            companyLimit: 50,
            userLimit: 200,
            documentLimit: 100000,
          },
        ],
      });
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing && existing.globalRole !== 'SUPER_ADMIN')
      throw new ApiError('ایمیل مدیر کل قبلاً حساب عادی دارد؛ تغییر نقش خودکار انجام نشد.', 409);
    if (!existing)
      await tx.user.create({
        data: {
          email,
          name: 'مدیر کل تراز',
          passwordHash: await passwordHash(password),
          globalRole: 'SUPER_ADMIN',
        },
      });
  });
  console.log('Plans and platform owner are ready. Existing credentials and data were preserved.');
}
seed()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e.message);
    await db.$disconnect();
    process.exit(1);
  });
