CREATE OR REPLACE FUNCTION taraz_normalize(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(regexp_replace(translate(coalesce(value,''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩يك', '01234567890123456789یک'), '[‌٬,]', '', 'g'));
$$;
CREATE INDEX "Record_scope_created_idx" ON "Record" ("companyId", "module", "yearId", "createdAt" DESC, "id" DESC);
CREATE INDEX "RecordReference_source_idx" ON "RecordReference" ("sourceId");
