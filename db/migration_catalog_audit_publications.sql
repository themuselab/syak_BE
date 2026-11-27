-- The reconciler writes only fully reconciled catalog snapshots. A missing row means pending.
CREATE TABLE IF NOT EXISTS catalog_audit_publications (
  batch_id text NOT NULL,
  version text NOT NULL CHECK (version ~ '^[0-9a-f]{64}$'),
  published_at timestamptz NOT NULL DEFAULT now(),
  manifest jsonb NOT NULL CHECK (
    manifest @> '{"schemaVersion":1,"complete":true}'::jsonb
    AND manifest ?& ARRAY['checkedAt','auditedShopCount','verifiedShopIds','priorityShopIds']
    AND jsonb_typeof(manifest->'verifiedShopIds') = 'array'
    AND jsonb_typeof(manifest->'priorityShopIds') = 'array'
  ),
  PRIMARY KEY (batch_id, version)
);
REVOKE ALL ON catalog_audit_publications FROM PUBLIC;
