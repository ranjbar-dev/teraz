CREATE FUNCTION taraz_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted financial history is append-only' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION taraz_immutable();
CREATE TRIGGER immutable_stock BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION taraz_immutable();

CREATE FUNCTION taraz_journal_header() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.sealed THEN RAISE EXCEPTION 'Sealed journal cannot be changed' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER journal_header_guard BEFORE UPDATE OR DELETE ON "Journal" FOR EACH ROW EXECUTE FUNCTION taraz_journal_header();
CREATE FUNCTION taraz_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN journal_id:=OLD."journalId"; ELSE journal_id:=NEW."journalId"; END IF;
 IF EXISTS(SELECT 1 FROM "Journal" WHERE id=journal_id AND sealed) THEN RAISE EXCEPTION 'Sealed journal lines cannot be changed' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER journal_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION taraz_journal_line();
ALTER TABLE "JournalLine" ADD CONSTRAINT article_one_side CHECK (debit>=0 AND credit>=0 AND ((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
ALTER TABLE "InventoryBalance" ADD CONSTRAINT nonnegative_inventory CHECK (quantity>=0 AND value>=0);
ALTER TABLE "Allocation" ADD CONSTRAINT positive_allocation CHECK (amount>0);
ALTER TABLE "Plan" ADD CONSTRAINT valid_plan CHECK (price>=0 AND "durationDays">0 AND "companyLimit">0 AND "userLimit">0 AND "documentLimit">0);
CREATE FUNCTION taraz_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n bigint; d numeric; c numeric;
BEGIN
 SELECT COUNT(*),COALESCE(SUM(debit),0),COALESCE(SUM(credit),0) INTO n,d,c FROM "JournalLine" WHERE "journalId"=NEW.id;
 IF n<2 OR d<>c OR NOT EXISTS(SELECT 1 FROM "Journal" WHERE id=NEW.id AND sealed) THEN RAISE EXCEPTION 'Journal must be sealed and balanced at commit' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT OR UPDATE ON "Journal" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION taraz_balanced();
CREATE FUNCTION taraz_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."postedAt" IS NOT NULL THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Posted document cannot be deleted' USING ERRCODE='23514'; END IF;
   IF (to_jsonb(NEW)-'status'-'version'-'updatedAt'-'reversedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'version'-'updatedAt'-'reversedAt') THEN RAISE EXCEPTION 'Posted document is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER record_posted_guard BEFORE UPDATE OR DELETE ON "Record" FOR EACH ROW EXECUTE FUNCTION taraz_record_guard();
CREATE FUNCTION taraz_record_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE record_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN record_id:=OLD."recordId"; ELSE record_id:=NEW."recordId"; END IF;
 IF EXISTS(SELECT 1 FROM "Record" WHERE id=record_id AND "postedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Posted document lines are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER record_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "RecordLine" FOR EACH ROW EXECUTE FUNCTION taraz_record_line_guard();
