#!/bin/sh
# Unimatcha 每日备份：Postgres 逻辑备份 + uploads 用户文件 + .env 副本。
# 本地轮转 KEEP_DAYS 天；配置了 rclone remote「offsite:」则同步异地，否则大声警告但本地照常成功。
# 由 /etc/cron.d/unimatcha-backup 每日调用（安装步骤见 DEPLOY.md「备份与恢复」）。
set -eu

STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP_DIR=/opt/backups/unimatcha
KEEP_DAYS=14
ENV_FILE=/opt/unimatcha/.env
OFFSITE_REMOTE=offsite:unimatcha-backups

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# 1) Postgres：custom 格式（自带压缩，pg_restore 支持选表恢复）。
#    pg_dump 走 MVCC 快照，运行中备份数据一致，无需停库。
docker exec unimatcha_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP_DIR/db-$STAMP.dump"
chmod 600 "$BACKUP_DIR/db-$STAMP.dump"
# 空 dump = pg_dump 其实失败了（例如容器没起）。set -e 挡非零退出，这里挡「成功但空产物」。
[ -s "$BACKUP_DIR/db-$STAMP.dump" ] || { echo "[backup] EMPTY db dump, aborting" >&2; exit 1; }

# 2) uploads 卷（头像/帖子图片只存在这台机上，和数据库同级重要）。
#    用现成的 postgres:16-alpine 镜像打 tar，避免为备份多拉一个镜像。
docker run --rm -v unimatcha_uploads_data:/data:ro postgres:16-alpine \
  tar czf - -C /data . > "$BACKUP_DIR/uploads-$STAMP.tar.gz"
chmod 600 "$BACKUP_DIR/uploads-$STAMP.tar.gz"

# 3) .env 副本（密钥/SMTP 凭据；丢了它恢复出的站点起不来）。
#    敏感级与 DB dump 相同，一并 600 + 私有 bucket；异地建议配 rclone crypt。
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$BACKUP_DIR/env-$STAMP"
  chmod 600 "$BACKUP_DIR/env-$STAMP"
fi

# 4) 本地轮转（-mtime +N = 早于 N 天前的）
find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tar.gz' -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'env-*' -mtime +$KEEP_DAYS -delete

# 5) 异地上传（rclone remote 名固定 offsite，配置步骤见 DEPLOY.md）
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q '^offsite:'; then
  rclone copyto "$BACKUP_DIR/db-$STAMP.dump" "$OFFSITE_REMOTE/db/db-$STAMP.dump"
  rclone copyto "$BACKUP_DIR/uploads-$STAMP.tar.gz" "$OFFSITE_REMOTE/uploads/uploads-$STAMP.tar.gz"
  [ -f "$BACKUP_DIR/env-$STAMP" ] && rclone copyto "$BACKUP_DIR/env-$STAMP" "$OFFSITE_REMOTE/env/env-$STAMP"
  # 异地轮转：只留最近 KEEP_DAYS 天
  rclone delete --min-age "${KEEP_DAYS}d" "$OFFSITE_REMOTE/db/" 2>/dev/null || true
  rclone delete --min-age "${KEEP_DAYS}d" "$OFFSITE_REMOTE/uploads/" 2>/dev/null || true
  rclone delete --min-age "${KEEP_DAYS}d" "$OFFSITE_REMOTE/env/" 2>/dev/null || true
  echo "[backup] $STAMP ok (local + offsite)"
else
  echo "[backup] $STAMP ok — LOCAL ONLY, offsite remote not configured (server dies = backups die with it)" >&2
fi
