# Graph Report - h  (2026-09-08)

## Corpus Check
- 115 files · ~225,544 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 703 nodes · 1477 edges · 55 communities (40 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4374ed59`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 58|Community 58]]

## God Nodes (most connected - your core abstractions)
1. `Principal` - 61 edges
2. `Scope` - 45 edges
3. `requirePermission()` - 37 edges
4. `D()` - 29 edges
5. `useApp()` - 29 edges
6. `scripts` - 26 edges
7. `money()` - 19 edges
8. `ApiError` - 18 edges
9. `validDate()` - 18 edges
10. `json()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `sum()` --calls--> `D()`  [EXTRACTED]
  backend/src/reports.ts → backend/src/core.ts
- `processJob()` --calls--> `json()`  [EXTRACTED]
  backend/src/integrations.ts → backend/src/core.ts
- `processJob()` --calls--> `requireLocalMode()`  [EXTRACTED]
  backend/src/integrations.ts → backend/src/local-mode.ts
- `Page()` --calls--> `NotFound()`  [INFERRED]
  src/app/(workspace)/[...slug]/page.tsx → src/app/not-found.tsx
- `Dashboard()` --calls--> `date`  [INFERRED]
  src/components/dashboard.tsx → src/lib/modules.ts

## Import Cycles
- None detected.

## Communities (55 total, 15 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (59): NotFound(), Dashboard(), Data, Column, DataTable(), normalize, TableQuery, TableResult (+51 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (13): AuthService, can(), Principal, requirePermission(), Scope, FilesService, IdentityService, localNotification() (+5 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (64): bank, AccountingService, depreciationPeriod(), DReturn, Entry, invoiceTotal(), openYear(), registration (+56 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (48): active(), amountOf(), bankBalance(), entries(), Entry, invoiceTotals(), number(), round() (+40 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (37): dependencies, decimal.js, dotenv, helmet, jalaali-js, @nestjs/common, @nestjs/core, @nestjs/platform-express (+29 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (26): scripts, backend:build, backend:dev, backend:test, build, db:backup, db:demo, db:migrate (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.19
Nodes (12): LocalLab(), Platform(), day(), format(), Input(), Item, request(), SmartTable() (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (16): compilerOptions, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, module, moduleResolution, outDir (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (13): آزمون‌هایی که پیش از دادهٔ واقعی لازم‌اند, ترتیب اجرا و معیار خروج هر مرحله, ثبت قطعی: مهم‌ترین بخش بک‌اند, دسترسی، نگهداری و استقرار, قرارداد API پیشنهادی, مدل داده و مرز شرکت‌ها, مسئولیت بک‌اند هر بخش, مهاجرت تدریجی از همین پروژه (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (13): sms.ir و ایمیل, اتصال‌های بیرونی, امنیت، ظرفیت و انتشار عمومی, حقوق، بیمه و مالیات ایران, راهنمای بک‌اند تراز, زرین‌پال, سامانهٔ مؤدیان, شواهد آزمون و منابع (+5 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (11): dependencies, exceljs, @fontsource-variable/vazirmatn, jalaali-js, lucide-react, next, react, react-dom (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.20
Nodes (9): artifact, catalog, failures, fixture, log, root, server, visited (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (9): concurrency, generatedAt, maxResponseBytes, p50Ms, p95Ms, pageSize, records, requests (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.20
Nodes (8): admin, { Client }, creds, databaseUrl, env, envText, require, root

### Community 17 - "Community 17"
Cohesion: 0.27
Nodes (6): login(), request(), server, testId, errors, selectValue()

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (7): آزمون‌ها و شواهد, اصلاحات این بازبینی, دامنهٔ تحویل, مرز استفادهٔ فعلی, پوشش ماژول‌ها, گزارش‌ها و صفحه‌های مکمل, گزارش پوشش و بازبینی رابط تراز

### Community 21 - "Community 21"
Cohesion: 0.25
Nodes (7): آزمایش کامل محلی بدون حساب بیرونی, اجرا و تست, استهلاک و حقوق, ایمیل، بازیابی و دعوت, جدول‌ها و ظرفیت, مؤدیان و پیامک, پرداخت و اشتراک

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (7): uuid, name, overrides, exceljs, private, type, version

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (8): devDependencies, @playwright/test, prettier, @types/jalaali-js, @types/node, @types/react, @types/react-dom, typescript

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (7): امکانات پیاده‌شده, تراز — حسابداری چندسازمانی, تست و عملیات, دادهٔ نمایشی روی دیتابیس واقعی, راه‌اندازی, مستندات, وضعیت اتصال‌ها و قواعد ایران

### Community 25 - "Community 25"
Cohesion: 0.25
Nodes (5): bin, credentialsFile, data, root, runtime

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (4): decrypt(), ModianClient, processJob(), signModian()

### Community 27 - "Community 27"
Cohesion: 0.29
Nodes (6): Architecture boundaries, Before changing code, Documentation is part of every change, Safety and repository hygiene, Taraz project agent guide, Verification

### Community 28 - "Community 28"
Cohesion: 0.29
Nodes (6): assertions, isolatedData, modules, passed, reports, testedAt

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (5): appEnv, bin, root, runtime, url

### Community 30 - "Community 30"
Cohesion: 0.33
Nodes (5): Existing application limitations, Operations, Production deployment, Server layout and credentials, Services and storage

### Community 31 - "Community 31"
Cohesion: 0.40
Nodes (5): alive(), file, owned(), root, runtime

### Community 32 - "Community 32"
Cohesion: 0.40
Nodes (4): مراحل, موارد نسخهٔ عملیاتی آینده, نتیجهٔ آخرین بررسی, پیشرفت بک‌اند عملیاتی

### Community 33 - "Community 33"
Cohesion: 0.40
Nodes (4): printWidth, singleQuote, tabWidth, trailingComma

### Community 34 - "Community 34"
Cohesion: 0.50
Nodes (3): graphify, Project instructions, This is NOT the Next.js you know

### Community 35 - "Community 35"
Cohesion: 0.50
Nodes (3): failures, generatedAt, visited

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (3): modules, reports, testedAt

### Community 58 - "Community 58"
Cohesion: 0.33
Nodes (5): Automatic hooks, Graphify workflow, Human-maintained documentation, Prerequisite, Refresh commands

## Knowledge Gaps
- **291 isolated node(s):** `PreToolUse`, `PreToolUse`, `singleQuote`, `trailingComma`, `tabWidth` (+286 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `bank` connect `Community 2` to `Community 3`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `Principal` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `Scope` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `PreToolUse`, `PreToolUse`, `singleQuote` to the rest of the system?**
  _291 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06106442577030812 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07204968944099378 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07515151515151515 - nodes in this community are weakly interconnected._