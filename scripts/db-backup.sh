#!/bin/sh
# Unimatcha 每日备份：Postgres 逻辑备份 + uploads 用户文件 + .env 副本。
# 本地轮转；配置了 rclone remote「offsite:」则整目录幂等同步异地（自带补传），否则大声警告。
# 由 /etc/cron.d/unimatcha-backup 每日调用（安装/恢复步骤见 DEPLOY.md 6.8）。
set -eu

BACKUP_DIR=/opt/backups/unimatcha
KEEP_DAYS=14   # find -mtime +N 语义=删「满 N+1 整天」的文件，实际本地保留 15~16 份
ENV_FILE=/opt/unimatcha/.env
OFFSITE_REMOTE=offsite:unimatcha-backups
UPLOADS_VOLUME=unimatcha_uploads_data

# 并发锁：手动跑与 cron 撞车会交错写同一文件名，产出静默损坏的备份
exec 9>/var/lock/unimatcha-backup.lock
flock -n 9 || { echo "[backup] another run in progress, skipping" >&2; exit 1; }

STAMP=$(date -u +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# 中断（set -e）时清掉本轮半截产物：恢复演练与灾难恢复都按「最新文件」取，
# 绝不能让 0 字节/截断的 dump 成为目录里最新的那个。.part 后缀 + 原子 mv 双保险。
cleanup_partials() { rm -f "$BACKUP_DIR/db-$STAMP.dump.part" "$BACKUP_DIR/uploads-$STAMP.tar.gz.part"; }
trap cleanup_partials EXIT

# uploads 卷必须已存在：docker run -v 对不存在的卷会静默新建空卷 → 天天备份空 tar 还显示成功
docker volume inspect "$UPLOADS_VOLUME" >/dev/null

# 1) Postgres：custom 格式（自带压缩，pg_restore 支持选表恢复）。
#    pg_dump 走 MVCC 快照，运行中备份数据一致，无需停库。
docker exec unimatcha_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP_DIR/db-$STAMP.dump.part"
[ -s "$BACKUP_DIR/db-$STAMP.dump.part" ] || { echo "[backup] EMPTY db dump, aborting" >&2; exit 1; }
# 产物必须可解析（只读 TOC，毫秒级）：[ -s ] 挡得住空文件，挡不住截断
docker run --rm -i postgres:16-alpine pg_restore -l >/dev/null \
  < "$BACKUP_DIR/db-$STAMP.dump.part"
mv "$BACKUP_DIR/db-$STAMP.dump.part" "$BACKUP_DIR/db-$STAMP.dump"
chmod 600 "$BACKUP_DIR/db-$STAMP.dump"

# 2) uploads 卷（头像/帖子图片只存在这台机上，和数据库同级重要）
docker run --rm -v "$UPLOADS_VOLUME":/data:ro postgres:16-alpine \
  tar czf - -C /data . > "$BACKUP_DIR/uploads-$STAMP.tar.gz.part"
mv "$BACKUP_DIR/uploads-$STAMP.tar.gz.part" "$BACKUP_DIR/uploads-$STAMP.tar.gz"
chmod 600 "$BACKUP_DIR/uploads-$STAMP.tar.gz"

# 3) .env 副本（密钥/SMTP 凭据；丢了它恢复出的站点起不来）
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$BACKUP_DIR/env-$STAMP"
  chmod 600 "$BACKUP_DIR/env-$STAMP"
else
  echo "[backup] WARNING: $ENV_FILE missing — backup has no env copy, restore will lack secrets" >&2
fi

# 4) 本地轮转
find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tar.gz' -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'env-*' -mtime +$KEEP_DAYS -delete

# 5) 异地：整目录幂等同步（rclone copy 跳过已存在文件 → 前几天上传失败的会自动补传）。
#    配置后务必用 cron 同款环境验一次：env -i PATH=/usr/bin:/bin HOME=/root sh scripts/db-backup.sh
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q '^offsite:'; then
  rclone copy "$BACKUP_DIR" "$OFFSITE_REMOTE/" \
    --include 'db-*.dump' --include 'uploads-*.tar.gz' --include 'env-*'
  rclone delete --min-age "${KEEP_DAYS}d" "$OFFSITE_REMOTE/" 2>/dev/null || true
  echo "[backup] $STAMP ok (local + offsite)"
else
  echo "[backup] $STAMP ok — LOCAL ONLY: rclone offsite remote 不可用（未安装/未配置/cron 环境读不到配置）。服务器整机没了备份就跟着没了" >&2
fi
