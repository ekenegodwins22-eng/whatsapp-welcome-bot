import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { mkdir, readdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const {
  DASHBOARD_URL,
  BOT_SHARED_SECRET,
  AUTH_ROOT = "./auth",
  POLL_MS = "5000",
} = process.env;

if (!DASHBOARD_URL || !BOT_SHARED_SECRET) {
  console.error("Missing env: DASHBOARD_URL and BOT_SHARED_SECRET are required.");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "x-bot-secret": BOT_SHARED_SECRET,
};
const apiBase = DASHBOARD_URL.replace(/\/+$/, "").replace(/\/dashboard$/, "");

// user_id -> { sock, authDir, paired, pairingPhone }
const sessions = new Map();

async function reportStatus(user_id, status, extra = {}) {
  try {
    await fetch(`${apiBase}/api/public/bot/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ user_id, status, ...extra }),
    });
  } catch (e) {
    console.error(`[${user_id}] status report failed`, e.message);
  }
}

async function fetchSession(user_id) {
  try {
    const r = await fetch(
      `${apiBase}/api/public/bot/session?user_id=${user_id}`,
      { headers },
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchPending() {
  try {
    const r = await fetch(`${apiBase}/api/public/bot/pending`, { headers });
    if (!r.ok) return [];
    const j = await r.json();
    return j.users ?? [];
  } catch (e) {
    console.error("fetchPending failed", e.message);
    return [];
  }
}

async function downloadAuthState(user_id, authDir) {
  if (!existsSync(authDir)) await mkdir(authDir, { recursive: true });
  const json = await fetchSession(user_id);
  if (!json?.auth_state) return;
  for (const [name, content] of Object.entries(json.auth_state)) {
    await writeFile(path.join(authDir, name), content, "utf8");
  }
}

async function uploadAuthState(user_id, authDir, phoneNumber) {
  try {
    if (!existsSync(authDir)) return;
    const files = await readdir(authDir);
    const blob = {};
    for (const f of files) {
      const fp = path.join(authDir, f);
      const s = await stat(fp);
      if (!s.isFile()) continue;
      blob[f] = await readFile(fp, "utf8");
    }
    await fetch(`${apiBase}/api/public/bot/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id,
        auth_state: blob,
        phone_number: phoneNumber ?? null,
      }),
    });
  } catch (e) {
    console.error(`[${user_id}] uploadAuthState failed`, e.message);
  }
}

async function clearAuthState(user_id, authDir) {
  await rm(authDir, { recursive: true, force: true });
  try {
    await fetch(`${apiBase}/api/public/bot/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({ user_id, auth_state: null, phone_number: null }),
    });
  } catch {}
}

async function startSession(user_id, pairingPhoneHint) {
  if (sessions.has(user_id)) return;
  const authDir = path.join(AUTH_ROOT, user_id);
  const entry = { sock: null, authDir, paired: false, pairingPhone: pairingPhoneHint ?? null };
  sessions.set(user_id, entry);

  try {
    await downloadAuthState(user_id, authDir);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "warn" }),
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.appropriate("Chrome"),
    });
    entry.sock = sock;
    entry.paired = !!sock.authState.creds.registered;

    if (!entry.paired && pairingPhoneHint) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(pairingPhoneHint);
          const formatted = code?.match(/.{1,4}/g)?.join("-") ?? code;
          console.log(`[${user_id}] pairing code:`, formatted);
          await reportStatus(user_id, "pairing", {
            pairing_code: formatted,
            phone_number: pairingPhoneHint,
            last_error: null,
          });
        } catch (e) {
          console.error(`[${user_id}] requestPairingCode failed`, e);
          await reportStatus(user_id, "disconnected", {
            pairing_code: null,
            last_error: String(e?.message ?? e),
          });
          sessions.delete(user_id);
        }
      }, 2000);
    } else if (entry.paired) {
      await reportStatus(user_id, "connecting", { last_error: null });
    }

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      await uploadAuthState(user_id, authDir, entry.pairingPhone);
    });

    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
      console.log(`[${user_id}] connection:`, connection);
      if (connection === "open") {
        const me = sock.user?.id?.split(":")[0]?.split("@")[0] ?? entry.pairingPhone;
        entry.paired = true;
        await reportStatus(user_id, "connected", {
          pairing_code: null,
          phone_number: me,
          last_error: null,
        });
      } else if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const msg = lastDisconnect?.error?.message ?? null;
        sessions.delete(user_id);
        if (code === DisconnectReason.loggedOut) {
          console.log(`[${user_id}] Logged out, clearing.`);
          await clearAuthState(user_id, authDir);
          await reportStatus(user_id, "disconnected", {
            pairing_code: null,
            last_error: "Logged out from phone",
          });
        } else {
          await reportStatus(user_id, "disconnected", {
            last_error: msg,
          });
          // The pending poller will restart paired sessions automatically.
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        if (m.key.fromMe) continue;
        const jid = m.key.remoteJid;
        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
        const text =
          m.message?.conversation ||
          m.message?.extendedTextMessage?.text ||
          m.message?.imageMessage?.caption ||
          m.message?.videoMessage?.caption ||
          "";
        if (!text) continue;
        const phone = jid.split("@")[0];
        try {
          const r = await fetch(`${apiBase}/api/public/bot/incoming`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              user_id,
              phone,
              body: text,
              display_name: m.pushName || null,
            }),
          });
          const data = await r.json();
          if (data.reply) {
            await sock.sendMessage(jid, { text: data.reply });
            console.log(`[${user_id}] → replied to ${phone} (${data.reason})`);
          }
        } catch (e) {
          console.error(`[${user_id}] incoming handler failed`, e.message);
        }
      }
    });
  } catch (e) {
    console.error(`[${user_id}] startSession failed`, e);
    await reportStatus(user_id, "disconnected", { last_error: String(e?.message ?? e) });
    sessions.delete(user_id);
  }
}

async function stopSession(user_id, { logout } = { logout: false }) {
  const entry = sessions.get(user_id);
  if (!entry) return;
  try {
    if (logout) await entry.sock?.logout();
    else entry.sock?.end?.(undefined);
  } catch {}
  sessions.delete(user_id);
  if (logout) {
    await clearAuthState(user_id, entry.authDir);
    await reportStatus(user_id, "disconnected", {
      pairing_code: null,
      last_error: null,
    });
  }
}

async function reconcile() {
  const users = await fetchPending();
  const seen = new Set();
  for (const u of users) {
    seen.add(u.user_id);
    if (u.status === "logout_requested") {
      await stopSession(u.user_id, { logout: true });
      continue;
    }
    if (u.status === "pair_requested" && u.phone_number) {
      // Restart pairing: drop any existing session, start fresh with the phone.
      const existing = sessions.get(u.user_id);
      if (existing) {
        try { existing.sock?.end?.(undefined); } catch {}
        sessions.delete(u.user_id);
      }
      // Clear stale auth so we get a fresh pairing code.
      const dir = path.join(AUTH_ROOT, u.user_id);
      if (!u.has_auth_state) await rm(dir, { recursive: true, force: true });
      await startSession(u.user_id, u.phone_number.replace(/\D/g, ""));
      continue;
    }
    if (u.has_auth_state && !sessions.has(u.user_id)) {
      await startSession(u.user_id);
    }
  }
}

async function loop() {
  while (true) {
    try { await reconcile(); } catch (e) { console.error("reconcile error", e.message); }
    await new Promise((r) => setTimeout(r, parseInt(POLL_MS, 10) || 5000));
  }
}

console.log(`AwayBot worker started. Dashboard: ${apiBase}`);
loop().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
