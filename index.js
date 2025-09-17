const express = require('express');
const axios = require('axios');
const fs = require('fs'); // 通常のfsモジュール
const fsp = require('fs').promises; // fs.promisesモジュール
const path = require('path');
const qrcode = require('qrcode');　// QRコードを簡単に生成！
const FormData = require('form-data');
const app = express();
app.use(express.json());

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;
const ADMIN_ACCOUNT_ID = 10617115; //　自分自身を無視するようにしたいけどIDの取得だるいから直接入れ込みます

const EMOJI_LIST = [
  ':)', ':(', ':D', '8-)', ':o', ';)', ':(', '(sweat)', ':|', ':*', ':p', '(blush)',
  ':^)', '|-)', '(inlove)', ']:)', '(talk)', '(yawn)', '(puke)', '(emo)', '8-|', ':#',
  '(nod)', '(shake)', '(^^;)', '(whew)', '(clap)', '(bow)', '(roger)', '(flex)',
  '(dance)', ':/', '(gogo)', '(think)', '(please)', '(quick)', '(anger)', '(devil)',
  '(lightbulb)', '(*)', '(h)', '(F)', '(cracker)', '(eat)', '(^)', '(coffee)', '(beer)',
  '(handshake)', '(y)'
];

// 特定のURLに対する警告回数を記憶するオブジェクト（一時的なもの）
const userWarningCount = {};
// メンバーの権限を部屋別にバックアップするオブジェクト
const member_backup = {};

