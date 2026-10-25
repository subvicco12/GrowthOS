-- Review-only proposal 016. NEVER registered with the migration runner.
-- Requires independently certified 001-015 and the exact schema charset/collation review.
-- Does not install publication, scheduling, worker or automatic decision authority.
CREATE TABLE growth_recommendations (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL, id CHAR(36) NOT NULL,
 category ENUM('seo','content','conversion','usability','feature_review','monetization') NOT NULL,
 title VARCHAR(200) NOT NULL, problem TEXT NOT NULL, proposal TEXT NOT NULL,
 expected_benefit TEXT NOT NULL, priority TINYINT UNSIGNED NOT NULL,
 confidence ENUM('observed_limited','manual_unverified','independently_verified') NOT NULL,
 effort ENUM('unknown','low','medium','high') NOT NULL DEFAULT 'unknown',
 cost_minor BIGINT UNSIGNED NULL, currency CHAR(3) NULL,
 risk ENUM('review_required','low','medium','high') NOT NULL DEFAULT 'review_required',
 evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, evidence_observed_at DATETIME(6) NOT NULL,
 evidence_expires_at DATETIME(6) NOT NULL, evidence_revoked_at DATETIME(6) NULL,
 state ENUM('proposed','accepted_for_planning','rejected','deferred','expired','revoked') NOT NULL DEFAULT 'proposed',
 revision INT UNSIGNED NOT NULL DEFAULT 0, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY (organization_id,website_id,id),
 UNIQUE KEY uq_recommendation_org_id (organization_id,id),
 KEY idx_recommendation_queue (organization_id,website_id,state,created_at,id),
 KEY idx_recommendation_expiry (organization_id,evidence_expires_at),
 FOREIGN KEY (organization_id,website_id) REFERENCES growth_websites(organization_id,id),
 CHECK (priority BETWEEN 1 AND 5), CHECK (evidence_expires_at > evidence_observed_at),
 CHECK ((cost_minor IS NULL AND currency IS NULL) OR (cost_minor IS NOT NULL AND currency IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE growth_recommendation_evidence (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 recommendation_id CHAR(36) NOT NULL, id CHAR(36) NOT NULL,
 source_kind ENUM('manual_page','synthetic_probe','connector_attestation','competitor_claim') NOT NULL,
 source_url VARCHAR(2048) NOT NULL, source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 observed_at DATETIME(6) NOT NULL, expires_at DATETIME(6) NOT NULL,
 original_evidence_id CHAR(36) NULL,
 PRIMARY KEY (organization_id,website_id,recommendation_id,id),
 KEY idx_recommendation_source (organization_id,website_id,source_hash),
 KEY idx_recommendation_original (organization_id,website_id,original_evidence_id),
 FOREIGN KEY (organization_id,website_id,recommendation_id) REFERENCES growth_recommendations(organization_id,website_id,id),
 FOREIGN KEY (organization_id,website_id,original_evidence_id) REFERENCES growth_intelligence_evidence(organization_id,website_id,id),
 CHECK (expires_at > observed_at)
) ENGINE=InnoDB;

CREATE TABLE growth_recommendation_review_events (
 organization_id CHAR(36) NOT NULL, website_id CHAR(36) NOT NULL,
 recommendation_id CHAR(36) NOT NULL, id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL,
 decision ENUM('accept_for_planning','reject','defer','expire','revoke') NOT NULL,
 reason VARCHAR(500) NOT NULL, previous_revision INT UNSIGNED NOT NULL,
 revision INT UNSIGNED NOT NULL, idempotency_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, decided_at DATETIME(6) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY (organization_id,website_id,recommendation_id,id),
 UNIQUE KEY uq_recommendation_decision_key (organization_id,idempotency_key),
 UNIQUE KEY uq_recommendation_revision (organization_id,website_id,recommendation_id,revision),
 KEY idx_recommendation_history (organization_id,website_id,recommendation_id,created_at,id),
 FOREIGN KEY (organization_id,website_id,recommendation_id) REFERENCES growth_recommendations(organization_id,website_id,id),
 FOREIGN KEY (actor_id) REFERENCES growth_users(id),
 CHECK (revision = previous_revision + 1)
) ENGINE=InnoDB;

DELIMITER //
CREATE TRIGGER recommendation_evidence_no_update BEFORE UPDATE ON growth_recommendation_evidence
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RECOMMENDATION_EVIDENCE_IMMUTABLE'//
CREATE TRIGGER recommendation_evidence_no_delete BEFORE DELETE ON growth_recommendation_evidence
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RECOMMENDATION_EVIDENCE_IMMUTABLE'//
CREATE TRIGGER recommendation_review_no_update BEFORE UPDATE ON growth_recommendation_review_events
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RECOMMENDATION_REVIEW_IMMUTABLE'//
CREATE TRIGGER recommendation_review_no_delete BEFORE DELETE ON growth_recommendation_review_events
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RECOMMENDATION_REVIEW_IMMUTABLE'//
CREATE TRIGGER recommendation_state_guard BEFORE UPDATE ON growth_recommendations
 FOR EACH ROW
 BEGIN
  DECLARE matching_events INT DEFAULT 0;
  SELECT COUNT(*) INTO matching_events FROM growth_recommendation_review_events
   WHERE organization_id=OLD.organization_id AND website_id=OLD.website_id AND recommendation_id=OLD.id
   AND previous_revision=OLD.revision AND revision=NEW.revision AND evidence_hash=OLD.evidence_hash
   AND ((NEW.state='accepted_for_planning' AND decision='accept_for_planning')
     OR (NEW.state='rejected' AND decision='reject') OR (NEW.state='deferred' AND decision='defer')
     OR (NEW.state='expired' AND decision='expire') OR (NEW.state='revoked' AND decision='revoke'));
  IF NOT (OLD.organization_id <=> NEW.organization_id AND OLD.website_id <=> NEW.website_id AND OLD.id <=> NEW.id
   AND OLD.category <=> NEW.category AND OLD.title <=> NEW.title AND OLD.problem <=> NEW.problem
   AND OLD.proposal <=> NEW.proposal AND OLD.expected_benefit <=> NEW.expected_benefit
   AND OLD.priority <=> NEW.priority AND OLD.confidence <=> NEW.confidence AND OLD.effort <=> NEW.effort
   AND OLD.cost_minor <=> NEW.cost_minor AND OLD.currency <=> NEW.currency AND OLD.risk <=> NEW.risk
   AND OLD.evidence_hash <=> NEW.evidence_hash AND OLD.evidence_observed_at <=> NEW.evidence_observed_at
   AND OLD.evidence_expires_at <=> NEW.evidence_expires_at AND OLD.created_at <=> NEW.created_at
   AND (OLD.evidence_revoked_at <=> NEW.evidence_revoked_at OR
     (NEW.state='revoked' AND OLD.evidence_revoked_at IS NULL AND NEW.evidence_revoked_at IS NOT NULL)))
   OR NEW.revision <> OLD.revision + 1 OR OLD.state <> 'proposed'
   OR matching_events <> 1 OR NEW.state NOT IN ('accepted_for_planning','rejected','deferred','expired','revoked') THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RECOMMENDATION_STATE_GUARD';
  END IF;
 END//
CREATE TRIGGER recommendation_no_delete BEFORE DELETE ON growth_recommendations
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RECOMMENDATION_IMMUTABLE'//
DELIMITER ;
