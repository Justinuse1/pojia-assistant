#!/usr/bin/env python3
# agent -> TG 项目群 通知器。用法: python notify.py <agent名> <消息>
# 凭证读 pojia-assistant/.env 的 TG_BOT_TOKEN / TG_PROJECT_CHAT_ID; 未配置则跳过, 永不阻塞主流程
import sys, json, urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
env = {}
for p in (root / ".env", Path.home() / ".hermes" / ".env"):
    if p.exists():
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()

token = env.get("TG_BOT_TOKEN") or env.get("TELEGRAM_BOT_TOKEN")
chat = env.get("TG_PROJECT_CHAT_ID")
if not token or not chat:
    print("notify: TG_BOT_TOKEN/TG_PROJECT_CHAT_ID not set, skip")
    sys.exit(0)

who = sys.argv[1] if len(sys.argv) > 1 else "agent"
text = sys.argv[2] if len(sys.argv) > 2 else "(empty)"
data = json.dumps({"chat_id": chat, "text": f"[{who}] {text}"}).encode()
req = urllib.request.Request(
    f"https://api.telegram.org/bot{token}/sendMessage",
    data=data, headers={"Content-Type": "application/json"})
try:
    urllib.request.urlopen(req, timeout=15)
    print("notify: sent")
except Exception as e:
    print(f"notify: failed {e}")
