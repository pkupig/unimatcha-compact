#!/bin/sh
# 恢复演练：把最新的 db dump 恢复进一次性 Postgres 容器并做基本核验，然后清理。
# 不触碰生产库。建议每月跑一次——没验证过的备份等于没有备份。
set -eu

BACKUP_DIR=/opt/backups/unimatcha
LATEST=$(ls -1t "$BACKUP_DIR"/db-*.dump 2>/dev/null | head -1)
[ -n "$LATEST" ] || { echo "[drill] no dump found in $BACKUP_DIR" >&2; exit 1; }
echo "[drill] restoring: $LATEST"

docker rm -f unimatcha_restore_drill >/dev/null 2>&1 || true
docker run -d --name unimatcha_restore_drill \
  -e POSTGRES_USER=drill -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill \
  postgres:16-alpine >/dev/null

# 等库就绪（最多 ~30s）
i=0
until docker exec unimatcha_restore_drill pg_isready -U drill >/dev/null 2>&1; do
  i=$((i+1)); [ $i -gt 30 ] && { echo "[drill] postgres not ready" >&2; exit 1; }
  sleep 1
done

# --no-owner/--no-privileges：生产 owner 是 campuslove，一次性库用 drill 用户恢复
docker exec -i unimatcha_restore_drill pg_restore -U drill -d drill --no-owner --no-privileges \
  < "$LATEST" || { echo "[drill] pg_restore reported errors above" >&2; }

echo "[drill] === 核验（与生产对照）==="
docker exec unimatcha_restore_drill psql -U drill -d drill -tc \
  "SELECT 'tables: ' || count(*) FROM information_schema.tables WHERE table_schema='public'"
docker exec unimatcha_restore_drill psql -U drill -d drill -tc \
  "SELECT 'users: ' || count(*) FROM users"
docker exec unimatcha_restore_drill psql -U drill -d drill -tc \
  "SELECT 'migration: ' || migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1"
docker exec unimatcha_restore_drill psql -U drill -d drill -tc \
  "SELECT 'square_posts: ' || count(*) FROM square_posts"

docker rm -f unimatcha_restore_drill >/dev/null
echo "[drill] done, drill container removed"
