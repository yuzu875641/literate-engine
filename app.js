const express = require('express');
const app = express();
app.use(express.json());

const { handleCommands } = require('./commands');
const { initializeStats, scheduleDailyReset } = require('./helpers');

// グローバル変数
const userWarningCount = {};
const member_backup = {};
const urlCheckStatus = {};
const NO_URL_CHECK_ROOMS = [
  395403065
];

// 新しいメッセージカウンター
let roomMessageCounts = {};
let lastUpdateTime = null;

// ボット起動時に処理を開始
(async () => {
  const result = await initializeStats();
  if (result) {
    scheduleDailyReset();
  }
})();

// ウェブフックのエンドポイント
app.post('/webhook', async (req, res) => {
  const webhookEvent = req.body.webhook_event;
  if (!webhookEvent) {
    console.error("Invalid webhook payload received.");
    return res.status(400).send("Bad Request: Invalid payload");
  }

  const { account_id: accountId, body, room_id: roomId, message_id: messageId } = webhookEvent;

  // Webhookを受け取った部屋のメッセージカウントを+1
  if (roomMessageCounts[roomId] !== undefined) {
    roomMessageCounts[roomId] += 1;
  } else {
    // もし存在しなければ、初期値として1を設定
    roomMessageCounts[roomId] = 1;
  }

  await handleCommands({
    accountId,
    body,
    roomId,
    messageId,
    userWarningCount,
    member_backup,
    urlCheckStatus,
    roomMessageCounts, // リアルタイムカウンターを渡す
    lastUpdateTime,
    NO_URL_CHECK_ROOMS
  });

  return res.sendStatus(200);
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
