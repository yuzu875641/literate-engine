const express = require('express');
const axios = require('axios');
const fs = require('fs'); // 通常のfsモジュール
const fsp = require('fs').promises; // fs.promisesモジュール
const path = require('path');
const FormData = require('form-data');
const app = express();
app.use(express.json());

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;
const ADMIN_ACCOUNT_ID = 10617115; // 管理者として無視するアカウントID

const EMOJI_LIST = [
  ':)', ':(', ':D', '8-)', ':o', ';)', ':(', '(sweat)', ':|', ':*', ':p', '(blush)',
  ':^)', '|-)', '(inlove)', ']:)', '(talk)', '(yawn)', '(puke)', '(emo)', '8-|', ':#',
  '(nod)', '(shake)', '(^^;)', '(whew)', '(clap)', '(bow)', '(roger)', '(flex)',
  '(dance)', ':/', '(gogo)', '(think)', '(please)', '(quick)', '(anger)', '(devil)',
  '(lightbulb)', '(*)', '(h)', '(F)', '(cracker)', '(eat)', '(^)', '(coffee)', '(beer)',
  '(handshake)', '(y)'
];

// ウェブフックのエンドポイント
app.post('/webhook', async (req, res) => {
  const webhookEvent = req.body.webhook_event;
  if (!webhookEvent) {
    console.error("Invalid webhook payload received.");
    return res.status(400).send("Bad Request: Invalid payload");
  }

  const { account_id: accountId, body, room_id: roomId, message_id: messageId } = webhookEvent;

  // 管理者からのメッセージは無視
  if (accountId === ADMIN_ACCOUNT_ID) {
    console.log(`管理者からのメッセージを受信しました: ${accountId}`);
    return res.sendStatus(200);
  }

  // [toall]が含まれていたら権限を閲覧に変更
  if (body.includes('[toall]')) {
    console.log(`[toall]が含まれています。ユーザーの権限を閲覧に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'readonly');
      return res.sendStatus(200);
    } catch (error) {
      console.error("[toall]処理でエラー:", error);
      return res.sendStatus(500);
    }
  }

  // 絵文字が15個以上含まれていたら権限を閲覧に変更
  const emojiCount = countEmojis(body, EMOJI_LIST);
  if (emojiCount >= 15) {
    console.log(`絵文字が15個以上含まれています (${emojiCount}個)。ユーザーの権限を閲覧に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'readonly');
      return res.sendStatus(200);
    } catch (error) {
      console.error("絵文字処理でエラー:", error);
      return res.sendStatus(500);
    }
  }

  // 「画像送ってみて」という投稿に反応する
  if (body === '画像送ってみて') {
    console.log(`「画像送ってみて」メッセージを受信しました。roomId: ${roomId}, accountId: ${accountId}`);
    try {
      const filePath = await downloadRandomImage();
      const fileId = await uploadImageToChatwork(filePath, roomId);
      await sendFileReply(fileId, { accountId, roomId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("画像送信処理でエラーが発生:", error);
      return res.sendStatus(500);
    }
  }

  // それ以外のメッセージには何もしない
  console.log(`その他のメッセージを受信しました: ${body}`);
  return res.sendStatus(200);
});

// --- 新しい機能 ---

/**
 * メッセージ内の特定の絵文字の数をカウントします。
 */
function countEmojis(text, emojiList) {
  let count = 0;
  for (const emoji of emojiList) {
    const regex = new RegExp(emoji, 'g');
    const matches = text.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

/**
 * メンバーの権限を、送信者のみを閲覧に変更します。
 */
async function changeMemberPermission(roomId, accountId, newRole) {
  try {
    // 1. 現在のメンバーリストを取得
    const response = await axios.get(
      `https://api.chatwork.com/v2/rooms/${roomId}/members`, {
        headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN }
      }
    );
    const members = response.data;

    // 2. 権限ごとにメンバーを振り分け
    const adminIds = members.filter(m => m.role === 'admin' && m.account_id !== accountId).map(m => m.account_id);
    const memberIds = members.filter(m => m.role === 'member' && m.account_id !== accountId).map(m => m.account_id);
    const readonlyIds = members.filter(m => m.role === 'readonly' && m.account_id !== accountId).map(m => m.account_id);

    // 送信者を新しい権限リストに追加
    if (newRole === 'admin') adminIds.push(accountId);
    if (newRole === 'member') memberIds.push(accountId);
    if (newRole === 'readonly') readonlyIds.push(accountId);
    
    // 3. 更新されたメンバーリストを送信して権限を変更
    await axios.put(
      `https://api.chatwork.com/v2/rooms/${roomId}/members`,
      new URLSearchParams({
        members_admin_ids: adminIds.join(','),
        members_member_ids: memberIds.join(','),
        members_readonly_ids: readonlyIds.join(','),
      }),
      {
        headers: {
          'X-ChatWorkToken': CHATWORK_API_TOKEN,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    console.log(`アカウントID ${accountId} の権限を ${newRole} に変更しました。`);
  } catch (error) {
    console.error("メンバー権限変更エラー:", error.response?.data || error.message);
    throw error;
  }
}


// --- 既存の機能（変更なし） ---

/**
 * ランダムな画像をダウンロードし、一時ファイルとして保存します。
 */
async function downloadRandomImage() {
  const imageUrl = 'https://pic.re/image';
  const filePath = path.join('/tmp', `image_${Date.now()}.jpg`);
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await fsp.writeFile(filePath, response.data);
    console.log("画像ダウンロード成功:", filePath);
    return filePath;
  } catch (error) {
    console.error("画像ダウンロードエラー:", error);
    throw error;
  }
}

/**
 * 一時ファイルをChatworkにアップロードし、ファイルを削除します。
 */
async function uploadImageToChatwork(filePath, roomId) {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    const response = await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/files`,
      formData,
      {
        headers: { ...formData.getHeaders(), 'X-ChatWorkToken': CHATWORK_API_TOKEN },
      }
    );
    console.log("ファイルアップロード成功:", response.data);
    return response.data.file_id;
  } catch (error) {
    console.error("ファイルアップロードエラー:", error.response?.data || error.message);
    throw error;
  } finally {
    try {
      await fsp.unlink(filePath);
      console.log("一時ファイルを削除しました:", filePath);
    } catch (err) {
      console.error("一時ファイルの削除に失敗しました:", err);
    }
  }
}

/**
 * ファイルIDを含んだ返信メッセージを送信します。
 */
async function sendFileReply(fileId, replyData) {
  const { accountId, roomId, messageId } = replyData;
  try {
    const message = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\n画像だよ！`;
    await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
      new URLSearchParams({ body: message }),
      {
        headers: {
          "X-ChatWorkToken": CHATWORK_API_TOKEN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log("ファイル添付メッセージ送信成功");
  } catch (error) {
    console.error("メッセージ送信エラー:", error.response?.data || error.message);
    throw error;
  }
}

// サーバーを起動
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
