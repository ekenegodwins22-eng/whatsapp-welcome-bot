import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const {
  DASHBOARD_URL,
  BOT_SHARED_SECRET,
  USER_ID,
  PHONE_NUMBER,
  AUTH_DIR = "./auth",
} = process.env;

if (!DASHBOARD_URL || !BOT_SHARED_SECRET || !USER_ID || !PHONE_NUMBER) {
  console.error(
    "Missing env: DASHBOARD_URL, BOT_SHARED_SECRET, USER_ID, PHONE_NUMBER are required.",
  );
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "x-bot-secret": BOT_SHARED_SECRET,
};

async function reportStatus(status, extra = {}) {
  try {
    await fetch(`${DASHBOARD_URL}/api/public/bot/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id: USER_ID,
        status,
        phone_number: PHONE_NUMBER,
        ...extra,
      }),
    });
  } catch (e) {
    console.error("status report failed", e.message);
  }
}

// --- Auth state persistence: load from server on boot, push on every update.
async function downloadAuthState() {
  if (!existsSync(AUTH_DIR)) await mkdir(AUTH_DIR, { recursive: true });
  try {
    const r = await fetch(
      `${DASHBOARD_URL}/api/public/bot/session?user_id=${USER_ID}`,
      { headers },
    );
    if (!r.ok) return;
    const json = await r.json();
    if (!json.auth_state) return;
    for (const [name, content] of Object.entries(json.auth_state)) {
      await writeFile(path.join(AUTH_DIR, name), content, "utf8");
    }
    console.log("Restored auth state from server");
  } catch (e) {
    console.error("downloadAuthState failed", e.message);
  }
}

async function uploadAuthState() {
  try {
    if (!existsSync(AUTH_DIR)) return;
    const files = await readdir(AUTH_DIR);
    const blob = {};
    for (const f of files) {
      blob[f] = await readFile(path.join(AUTH_DIR, f), "utf8");
    }
    await fetch(`${DASHBOARD_URL}/api/public/bot/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id: USER_ID,
        auth_state: blob,
        phone_number: PHONE_NUMBER,
      }),
    });
  } catch (e) {
    console.error("uploadAuthState failed", e.message);
  }
}

async function start() {
  await downloadAuthState();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.appropriate("Chrome"),
  });

  // Pairing code login if not registered yet
  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PHONE_NUMBER.replace(/\D/g, ""));
        const formatted = code?.match(/.{1,4}/g)?.join("-") ?? code;
        console.log("\n=== WhatsApp pairing code:", formatted, "===\n");
        await reportStatus("pairing", { pairing_code: formatted });
      } catch (e) {
        console.error("requestPairingCode failed", e);
      }
    }, 2500);
  }

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    await uploadAuthState();
  });

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    console.log("connection:", connection);
    if (connection === "open") {
      await reportStatus("connected", { pairing_code: null });
    } else if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      await reportStatus("disconnected");
      if (code !== DisconnectReason.loggedOut) {
        console.log("reconnecting in 3s…");
        setTimeout(start, 3000);
      } else {
        console.log("Logged out. Delete auth dir and restart to re-pair.");
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
      const displayName = m.pushName || null;

      try {
        const r = await fetch(`${DASHBOARD_URL}/api/public/bot/incoming`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            user_id: USER_ID,
            phone,
            body: text,
            display_name: displayName,
          }),
        });
        const data = await r.json();
        if (data.reply) {
          await sock.sendMessage(jid, { text: data.reply });
          console.log(`→ replied to ${phone} (${data.reason})`);
        } else {
          console.log(`✓ ignored ${phone} (${data.reason})`);
        }
      } catch (e) {
        console.error("incoming handler failed", e.message);
      }
    }
  });
}

start().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
