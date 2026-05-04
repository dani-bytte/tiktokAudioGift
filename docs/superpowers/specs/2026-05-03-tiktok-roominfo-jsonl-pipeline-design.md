# Design Spec: Reliable TikTok `roomInfo` JSONL Pipeline

Date: 2026-05-03
Status: Draft approved in chat
Owner: project team

## 1) Goal

Build a reliable local ingestion pipeline for TikTok `state.roomInfo` events using JSONL files only, with:

- high resilience to partial/invalid payloads
- stable canonical model for future integrations
- auditability via raw event retention
- low operational complexity (no external DB)

Out of scope for this phase:

- remote database persistence
- dashboard UI
- real-time alert delivery channels (Slack/Discord/etc.)
- schema migration framework

## 2) Inputs and Outputs

### Input

- Source payload: `state.roomInfo`
- Structure expected: `{ data, extra, status_code }`

### Output files (daily partitions)

- `data/tiktok/raw/YYYY-MM-DD.jsonl`
  - purpose: forensic/audit copy of inbound payload
- `data/tiktok/canonical/YYYY-MM-DD.jsonl`
  - purpose: normalized records consumed by app logic and analytics
- `data/tiktok/errors/YYYY-MM-DD.jsonl`
  - purpose: non-fatal validation/transform failures

Each line is one JSON object (NDJSON/JSONL format).

## 3) Pipeline Architecture

Single-event flow:

1. Receive raw payload.
2. Stamp ingestion metadata (`ingested_at_ms`, source tag).
3. Validate minimum required fields.
4. If valid: normalize into canonical model.
5. Compute derived fields.
6. Persist:
   - raw event to `raw`
   - canonical event to `canonical`
7. If invalid/transform error:
   - persist structured error object to `errors`
   - continue process (do not crash service)

## 4) Canonical Data Contract

Canonical record shape:

```json
{
  "event": {
    "event_id": "string",
    "captured_at_ms": 0,
    "ingested_at_ms": 0,
    "status_code": 0,
    "log_id": "string"
  },
  "room": {
    "room_id": "string",
    "title": "string",
    "status": 0,
    "stream_status": 0,
    "live_mode": 0,
    "is_replay": false,
    "created_at": 0,
    "ended_at": 0
  },
  "owner": {
    "user_id": "string",
    "sec_uid": "string",
    "username": "string",
    "nickname": "string",
    "followers": 0,
    "following": 0,
    "verified": false
  },
  "metrics": {
    "current_viewers": 0,
    "total_unique_viewers": 0,
    "entries": 0,
    "new_follows": 0,
    "likes": 0,
    "shares": 0,
    "comments": 0,
    "replay_viewers": 0
  },
  "features": {
    "chat_enabled": false,
    "gift_enabled": false,
    "like_enabled": false,
    "share_enabled": false,
    "interaction_question_enabled": false
  },
  "stream": {
    "default_resolution": "string",
    "available_resolutions": [],
    "hls_url": "string",
    "flv_url_map": {}
  },
  "derived": {
    "is_live_now": false,
    "session_duration_sec": 0,
    "engagement_rate_proxy": 0,
    "follow_conversion_proxy": 0,
    "has_stream_fallback": false
  }
}
```

## 5) Required Field Gate (P0)

Reject canonical transform if any are missing/invalid:

- `status_code` (number)
- `extra.now` (number)
- `data.id_str` (string)
- `data.status` (number)
- `data.stream_status` (number)

On reject:

- write raw payload to `raw`
- write error payload to `errors`
- skip canonical write

## 6) Event Identity and Dedup

Create deterministic `event_id`:

- recommended formula: `sha1(log_id + ":" + room_id + ":" + captured_at_ms)`
- fallback if `log_id` missing: `sha1(room_id + ":" + captured_at_ms + ":" + status + ":" + stream_status)`

Dedup strategy for this phase:

- No in-memory stateful deduper required.
- Consumers can dedupe by `event_id` when reading JSONL.

## 7) Sanitization Rules

Canonical output should avoid unstable/noisy fields:

- remove query strings from signed URLs where feasible for stable analytics fields
- do not include `deprecated*` fields
- do not include experiment blobs (`room_create_ab_param`, `AnchorABMap`, similar)
- truncate oversized nested blobs in error output (store preview + size)

Privacy handling:

- keep `sec_uid` in canonical for matching, but mark as sensitive in docs
- avoid logging full stream URLs in plain debug logs

## 8) Error Record Contract

Each `errors` JSONL line:

```json
{
  "error_at_ms": 0,
  "stage": "validate|normalize|derive|persist",
  "reason": "string",
  "room_id": "string|null",
  "log_id": "string|null",
  "captured_at_ms": 0,
  "event_id": "string|null",
  "raw_preview": {},
  "stack": "string|null"
}
```

Rules:

- no throw to top-level from pipeline loop
- always produce machine-readable `reason`

## 9) File IO and Reliability

- Ensure directory creation before first write.
- Use append-only writes with newline termination per record.
- Prefer one shared writer utility per target (`raw`, `canonical`, `errors`).
- On write failure for `canonical`, write a secondary `persist` error record.
- Keep raw write first for auditability.

Operational expectation:

- process remains alive under malformed events
- temporary disk failures are surfaced via `errors` records and logger

## 10) Retention and Rotation

Initial retention policy:

- `raw`: 14 days
- `canonical`: 90 days
- `errors`: 30 days

Simple rotation:

- partition by local date (`YYYY-MM-DD`)
- cleanup job can run daily at startup or via scheduled task

## 11) Testing Strategy

Unit tests:

- validate required field gate
- normalize known good payload snapshot
- derive metrics calculation with edge cases (`total_user = 0`)
- sanitize URL/query stripping behavior

Integration tests:

- ingest sample payload end-to-end
- verify exactly one line appended per sink as expected
- verify malformed payload goes to `errors` and does not crash

Fixtures:

- use the provided `roomInfo` sample as baseline fixture
- include a minimal payload and a corrupted payload fixture

## 12) Implementation Boundaries (Suggested Modules)

- `src/tiktok/pipeline/validateRoomInfo.ts`
- `src/tiktok/pipeline/normalizeRoomInfo.ts`
- `src/tiktok/pipeline/deriveRoomMetrics.ts`
- `src/tiktok/pipeline/jsonlWriter.ts`
- `src/tiktok/pipeline/processRoomInfoEvent.ts`
- `src/tiktok/pipeline/types.ts`

Rationale:

- isolate concerns (validation, mapping, IO)
- easy testing per module
- easier migration later to SQLite/remote DB

## 13) Risks and Mitigations

- Risk: schema drift from TikTok payload changes.
  - Mitigation: strict P0 gate + permissive optional field handling.
- Risk: JSONL growth and disk pressure.
  - Mitigation: retention cleanup and compact canonical schema.
- Risk: signed URL instability polluting diffs.
  - Mitigation: sanitize volatile URL query params.
- Risk: JS numeric precision for numeric IDs.
  - Mitigation: always prefer `*_str` IDs as source of truth.

## 14) Success Criteria

- Pipeline continues running with mixed valid/invalid events.
- P0 invalid events appear in `errors` with actionable reason.
- Valid events always emit canonical record with deterministic `event_id`.
- Daily JSONL files created automatically by date.
- Sample replay of payload produces stable canonical output fields.

## 15) Next Step

After user approval of this spec, create implementation plan with task breakdown and verification commands.
