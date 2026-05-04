# TikTok Live `roomInfo` Field Map

This document maps the most important fields from `state.roomInfo` for analytics, automation, alerts, and debugging.

## Scope

- Source payload: `state.roomInfo`
- Main object: `state.roomInfo.data`
- Companion metadata: `state.roomInfo.extra`, `state.roomInfo.status_code`

## Priority Levels

- `P0` Critical: required for session identity, live state, and ingestion correctness.
- `P1` Important: high-value business and engagement data.
- `P2` Useful: context, segmentation, and UI/UX enrichment.
- `P3` Low: experimental, deprecated, or noisy fields.

## Canonical Model (Recommended Internal Shape)

```json
{
  "event": {
    "captured_at_ms": "extra.now",
    "status_code": "status_code",
    "log_id": "data.log_id"
  },
  "room": {
    "room_id": "data.id_str",
    "title": "data.title",
    "status": "data.status",
    "stream_status": "data.stream_status",
    "live_mode": "data.live_room_mode",
    "is_replay": "data.replay",
    "created_at": "data.create_time",
    "ended_at": "data.finish_time"
  },
  "owner": {
    "user_id": "data.owner.id_str",
    "sec_uid": "data.owner.sec_uid",
    "username": "data.owner.display_id",
    "nickname": "data.owner.nickname",
    "followers": "data.owner.follow_info.follower_count",
    "following": "data.owner.follow_info.following_count",
    "verified": "data.owner.verified"
  },
  "metrics": {
    "current_viewers": "data.user_count",
    "total_unique_viewers": "data.stats.total_user",
    "entries": "data.stats.enter_count",
    "new_follows": "data.stats.follow_count",
    "likes": "data.stats.like_count",
    "shares": "data.stats.share_count",
    "comments": "data.stats.comment_count",
    "replay_viewers": "data.stats.replay_viewers"
  },
  "features": {
    "chat_enabled": "data.room_auth.Chat",
    "gift_enabled": "data.room_auth.Gift",
    "like_enabled": "data.room_auth.Digg",
    "share_enabled": "data.room_auth.Share",
    "interaction_question_enabled": "data.room_auth.InteractionQuestion"
  },
  "stream": {
    "default_resolution": "data.stream_url.default_resolution",
    "available_resolutions": "data.stream_url.candidate_resolution",
    "hls_url": "data.stream_url.hls_pull_url",
    "flv_url_map": "data.stream_url.flv_pull_url"
  }
}
```

## Field Dictionary

