const {
  sendReplyMessage,
  uploadImageToChatwork,
  generateQRCodeImage,
  downloadCountImage,
  drawFortune,
  downloadRandomImage,
  changeMemberPermission,
  deleteMessage,
  downloadAndUploadImage,
  getChatworkRoomlist,
  initializeStats // 新たに追加
} = require('./helpers');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;
const CHATWORK_API_TOKEN1 = process.env.CHATWORK_API_TOKEN1;
const ADMIN_ACCOUNT_ID = 10617115;
const BLACKLISTED_DOMAINS = [
  'malicious-site.com',
  'phishing-example.net',
  'inappropriate-content.xyz'
];

async function handleCommands(data) {
  const {
    accountId,
    body,
    roomId,
    messageId,
    userWarningCount,
    member_backup,
    urlCheckStatus,
    roomMessageCounts, // 新しいカウンター
    lastUpdateTime,
    NO_URL_CHECK_ROOMS
  } = data;
  const replyRegex = /\[rp aid=(\d+) to=(\d+)-(\d+)]/;
  const replyMatch = body.match(replyRegex);

  let senderIsAdmin = false;
  try {
    const response = await axios.get(
      `https://api.chatwork.com/v2/rooms/${roomId}/members`, {
        headers: {
          'X-ChatWorkToken': CHATWORK_API_TOKEN
        }
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
  
  // --- /startコマンド: カウントをリセット ---
  if (body.trim() === '/start') {
    await sendReplyMessage(roomId, 'メッセージ数のカウントを再開します。', { accountId, messageId });
    try {
      await initializeStats(); // helpers.js の初期化関数を呼び出す
      await sendReplyMessage(roomId, 'メッセージカウントの準備が完了しました。', { accountId, messageId });
      return;
    } catch (error) {
      await sendReplyMessage(roomId, 'メッセージカウントの開始に失敗しました。', { accountId, messageId });
      return;
    }
  }

  // --- 一般ユーザー向けコマンド ---
  if (body.startsWith('/QR ')) {
    const textToEncode = body.substring(4);
    if (textToEncode.trim() === '') {
      await sendReplyMessage(roomId, 'QRコードにしたいURLまたはテキストを指定してください。', { accountId, messageId });
      return;
    }
    try {
      const filePath = await generateQRCodeImage(textToEncode);
      await uploadImageToChatwork(filePath, roomId);
      await sendReplyMessage(roomId, `QRコードだよ！`, { accountId, messageId });
      return;
    } catch (error) {
      console.error("QRコード生成処理でエラーが発生:", error.response?.data || error.message);
      await sendReplyMessage(roomId, 'QRコードの生成に失敗しました。', { accountId, messageId });
      return;
    }
  }

  if (body.includes('/count')) {
    try {
      const filePath = await downloadCountImage();
      await uploadImageToChatwork(filePath, roomId);
      await sendReplyMessage(roomId, `君は何番目かな？`, { accountId, messageId });
      return;
    } catch (error) {
      console.error("画像送信処理でエラーが発生:", error);
      await sendReplyMessage(roomId, '画像の送信に失敗しました。', { accountId, messageId });
      return;
    }
  }
  if (body === 'おみくじ') {
    try {
      const result = drawFortune();
      const message = `${result}`;
      await sendReplyMessage(roomId, message, { accountId, messageId });
      return;
    } catch (error) {
      console.error("おみくじ処理でエラーが発生:", error);
      return;
    }
  }

  if (body === '画像送ってみて') {
    try {
      const filePath = await downloadRandomImage();
      await uploadImageToChatwork(filePath, roomId);
      await sendReplyMessage(roomId, `画像だよ！`, { accountId, messageId });
      return;
    } catch (error) {
    }
  }
  
  if (body.trim().startsWith('/info')) {
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
メッセージ数: ${roomInfo.message_num}
ファイル数: ${roomInfo.file_num}
タスク数: ${roomInfo.task_num}
[/info]`;
      await sendReplyMessage(roomId, message, { accountId, messageId });
      return;
    } catch (error) {
      console.error("infoコマンド処理でエラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, 'ルーム情報の取得に失敗しました。', { accountId, messageId });
      return;
    }
  }

  if (body.trim().startsWith('/roominfo/')) {
    const requestedRoomId = body.trim().substring(10);
    let roomInfo, members;
    try {
      const roomInfoResponse = await axios.get(`https://api.chatwork.com/v2/rooms/${requestedRoomId}`, { headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN } });
      roomInfo = roomInfoResponse.data;
      const membersResponse = await axios.get(`https://api.chatwork.com/v2/rooms/${requestedRoomId}/members`, { headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN } });
      members = membersResponse.data;
    } catch (error) {
      try {
        const roomInfoResponse = await axios.get(`https://api.chatwork.com/v2/rooms/${requestedRoomId}`, { headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN1 } });
        roomInfo = roomInfoResponse.data;
        const membersResponse = await axios.get(`https://api.chatwork.com/v2/rooms/${requestedRoomId}/members`, { headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN1 } });
        members = membersResponse.data;
      } catch (subError) {
        console.error(`すべてのAPIトークンで情報取得失敗（ルームID: ${requestedRoomId}）:`, subError.response?.data || subError.message);
        await sendReplyMessage(roomId, `ごめん、その部屋の情報はわからないよ。`, { accountId, messageId });
        return;
      }
    }
    const message = `[info][title]ルーム情報[/title]
ルーム名: ${roomInfo.name}
ルームID: ${roomInfo.room_id}
メンバー数: ${members.length}
メッセージ数: ${roomInfo.message_num}
ファイル数: ${roomInfo.file_num}
タスク数: ${roomInfo.task_num}
[/info]`;
    await sendReplyMessage(roomId, message, { accountId, messageId });
    return;
  }

  if (body.trim().startsWith('/see ')) {
    const url = body.trim().substring(5);
    let htmlFilePath = null;
    let imageFilePath = null;
    try {
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (e) {
        await sendReplyMessage(roomId, '有効なURLではありません。', { accountId, messageId });
        return;
      }
      const domain = parsedUrl.hostname;
      if (BLACKLISTED_DOMAINS.includes(domain)) {
        await sendReplyMessage(roomId, 'そのサイトは安全のためアクセスできません。', { accountId, messageId });
        return;
      }
      const response = await axios.get(url, {
        responseType: 'text',
        timeout: 5000,
        maxContentLength: 1000000
      });
      const html = response.data;
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const images = dom.window.document.querySelectorAll('img');
      if (images.length === 0) {
        await sendReplyMessage(roomId, 'このページに画像が見つかりませんでした。', { accountId, messageId });
        return;
      }
      const firstImageSrc = images[0].src;
      const imageUrl = new URL(firstImageSrc, url).href;
      imageFilePath = await downloadImage(imageUrl);
      await uploadImageToChatwork(imageFilePath, roomId);
      await sendReplyMessage(roomId, '最初の画像だよ！', { accountId, messageId });
      return;
    } catch (error) {
      console.error("URLアクセスまたは画像送信エラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, '画像の取得に失敗しました。URLが有効であるか、ページに画像があるか確認してください。', { accountId, messageId });
      return;
    }
  }
  
  if (body.trim() === '/既読/') {
    console.log(`「/既読/」コマンドを受信しました。すべてのルームを既読にします。`);

    try {
      const roomsResponse = await axios.get(
        `https://api.chatwork.com/v2/rooms`, {
          headers: {
            'X-ChatWorkToken': CHATWORK_API_TOKEN
          }
        }
      );
      const rooms = roomsResponse.data;
      const roomIds = rooms.map(room => room.room_id);

      console.log(`ボットが参加しているルーム数: ${roomIds.length}`);

      for (const roomIdToRead of roomIds) {
        try {
          await axios.put(
            `https://api.chatwork.com/v2/rooms/${roomIdToRead}/messages/read`,
            new URLSearchParams(),
            {
              headers: {
                'X-ChatWorkToken': CHATWORK_API_TOKEN,
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            }
          );
          console.log(`ルームID ${roomIdToRead} の既読化が完了しました。`);
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`ルームID ${roomIdToRead} の既読化に失敗しました。エラー:`, error.response?.data || error.message);
        }
      }
      await sendReplyMessage(roomId, '全ての参加ルームを既読にしました。', { accountId, messageId });
      return;
    } catch (error) {
      console.error("既読処理全体でエラーが発生:", error.response?.data || error.message);
      await sendReplyMessage(roomId, '既読処理に失敗しました。', { accountId, messageId });
      return;
    }
  }
  
  // /tops コマンドに反応
  if (body.trim() === '/tops') {
    if (Object.keys(roomMessageCounts).length === 0) {
      await sendReplyMessage(roomId, 'ごめんね、まだ統計データが準備できてないみたい。少し待ってからもう一度試してみて。', { accountId, messageId });
      return;
    }
    
    try {
      const sortedRooms = Object.keys(roomMessageCounts)
        .map(id => ({ room_id: parseInt(id), count: roomMessageCounts[id] }))
        .sort((a, b) => b.count - a.count);

      const top8Diffs = sortedRooms.slice(0, 8);
      
      const allRooms = (await getChatworkRoomlist()) || [];
      
      let chatworkMessage = `メッセージ数ランキングだよ！(cracker)[info][title]メッセージ数ランキング[/title]\n`;
      top8Diffs.forEach((item, index) => {
        const roomInfo = allRooms.find(r => r.room_id === item.room_id);
        const roomName = roomInfo ? roomInfo.name : `ルームID: ${item.room_id}`;
        chatworkMessage += `[download:1681682877]${index + 1}位[/download] ${roomName}\n(ID: ${item.room_id}) - ${item.count}コメ。[hr]`;
      });
      chatworkMessage += `[hr]統計開始: ${new Date(lastUpdateTime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}[/info]`;
      
      await sendReplyMessage(roomId, chatworkMessage, { accountId, messageId });
      return;
    } catch (error) {
      console.error("メッセージ数ランキング取得エラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, 'ランキングの取得中にエラーが発生しました。', { accountId, messageId });
      return;
    }
  }

  // /filetops コマンドに反応
  if (body.trim() === '/filetops') {
    if (initialRoomStats.length === 0) {
      await sendReplyMessage(roomId, 'ごめんね、まだ統計データが準備できてないみたい。少し待ってからもう一度試してみて。', { accountId, messageId });
      return;
    }
    
    try {
      const currentRoomList = await getChatworkRoomlist();
      if (!currentRoomList) {
        await sendReplyMessage(roomId, '現在のルームリストの取得に失敗しました。', { accountId, messageId });
        return;
      }
      
      const fileDiffs = calculateFileDiffs(initialRoomStats, currentRoomList);
      const top8Diffs = fileDiffs.slice(0, 8);
      
      let chatworkMessage = `ファイル数ランキングだよ！(cracker)[info][title]ファイル数ランキング[/title]\n`;
      top8Diffs.forEach((item, index) => {
        chatworkMessage += `[download:1681682877]${index + 1}位[/download] ${item.name}\n(ID: ${item.room_id}) - ${item.diff}個。[hr]`;
      });
      chatworkMessage += `[hr]統計開始: ${new Date(lastUpdateTime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}[/info]`;
      
      await sendReplyMessage(roomId, chatworkMessage, { accountId, messageId });
      return;
    } catch (error) {
      console.error("ファイル数ランキング取得エラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, 'ランキングの取得中にエラーが発生しました。', { accountId, messageId });
      return;
    }
  }
  
  // --- 管理者専用コマンド ---
  if (body.trim().startsWith('/invalid')) {
    if (!senderIsAdmin) {
      await sendReplyMessage(roomId, 'このコマンドは管理者のみ使用できます。', { accountId, messageId });
      return;
    }
    urlCheckStatus[roomId] = false;
    await sendReplyMessage(roomId, 'URLチェックを無効化しました。', { accountId, messageId });
    return;
  }

  if (body.trim().startsWith('/enable')) {
    if (!senderIsAdmin) {
      await sendReplyMessage(roomId, 'このコマンドは管理者のみ使用できます。', { accountId, messageId });
      return;
    }
    urlCheckStatus[roomId] = true;
    await sendReplyMessage(roomId, 'URLチェックを有効化しました。', { accountId, messageId });
    return;
  }
  
  if (body.trim().startsWith('/onlyreads')) {
    if (!senderIsAdmin) {
      await sendReplyMessage(roomId, '権限が足りません。管理者のみがこのコマンドを実行できます。', { accountId, messageId });
      return;
    }
    try {
      const members = (await axios.get(`https://api.chatwork.com/v2/rooms/${roomId}/members`, { headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN } })).data;
      const admins = members.filter(m => m.role === 'admin');
      const regularMembers = members.filter(m => m.role === 'member');
      const readonlyMembers = members.filter(m => m.role === 'readonly');
      member_backup[roomId] = [...regularMembers, ...readonlyMembers];
      const newAdminIds = admins.map(m => m.account_id);
      const newReadonlyIds = members.filter(m => m.role !== 'admin').map(m => m.account_id);
      await axios.put(
        `https://api.chatwork.com/v2/rooms/${roomId}/members`,
        new URLSearchParams({
          members_admin_ids: newAdminIds.join(','),
          members_member_ids: '',
          members_readonly_ids: newReadonlyIds.join(','),
        }), {
          headers: {
            'X-ChatWorkToken': CHATWORK_API_TOKEN,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      await sendReplyMessage(roomId, '荒らし対策モードを有効にしました。メンバー全員の権限を閲覧のみに変更しました。', { accountId, messageId });
      return;
    } catch (error) {
      console.error("onlyreadsコマンド処理でエラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
      return;
    }
  }

  if (body.trim().startsWith('/release')) {
    if (!senderIsAdmin) {
      await sendReplyMessage(roomId, '権限が足りません。管理者のみがこのコマンドを実行できます。', { accountId, messageId });
      return;
    }
    try {
      if (!member_backup[roomId]) {
        await sendReplyMessage(roomId, '復旧データが見つかりません。', { accountId, messageId });
        return;
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
        }), {
          headers: {
            'X-ChatWorkToken': CHATWORK_API_TOKEN,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      delete member_backup[roomId];
      await sendReplyMessage(roomId, '荒らし対策モードを解除しました。メンバーの権限を元に戻しました。', { accountId, messageId });
      return;
    } catch (error) {
      console.error("releaseコマンド処理でエラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
      return;
    }
  }

  // --- その他のメッセージルール ---
  if (replyMatch) {
    const targetAccountId = replyMatch[1];
    const targetRoomId = replyMatch[2];
    const targetMessageId = replyMatch[3];
    if (body.includes('削除')) {
      try {
        await deleteMessage(targetRoomId, targetMessageId);
        return;
      } catch (error) {
        console.error("メッセージ削除でエラー:", error.response?.data || error.message);
        const errorMessage = 'メッセージの削除に失敗しました。ボットは自分自身の投稿しか削除できません。';
        await sendReplyMessage(roomId, errorMessage, { accountId, messageId });
        return;
      }
    }
    if (body.includes('/admin') && senderIsAdmin) {
      try {
        await changeMemberPermission(roomId, targetAccountId, 'admin');
        await sendReplyMessage(roomId, `アカウントID ${targetAccountId} の権限を管理者に変更しました。`, { accountId, messageId });
        return;
      } catch (error) {
        console.error("管理者権限昇格処理でエラーが発生:", error.response?.data || error.message);
        await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
        return;
      }
    }
    if (body.includes('/ban') && senderIsAdmin) {
      try {
        await changeMemberPermission(roomId, targetAccountId, 'readonly');
        await sendReplyMessage(roomId, `アカウントID ${targetAccountId} の権限を閲覧に変更しました。`, { accountId, messageId });
        return;
      } catch (error) {
        console.error("閲覧権限変更処理でエラーが発生:", error.response?.data || error.message);
        await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
        return;
      }
    }
  }

  // URLを含むメッセージをチェック
  if (!NO_URL_CHECK_ROOMS.includes(roomId)) {
    if (urlCheckStatus[roomId] !== false) {
      const groupUrlRegex = /https:\/\/www\.chatwork.com\/g\/[a-zA-Z0-9]+/;
      if (body.match(groupUrlRegex)) {
        if (userWarningCount[accountId] >= 1) {
          try {
            await changeMemberPermission(roomId, accountId, 'readonly');
            delete userWarningCount[accountId];
            return;
          } catch (error) {
            console.error("URL違反による権限変更でエラー:", error);
            return;
          }
        } else {
          const warningMessage = `このURLの投稿は許可されていません。再度投稿された場合、権限が変更されます。`;
          try {
            await sendReplyMessage(roomId, warningMessage, { accountId, messageId });
            userWarningCount[accountId] = 1;
            return;
          } catch (error) {
            console.error("URL違反警告でエラー:", error);
            return;
          }
        }
      }
    }
  }
}

module.exports = { handleCommands };
