#!/usr/bin/env bash
#
# 方案 A：把匹配调度设成"每周日公布"（或你指定的 cron）。
# 改完后端会立即生效（updateConfig 内部会调 syncCronFromDB），无需重启。
#
# 用法：
#   ADMIN_TOKEN=你的管理员token \
#   API=https://你的后端地址        (可能需要带 /api 前缀，如 https://xxx/api) \
#   ./scripts/set-weekly-schedule.sh
#
# 可选覆盖（都有默认值）：
#   CRON='0 20 * * 0'      每周日20:00   （0=周日；'0 17 * * 5'=每周五17:00）
#   TZ='Europe/London'     时区          （国内用 Asia/Shanghai）
#   DESC='每周日20:00公布本轮匹配结果'
#
set -euo pipefail

API="${API:-http://localhost:3000}"
CRON="${CRON:-0 20 * * 0}"
TZ="${TZ:-Europe/London}"
DESC="${DESC:-每周日20:00公布本轮匹配结果}"
: "${ADMIN_TOKEN:?请先设置 ADMIN_TOKEN（管理员登录后拿到的 JWT）}"

echo "→ 设置匹配调度：cron='$CRON' tz='$TZ'  @ $API"
curl -sS -X PUT "$API/admin/matching/config" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"cronExpr\":\"$CRON\",\"isEnabled\":true,\"timezone\":\"$TZ\",\"description\":\"$DESC\"}"
echo

echo "→ 复核当前配置："
curl -sS "$API/admin/matching/config" -H "Authorization: Bearer $ADMIN_TOKEN"
echo
echo "完成。下一个匹配将在 cron='$CRON'（$TZ）触发；也可 POST $API/admin/matching/jobs/trigger 立即手动跑一次测试。"