| Path | Type | Priority | Why it matters | Use in |
|---|---|---:|---|---|
| `status_code` | number | P0 | Basic transport/response health | ingestion, retries |
| `extra.now` | number (ms) | P0 | Event capture time (clock source) | ordering, latency |
| `data.log_id` | string | P0 | Request/event correlation ID | debugging |
| `data.id_str` | string | P0 | Stable room identifier | PK, joins |
| `data.id` | number | P1 | Numeric room ID (may lose precision in JS) | low-level integrations |
| `data.status` | number | P0 | Core room lifecycle state | alerts, state machine |
| `data.stream_status` | number | P0 | Stream pipeline status | playback monitoring |
| `data.replay` | boolean | P1 | Replay vs live mode | segmentation |
| `data.create_time` | unix seconds | P1 | Session start time | duration |
| `data.finish_time` | unix seconds | P1 | Session end time | duration, close events |
| `data.title` | string | P1 | Live title | content analytics |
| `data.hashtag.title` | string | P2 | Topical classification | category dashboards |
| `data.game_tag[].show_name` | string[] | P2 | Game/topic tags | segmentation |
| `data.live_room_mode` | number | P2 | Live room mode variant | feature analysis |
| `data.owner.id_str` | string | P0 | Stable owner ID | PK, joins |
| `data.owner.sec_uid` | string | P1 | Global user key | dedupe, matching |
| `data.owner.display_id` | string | P1 | Username/handle | UI, notifications |
| `data.owner.nickname` | string | P1 | Display name | UI |
| `data.owner.verified` | boolean | P2 | Verification status | creator profiling |
| `data.owner.follow_info.follower_count` | number | P1 | Audience size baseline | creator metrics |
| `data.owner.follow_info.following_count` | number | P2 | Additional creator context | profiling |
| `data.user_count` | number | P0 | Current concurrent viewers | real-time dashboards |
| `data.stats.total_user` | number | P0 | Total unique entrants | reach analytics |
| `data.stats.enter_count` | number | P1 | Entry events count | funnel/retention |
| `data.stats.follow_count` | number | P1 | Follows gained in room | conversion |
| `data.stats.like_count` | number | P1 | Engagement signal | engagement score |
| `data.stats.share_count` | number | P1 | Viral/share signal | growth analytics |
| `data.stats.comment_count` | number | P1 | Chat activity signal | engagement score |
| `data.stats.replay_viewers` | number | P2 | Replay audience size | post-live analytics |
| `data.room_auth.Chat` | boolean | P1 | Chat enabled flag | feature gating |
| `data.room_auth.Gift` | boolean | P1 | Gifts enabled flag | monetization gating |
| `data.room_auth.Digg` | boolean | P1 | Likes enabled flag | interaction gating |
| `data.room_auth.Share` | boolean | P1 | Share enabled flag | growth gating |
| `data.room_auth.InteractionQuestion` | boolean | P2 | Interactive Q&A permission | feature UX |
| `data.stream_url.default_resolution` | string | P1 | Default quality selection | player defaults |
| `data.stream_url.candidate_resolution` | string[] | P1 | Available renditions | adaptive UI |
| `data.stream_url.hls_pull_url` | string | P1 | Main HLS URL | playback |
| `data.stream_url.flv_pull_url` | map | P1 | FLV URLs by rendition | fallback playback |
| `data.stream_url.rtmp_pull_url` | string | P2 | RTMP/FLV pull endpoint | specialized players |
| `data.top_fans[]` | array | P2 | Supporter ranking snapshot | fan features |
| `data.top_fans[].fan_ticket` | number | P2 | Contribution score | leaderboard |
| `data.commerce_info.commerce_permission` | number | P2 | Commerce capability | monetization features |
| `data.has_commerce_goods` | boolean | P2 | Commerce inventory present | shopping widgets |
| `data.share_url` | string | P2 | Share/deep-link URL | growth automations |

## Volatile/Noisy Fields (Do Not Persist Raw by Default)

- Signed URLs and query params (`sign`, `expire`, `refresh_token`) in stream and image links.
- `deprecated*` fields.
- AB or experiment blobs such as `room_create_ab_param`, `AnchorABMap`, `*_ab_*`.
- Large verbose nested payloads like `live_core_sdk_data.stream_data` unless explicitly needed.
- Full `badge_list`, `url_list`, and avatar variants unless your feature needs them.

## Privacy and Security Guidance

- Treat `owner.sec_uid` as sensitive identifier; mask or hash in broad analytics exports.
- Do not expose signed stream/image URLs in logs visible to end users.
- Prefer storing IDs and derived metrics over full raw user profile blobs.

## Suggested Derived Fields

- `is_live_now`: `status` and `stream_status` normalized into a boolean.
- `session_duration_sec`: `finish_time - create_time` when finalized.
- `engagement_rate_proxy`: `(like_count + comment_count + share_count) / max(total_user, 1)`.
- `follow_conversion_proxy`: `follow_count / max(total_user, 1)`.
- `has_stream_fallback`: true when both `hls_pull_url` and `flv_pull_url` exist.

## Minimal Ingestion Contract (If You Need to Start Lean)

If you need a minimal schema for phase 1, persist at least:

- `event.captured_at_ms`, `event.log_id`
- `room.room_id`, `room.status`, `room.stream_status`, `room.title`
- `owner.user_id`, `owner.username`
- `metrics.current_viewers`, `metrics.total_unique_viewers`, `metrics.new_follows`
- `stream.hls_url`, `stream.default_resolution`

This keeps the pipeline small while preserving the most actionable data.
