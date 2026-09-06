-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "globalRole" TEXT NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "companyIds" JSONB NOT NULL DEFAULT '[]',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(24,0) NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "companyLimit" INTEGER NOT NULL DEFAULT 5,
    "userLimit" INTEGER NOT NULL DEFAULT 20,
    "documentLimit" INTEGER NOT NULL DEFAULT 10000,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "amount" DECIMAL(24,0) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "authority" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mode" TEXT NOT NULL DEFAULT 'sandbox',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'IRR',
    "status" TEXT NOT NULL DEFAULT 'فعال',
    "data" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "date" DATE,
    "branchId" TEXT,
    "yearId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "total" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordLine" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT,
    "accountId" TEXT,
    "title" TEXT NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "price" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "debit" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "credit" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "cost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "RecordLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordReference" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "field" TEXT NOT NULL,

    CONSTRAINT "RecordReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "branchId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "sealed" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "personId" TEXT,
    "projectId" TEXT,
    "bankId" TEXT,
    "description" TEXT NOT NULL,
    "debit" DECIMAL(24,6) NOT NULL,
    "credit" DECIMAL(24,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "foreignAmount" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "exchangeRate" DECIMAL(24,10) NOT NULL DEFAULT 1,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "value" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "lastDate" DATE,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "value" DECIMAL(24,6) NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(24,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "organizationId" TEXT,
    "companyId" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "message" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idempotency" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRule" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "rules" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'sandbox',
    "encryptedConfig" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationJob" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "recordId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "recordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_authority_key" ON "BillingPayment"("authority");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_reference_key" ON "BillingPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Company_organizationId_code_key" ON "Company"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Company_id_organizationId_key" ON "Company"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Record_organizationId_companyId_module_date_id_idx" ON "Record"("organizationId", "companyId", "module", "date", "id");

-- CreateIndex
CREATE INDEX "Record_companyId_yearId_branchId_module_idx" ON "Record"("companyId", "yearId", "branchId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "Record_companyId_module_code_key" ON "Record"("companyId", "module", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Record_id_companyId_key" ON "Record"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordLine_recordId_position_key" ON "RecordLine"("recordId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RecordReference_sourceId_field_targetId_key" ON "RecordReference"("sourceId", "field", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_reversalOfId_key" ON "Journal"("reversalOfId");

-- CreateIndex
CREATE INDEX "Journal_companyId_yearId_branchId_date_idx" ON "Journal"("companyId", "yearId", "branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_companyId_sourceKey_key" ON "Journal"("companyId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_companyId_number_key" ON "Journal"("companyId", "number");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_journalId_idx" ON "JournalLine"("accountId", "journalId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_companyId_warehouseId_productId_key" ON "InventoryBalance"("companyId", "warehouseId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversalOfId_key" ON "StockMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_warehouseId_productId_date_idx" ON "StockMovement"("companyId", "warehouseId", "productId", "date");

-- CreateIndex
CREATE INDEX "StockMovement_sourceId_idx" ON "StockMovement"("sourceId");

-- CreateIndex
CREATE INDEX "Allocation_invoiceId_active_idx" ON "Allocation"("invoiceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_paymentId_invoiceId_key" ON "Allocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_companyId_createdAt_idx" ON "AuditEvent"("organizationId", "companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Idempotency_organizationId_key_key" ON "Idempotency"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_companyId_provider_key" ON "IntegrationConfig"("companyId", "provider");

-- CreateIndex
CREATE INDEX "IntegrationJob_status_nextAttemptAt_idx" ON "IntegrationJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_companyId_organizationId_fkey" FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordLine" ADD CONSTRAINT "RecordLine_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordReference" ADD CONSTRAINT "RecordReference_sourceId_companyId_fkey" FOREIGN KEY ("sourceId", "companyId") REFERENCES "Record"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordReference" ADD CONSTRAINT "RecordReference_targetId_companyId_fkey" FOREIGN KEY ("targetId", "companyId") REFERENCES "Record"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_companyId_organizationId_fkey" FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_companyId_organizationId_fkey" FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_organizationId_fkey" FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_companyId_organizationId_fkey" FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRule" ADD CONSTRAINT "PayrollRule_companyId_organizationId_fkey" FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConfig" ADD CONSTRAINT "IntegrationConfig_companyId_organizationId_fkey" FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationJob" ADD CONSTRAINT "IntegrationJob_companyId_organizationId_fkey" FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_companyId_organizationId_fkey" FOREIGN KEY ("companyId", "organizationId") REFERENCES "Company"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