// ウェブフックのエンドポイント
app.post('/webhook', async (req, res) => {
  const webhookEvent = req.body.webhook_event;
  if (!webhookEvent) {
    console.error("Invalid webhook payload received.");
    return res.status(400).send("Bad Request: Invalid payload");
  }

  const { account_id: accountId, body, room_id: roomId, message_id: messageId } = webhookEvent;

  // 返信メッセージの形式を解析する正規表現を一度だけ宣言
  const replyRegex = /\[rp aid=(\d+) to=(\d+)-(\d+)]/;　// 返信
  const replyMatch = body.match(replyRegex);

  // 権限チェックの必要がないコマンドを先に処理
  // QRコード生成コマンドに反応
  if (body.startsWith('/QR ')) {
    const textToEncode = body.substring(4); // "/QR "の4文字を除去
    if (textToEncode.trim() === '') {
      await sendReplyMessage(roomId, 'QRコードにしたいURLまたはテキストを指定してください。', { accountId, messageId });
      return res.sendStatus(200);
    }
    console.log(`QRコード生成コマンドを受信しました。対象テキスト: ${textToEncode}`);
    try {
      const filePath = await generateQRCodeImage(textToEncode);
      await uploadImageToChatwork(filePath, roomId);
      const qrMessage = `QRコードだよ！`;
      await sendReplyMessage(roomId, qrMessage, { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("QRコード生成処理でエラーが発生:", error.response?.data || error.message);
      await sendReplyMessage(roomId, 'QRコードの生成に失敗しました。', { accountId, messageId });
      return res.sendStatus(500);
    }
  }
  // /info コマンドに反応
  if (body.trim().startsWith('/info')) {
    console.log(`「/info」コマンドを受信しました。roomId: ${roomId}, accountId: ${accountId}`);
    try {
      const roomInfoResponse = await axios.get(
        `https://api.chatwork.com/v2/rooms/${roomId}`, {
          headers: {
            'X-ChatWorkToken': CHATWORK_API_TOKEN
          }
        }
      );
      const roomInfo = roomInfoResponse.data;

      const membersResponse = await axios.get(
        `https://api.chatwork.com/v2/rooms/${roomId}/members`, {
          headers: {
            'X-ChatWorkToken': CHATWORK_API_TOKEN
          }
        }
      );
      const members = membersResponse.data;

      const message = `[info][title]ルーム情報[/title]
ルーム名: ${roomInfo.name}
ルームID: ${roomInfo.room_id}
メンバー数: ${members.length}
メッセージ数: ${roomInfo.num_messages}
ファイル数: ${roomInfo.num_files}
タスク数: ${roomInfo.num_tasks}
作成者: ${roomInfo.sticky.account_id}
[/info]`;

      await sendReplyMessage(roomId, message, { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("infoコマンド処理でエラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, 'ルーム情報の取得に失敗しました。', { accountId, messageId });
      return res.sendStatus(500);
    }
  }

  // /countコマンドに反応
  if (body.includes('/count')) {
    console.log(`「/count」コマンドを受信しました。roomId: ${roomId}, accountId: ${accountId}`);
    try {
      const filePath = await downloadCountImage();
      await uploadImageToChatwork(filePath, roomId);
      const countMessage = `君は何番目かな？`;
      await sendReplyMessage(roomId, countMessage, { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("画像送信処理でエラーが発生:", error);
      await sendReplyMessage(roomId, '画像の送信に失敗しました。', { accountId, messageId });
      return res.sendStatus(500);
    }
  }

  // 「おみくじ」に反応する
  if (body === 'おみくじ') {
    console.log(`「おみくじ」メッセージを受信しました。roomId: ${roomId}, accountId: ${accountId}`);
    try {
      const result = drawFortune();
      const message = `${result}`;
      await sendReplyMessage(roomId, message, { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("おみくじ処理でエラーが発生:", error);
      return res.sendStatus(500);
    }
  }

  // 「画像送ってみて」という投稿に反応する
  if (body === '画像送ってみて') {
    console.log(`「画像送ってみて」メッセージを受信しました。roomId: ${roomId}, accountId: ${accountId}`);
    try {
      const filePath = await downloadRandomImage();
      await uploadImageToChatwork(filePath, roomId);
      const imageMessage = `画像だよ！`;
      await sendReplyMessage(roomId, imageMessage, { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("画像送信処理でエラーが発生:", error);
      return res.sendStatus(500);
    }
  }

  // メンバーリストを取得し、送信者が管理者であるかをチェック
  let senderIsAdmin = false;
  try {
    const response = await axios.get(
      `https://api.chatwork.com/v2/rooms/${roomId}/members`, {
        headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN }
      }
    );
    const members = response.data;
    const sender = members.find(m => m.account_id === accountId);
    if (sender && sender.role === 'admin') {
      senderIsAdmin = true;
    }
  } catch (error) {
    console.error("メンバーリスト取得エラー:", error.response?.data || error.message);
  }

  // 管理者のみ使用可能なコマンドを処理
  // /onlyreads コマンドの処理
  // /onlyreads コマンドの処理
  if (body.trim().startsWith('/onlyreads')) {
    console.log(`「/onlyreads」コマンドを受信しました。roomId: ${roomId}, accountId: ${accountId}`);
    if (!senderIsAdmin) {
      await sendReplyMessage(roomId, '権限が足りません。管理者のみがこのコマンドを実行できます。', { accountId, messageId });
      return res.sendStatus(200);
    }

    try {
      const members = (await axios.get(`https://api.chatwork.com/v2/rooms/${roomId}/members`, { headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN } })).data;
      const admins = members.filter(m => m.role === 'admin');
      const regularMembers = members.filter(m => m.role === 'member');
      const readonlyMembers = members.filter(m => m.role === 'readonly');
      
      member_backup[roomId] = [...regularMembers, ...readonlyMembers];
      
      const newAdminIds = admins.map(m => m.account_id);
      
      // 閲覧のみにするユーザーのIDリストを生成（管理者を除外）
      const newReadonlyIds = members
        .filter(m => m.role !== 'admin') // <-- この行を追加
        .map(m => m.account_id);

      await axios.put(
        `https://api.chatwork.com/v2/rooms/${roomId}/members`,
        new URLSearchParams({
          members_admin_ids: newAdminIds.join(','),
          members_member_ids: '',
          members_readonly_ids: newReadonlyIds.join(','),
        }),
        {
          headers: {
            'X-ChatWorkToken': CHATWORK_API_TOKEN,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      await sendReplyMessage(roomId, '荒らし対策モードを有効にしました。メンバー全員の権限を閲覧のみに変更しました。', { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("onlyreadsコマンド処理でエラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
      return res.sendStatus(500);
    }
  }
  // /release コマンドの処理
  if (body.trim().startsWith('/release')) {
    console.log(`「/release」コマンドを受信しました。roomId: ${roomId}, accountId: ${accountId}`);
    if (!senderIsAdmin) {
      await sendReplyMessage(roomId, '権限が足りません。管理者のみがこのコマンドを実行できます。', { accountId, messageId });
      return res.sendStatus(200);
    }

    try {
      if (!member_backup[roomId]) {
        await sendReplyMessage(roomId, '復旧データが見つかりません。', { accountId, messageId });
        return res.sendStatus(200);
      }

      const members = (await axios.get(`https://api.chatwork.com/v2/rooms/${roomId}/members`, { headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN } })).data;
      const newAdmins = members.filter(m => m.role === 'admin');
      const newReadonlys = [];
      const newMembers = [];

      member_backup[roomId].forEach(member => {
        if (member.role === 'member') {
          newMembers.push(member);
        } else if (member.role === 'readonly') {
          newReadonlys.push(member);
        }
      });

      await axios.put(
        `https://api.chatwork.com/v2/rooms/${roomId}/members`,
        new URLSearchParams({
          members_admin_ids: newAdmins.map(m => m.account_id).join(','),
          members_member_ids: newMembers.map(m => m.account_id).join(','),
          members_readonly_ids: newReadonlys.map(m => m.account_id).join(','),
        }),
        {
          headers: {
            'X-ChatWorkToken': CHATWORK_API_TOKEN,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      delete member_backup[roomId];
      await sendReplyMessage(roomId, '荒らし対策モードを解除しました。メンバーの権限を元に戻しました。', { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("releaseコマンド処理でエラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
      return res.sendStatus(500);
    }
  }


  // その他のメッセージルールを処理
  if (replyMatch) {
    const targetAccountId = replyMatch[1];
    const targetRoomId = replyMatch[2];
    const targetMessageId = replyMatch[3];

    if (body.includes('削除')) {
      console.log(`メッセージID ${targetMessageId} の削除コマンドを受信しました。`);
      try {
        await deleteMessage(targetRoomId, targetMessageId);
        return res.sendStatus(200);
      } catch (error) {
        console.error("メッセージ削除でエラー:", error.response?.data || error.message);
        const errorMessage = 'メッセージの削除に失敗しました。ボットは自分自身の投稿しか削除できません。';
        await sendReplyMessage(roomId, errorMessage, { accountId, messageId });
        return res.sendStatus(500);
      }
    }

    if (body.includes('/admin') && senderIsAdmin) {
      console.log(`管理者権限昇格コマンドを受信しました。実行者ID: ${accountId}, 対象ID: ${targetAccountId}`);
      try {
        await changeMemberPermission(roomId, targetAccountId, 'admin');
        await sendReplyMessage(roomId, `アカウントID ${targetAccountId} の権限を管理者に変更しました。`, { accountId, messageId });
        return res.sendStatus(200);
      } catch (error) {
        console.error("管理者権限昇格処理でエラーが発生:", error.response?.data || error.message);
        await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
        return res.sendStatus(500);
      }
    }

    if (body.includes('/ban') && senderIsAdmin) {
      console.log(`閲覧権限変更コマンドを受信しました。実行者ID: ${accountId}, 対象ID: ${targetAccountId}`);
      try {
        await changeMemberPermission(roomId, targetAccountId, 'readonly');
        await sendReplyMessage(roomId, `アカウントID ${targetAccountId} の権限を閲覧に変更しました。`, { accountId, messageId });
        return res.sendStatus(200);
      } catch (error) {
        console.error("閲覧権限変更処理でエラーが発生:", error.response?.data || error.message);
        await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
        return res.sendStatus(500);
      }
    }
  }

  // URLを含むメッセージをチェック
  const groupUrlRegex = /https:\/\/www\.chatwork\.com\/g\/[a-zA-Z0-9]+/;
  if (body.match(groupUrlRegex)) {
    if (userWarningCount[accountId] >= 1) {
      console.log(`アカウントID ${accountId} が規約違反URLを2回以上投稿しました。権限を閲覧に変更します。`);
      try {
        await changeMemberPermission(roomId, accountId, 'readonly');
        delete userWarningCount[accountId];
        return res.sendStatus(200);
      } catch (error) {
        console.error("URL違反による権限変更でエラー:", error);
        return res.sendStatus(500);
      }
    } else {
      console.log(`アカウントID ${accountId} が規約違反URLを投稿しました。警告します。`);
      const warningMessage = `このURLの投稿は許可されていません。再度投稿された場合、権限が変更されます。`;
      try {
        await sendReplyMessage(roomId, warningMessage, { accountId, messageId });
        userWarningCount[accountId] = 1;
        return res.sendStatus(200);
      } catch (error) {
        console.error("URL違反警告でエラー:", error);
        return res.sendStatus(500);
      }
    }
  }

  // YouTubeの動画URLに反応する
  const youtubeUrlRegex = /\/youtube\/(https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)[a-zA-Z0-9_-]+)(?:\?.+)?/;
  const youtubeMatch = body.match(youtubeUrlRegex);
  if (youtubeMatch) {
    const youtubeVideoUrl = youtubeMatch[1];
    console.log(`YouTube動画URLを受信しました: ${youtubeVideoUrl}`);
    try {
      const apiUrl = `https://vkrdownloader.xyz/server/?api_key=vkrdownloader&vkr=${encodeURIComponent(youtubeVideoUrl)}`;
      const response = await axios.get(apiUrl);
      const videoData = response.data.data;

      if (videoData && videoData.downloads && videoData.downloads.length > 0) {
        const title = videoData.title;
        const thumbnail = videoData.thumbnail;
        const downloadUrl = videoData.downloads[0].url;

        const infoMessage = `[info][title]${title}[/title][code]${downloadUrl}[/code][/info]`;
        await sendReplyMessage(roomId, infoMessage, { accountId, messageId });
        await downloadAndUploadImage(thumbnail, roomId);

        console.log("YouTube動画情報送信成功");
        return res.sendStatus(200);
      } else {
        await sendReplyMessage(roomId, `動画情報の取得に失敗しました。`, { accountId, messageId });
        return res.sendStatus(200);
      }
    } catch (error) {
      console.error("YouTube処理でエラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, `エラーが発生しました。再度お試しください。`, { accountId, messageId });
      return res.sendStatus(500);
    }
  }

  if (accountId === 9510804 && body.includes('復活')) {
    console.log(`アカウントID ${accountId} から「復活」メッセージを受信しました。権限を管理者に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'admin');
      return res.sendStatus(200);
    } catch (error) {
      console.error("復活コマンド処理でエラー:", error);
      return res.sendStatus(500);
    }
  }

  if (accountId === ADMIN_ACCOUNT_ID) {
    console.log(`管理者からのメッセージを受信しました: ${accountId}`);
    return res.sendStatus(200);
  }

  // [toall]が含まれていたら権限を閲覧に変更 (管理者を除く)
  if (body.includes('[toall]') && !senderIsAdmin) {
    console.log(`[toall]が含まれています。ユーザーの権限を閲覧に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'readonly');
      return res.sendStatus(200);
    } catch (error) {
      console.error("[toall]処理でエラー:", error);
      return res.sendStatus(500);
    }
  }

  // Zalgoテキストが含まれていたら権限を閲覧に変更
  const zalgoPattern = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;
  const zalgoMatches = body.match(zalgoPattern);
  const zalgoCount = zalgoMatches ? zalgoMatches.length : 0;
  if (zalgoCount >= 5) {
    console.log(`Zalgoテキストが${zalgoCount}個含まれています。ユーザーの権限を閲覧に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'readonly');
      return res.sendStatus(200);
    } catch (error) {
      console.error("Zalgoテキスト処理でエラー:", error);
      return res.sendStatus(500);
    }
  }
  // 文字数が1000文字以上であれば権限を閲覧に変更
  if (body.length >= 1000) {
    console.log(`メッセージが1000文字以上です。ユーザーの権限を閲覧に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'readonly');
      return res.sendStatus(200);
    } catch (error) {
      console.error("文字数制限処理でエラー:", error);
      return res.sendStatus(500);
    }
  }
  
  // 絵文字が15個以上含まれていたら権限を閲覧に変更 (管理者を除く)
  const emojiCount = countEmojis(body, EMOJI_LIST);
  if (emojiCount >= 15 && !senderIsAdmin) {
    console.log(`絵文字が15個以上含まれています (${emojiCount}個)。ユーザーの権限を閲覧に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'readonly');
      return res.sendStatus(200);
    } catch (error) {
      console.error("絵文字処理でエラー:", error);
      return res.sendStatus(500);
    }
  }

  console.log(`その他のメッセージを受信しました: ${body}`);
  return res.sendStatus(200);
});

// --- 新しい機能 ---

async function generateQRCodeImage(text) {
  const filePath = path.join('/tmp', `qrcode_${Date.now()}.png`);
  try {
    await qrcode.toFile(filePath, text);
    console.log("QRコード生成成功:", filePath);
    return filePath;
  } catch (error) {
    console.error("QRコード生成エラー:", error);
    throw error;
  }
}

async function sendMessage(roomId, message) {
  try {
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
    console.log("通常メッセージ送信成功");
  } catch (error) {
    console.error("通常メッセージ送信エラー:", error.response?.data || error.message);
    throw error;
  }
}

async function deleteMessage(roomId, messageId) {
  try {
    await axios.delete(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages/${messageId}`,
      {
        headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN }
      }
    );
    console.log(`メッセージID ${messageId} を削除しました。`);
  } catch (error) {
    console.error("メッセージ削除APIエラー:", error.response?.data || error.message);
    throw error;
  }
}

async function downloadAndUploadImage(imageUrl, roomId) {
  const filePath = path.join('/tmp', `thumbnail_${Date.now()}.jpg`);
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await fsp.writeFile(filePath, response.data);
    console.log("サムネイル画像ダウンロード成功:", filePath);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const chatworkResponse = await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/files`,
      formData,
      {
        headers: { ...formData.getHeaders(), 'X-ChatWorkToken': CHATWORK_API_TOKEN },
      }
    );
    console.log("サムネイル画像アップロード成功:", chatworkResponse.data);
  } catch (error) {
    console.error("画像ダウンロードまたはアップロードエラー:", error.response?.data || error.message);
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

async function downloadCountImage() {
  const imageUrl = 'https://ag-sage.vercel.app/';
  const filePath = path.join('/tmp', `count_image_${Date.now()}.png`);
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
      }
    });
    await fsp.writeFile(filePath, response.data);
    console.log("カウント画像ダウンロード成功:", filePath);
    return filePath;
  } catch (error) {
    console.error("カウント画像ダウンロードエラー:", error);
    throw error;
  }
}

function drawFortune() {
  const fortunes = ['大吉', '吉', '中吉', '小吉', '末吉', '凶', '大凶'];
  const randomIndex = Math.floor(Math.random() * fortunes.length);
  return fortunes[randomIndex];
}

async function sendReplyMessage(roomId, message, replyData) {
  const { accountId, messageId } = replyData;
  try {
    const formattedMessage = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\n${message}`;
    await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
      new URLSearchParams({ body: formattedMessage }),
      {
        headers: {
          "X-ChatWorkToken": CHATWORK_API_TOKEN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log("返信メッセージ送信成功");
  } catch (error) {
    console.error("返信メッセージ送信エラー:", error.response?.data || error.message);
    throw error;
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countEmojis(text, emojiList) {
  let count = 0;
  for (const emoji of emojiList) {
    const escapedEmoji = escapeRegExp(emoji);
    const regex = new RegExp(escapedEmoji, 'g');
    const matches = text.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

async function changeMemberPermission(roomId, accountId, newRole) {
  try {
    const response = await axios.get(
      `https://api.chatwork.com/v2/rooms/${roomId}/members`, {
        headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN }
      }
    );
    const members = response.data;
    const adminIds = members.filter(m => m.role === 'admin' && m.account_id !== accountId).map(m => m.account_id);
    const memberIds = members.filter(m => m.role === 'member' && m.account_id !== accountId).map(m => m.account_id);
    const readonlyIds = members.filter(m => m.role === 'readonly' && m.account_id !== accountId).map(m => m.account_id);
    if (newRole === 'admin') adminIds.push(accountId);
    if (newRole === 'member') memberIds.push(accountId);
    if (newRole === 'readonly') readonlyIds.push(accountId);
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

// サーバーを起動
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
