const express = require('express');
const app = express();
app.use(express.json());

const { handleCommands } = require('./commands');
const { getChatworkRoomlist, initializeStats, scheduleDailyReset } = require('./helpers');

// グローバル変数
const userWarningCount = {};
const member_backup = {};
const urlCheckStatus = {};
const BLACKLISTED_DOMAINS = [
  'malicious-site.com',
  'phishing-example.net',
  'inappropriate-content.xyz'
];
const NO_URL_CHECK_ROOMS = [
  395403065,
];

// インメモリ統計データ (グローバルスコープに置く)
let initialRoomStats = [];
let lastUpdateTime = null;

// ボット起動時に処理を開始
(async () => {
  // 初期化処理はhelpers.jsから呼び出す
  await initializeStats(initialRoomStats, lastUpdateTime, getChatworkRoomlist);
  scheduleDailyReset(initialRoomStats, lastUpdateTime, getChatworkRoomlist);
})();


// ウェブフックのエンドポイント
app.post('/webhook', async (req, res) => {
  const webhookEvent = req.body.webhook_event;
  if (!webhookEvent) {
    console.error("Invalid webhook payload received.");
    return res.status(400).send("Bad Request: Invalid payload");
  }

  const { account_id: accountId, body, room_id: roomId, message_id: messageId } = webhookEvent;

  // コマンド処理をcommands.jsに委譲
  await handleCommands({
    accountId,
    body,
    roomId,
    messageId,
    userWarningCount,
    member_backup,
    urlCheckStatus,
    initialRoomStats,
    lastUpdateTime,
    BLACKLISTED_DOMAINS,
    NO_URL_CHECK_ROOMS
  });

  return res.sendStatus(200);
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
