#!/bin/sh
# 恢复演练：把最新的 db dump 恢复进一次性 Postgres 容器，与生产计数并排对照后自清。
# 不触碰生产库。建议每月跑一次——没验证过的备份等于没有备份。
set -eu

BACKUP_DIR=/opt/backups/unimatcha
DRILL=unimatcha_restore_drill

# 无论成功失败都清掉容器**和它的匿名卷**（-v）：postgres 镜像声明了 VOLUME，
# 不带 -v 的 rm 会在 /var/lib/docker/volumes 留一份恢复自生产 dump 的全量数据副本。
trap 'docker rm -f -v "$DRILL" >/dev/null 2>&1 || true' EXIT

LATEST=$(ls -1t "$BACKUP_DIR"/db-*.dump 2>/dev/null | head -1)
[ -n "$LATEST" ] || { echo "[drill] no dump found in $BACKUP_DIR" >&2; exit 1; }
echo "[drill] restoring: $LATEST"

# 备份新鲜度：最新 dump 超过 48h = cron 很可能已静默停摆，演练是唯一能发现它的机会
if ! find "$LATEST" -mtime -2 | grep -q .; then
  echo "[drill] WARNING: latest dump is older than 48h — check cron /etc/cron.d/unimatcha-backup and /var/log/unimatcha-backup.log" >&2
fi
# 动手前先确认 dump 可解析（只读 TOC）
docker run --rm -i postgres:16-alpine pg_restore -l >/dev/null < "$LATEST" \
  || { echo "[drill] latest dump is unreadable/corrupt: $LATEST" >&2; exit 1; }

docker rm -f -v "$DRILL" >/dev/null 2>&1 || true
docker run -d --name "$DRILL" \
  -e POSTGRES_USER=drill -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill \
  postgres:16-alpine >/dev/null

# 等库就绪：官方镜像首启会先起一个临时实例做初始化再重启正式实例，
# 单次 pg_isready 会在临时实例阶段假就绪——要求连续两次成功
ok=0; i=0
while [ $ok -lt 2 ]; do
  i=$((i+1)); [ $i -gt 40 ] && { echo "[drill] postgres not ready" >&2; exit 1; }
  if docker exec "$DRILL" pg_isready -U drill >/dev/null 2>&1; then ok=$((ok+1)); else ok=0; fi
  sleep 1
done

# --no-owner/--no-privileges：生产 owner 是 campuslove，一次性库用 drill 用户恢复
RESTORE_RC=0
docker exec -i "$DRILL" pg_restore -U drill -d drill --no-owner --no-privileges \
  < "$LATEST" || RESTORE_RC=$?

echo "[drill] === 核验（左=演练恢复库 / 右=生产实时库）==="
for Q in \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" \
  "SELECT count(*) FROM users" \
  "SELECT count(*) FROM square_posts" \
  "SELECT count(*) FROM messages" \
  "SELECT count(*) FROM matches" \
  "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1" \
; do
  D=$(docker exec "$DRILL" psql -U drill -d drill -tAc "$Q" 2>/dev/null || echo 'ERR')
  P=$(docker exec unimatcha_postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"$Q\"" 2>/dev/null || echo 'ERR')
  printf '  %-14s drill=%-24s prod=%s\n' "$(echo "$Q" | grep -oE 'FROM [a-z_.]+' | cut -d' ' -f2)" "$D" "$P"
done

if [ "$RESTORE_RC" -ne 0 ]; then
  echo "[drill] NOTE: pg_restore 退出码 $RESTORE_RC（上方有报错），请回看是否只是可忽略的权限/扩展噪音" >&2
fi
echo "[drill] done（演练库为备份时点快照，与生产的差异应只反映备份之后的新数据）"
