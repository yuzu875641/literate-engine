const express = require('express');
const app = express();
app.use(express.json());

// commands.js から handleCommands をインポート
const { handleCommands } = require('./commands');

// 新しい Supabase 用のヘルパー関数群をインポート
const { save } = require('./supabase_helpers');

const userWarningCount = {};
const member_backup = {};
const urlCheckStatus = {};
const NO_URL_CHECK_ROOMS = [
  395403065
];

// 起動時に統計データをSupabaseに保存する処理
// これが新しい「リセット」の開始点になります
// 毎日午前0時に実行されるように、cronなどでこの処理を呼び出すことを推奨
(async () => {
  await save();
})();

// ウェブフックのエンドポイント
app.post('/webhook', async (req, res) => {
  const webhookEvent = req.body.webhook_event;
  if (!webhookEvent) {
    console.error("Invalid webhook payload received.");
    return res.status(400).send("Bad Request: Invalid payload");
  }

  const { account_id: accountId, body, room_id: roomId, message_id: messageId } = webhookEvent;

  await handleCommands({
    accountId,
    body,
    roomId,
    messageId,
    userWarningCount,
    member_backup,
    urlCheckStatus,
    NO_URL_CHECK_ROOMS
  });

  return res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
