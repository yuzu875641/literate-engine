const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Vercelの環境変数を取得
const CHATWORK_API_TOKENS = process.env.CHATWORK_API_TOKENS.split(',');

// Bot自身のアカウントIDを保持する配列
const BOT_ACCOUNT_IDS = []; 

// 監視対象の絵文字リスト
const EMOJIS_TO_COUNT = [
    ':)', ':(', ':D', '8-)', ':o', ';)', ';(', '(sweat)', ':|', ':*', ':p', '(blush)',
    ':^)', '|-)', '(inlove)', ']:)', '(talk)', '(yawn)', '(puke)', '(emo)', '8-|', ':#)',
    '(nod)', '(shake)', '(^^;)', '(whew)', '(clap)', '(bow)', '(roger)', '(flex)', '(dance)',
    ':/', '(gogo)', '(think)', '(please)', '(quick)', '(anger)', '(devil)', '(lightbulb)',
    '(*)', '(h)', '(F)', '(cracker)', '(eat)', '(^)', '(coffee)', '(beer)', '(handshake)', '(y)'
];

// 起動時にBotの情報を取得する関数
async function setupBot() {
    try {
        console.log('Botのセットアップを開始します...');
        for (const token of CHATWORK_API_TOKENS) {
            const headers = { 'X-ChatWorkToken': token };
            const meResponse = await axios.get('https://api.chatwork.com/v2/me', { headers });
            const accountId = meResponse.data.account_id;
            if (!BOT_ACCOUNT_IDS.includes(accountId)) {
                BOT_ACCOUNT_IDS.push(accountId);
            }
        }
        console.log(`BotアカウントID: ${BOT_ACCOUNT_IDS.join(', ')}`);
        
    } catch (error) {
        console.error('Botのセットアップ中にエラーが発生しました:', error.message);
        throw new Error('Bot setup failed.');
    }
}

// サーバーレス関数のハンドラ
module.exports = async (req, res) => {
    // セットアップがまだ完了していない場合は実行
    if (BOT_ACCOUNT_IDS.length === 0) {
        await setupBot();
    }

    try {
        const { body, account_id: accountId, room_id: roomId, message_id: messageId, type } = req.body.webhook_event;

        if (type !== 'message_created') {
            return res.status(200).send('Event skipped');
        }

        if (BOT_ACCOUNT_IDS.includes(accountId)) {
            console.log("送信者はBot自身です。処理をスキップします。");
            return res.status(200).send("Bot's own message, skipped.");
        }

        const isImageRequest = body.includes('画像送ってみて');
        let emojiCount = 0;

        if (!isImageRequest) {
            EMOJIS_TO_COUNT.forEach(emoji => {
                emojiCount += (body.match(new RegExp(emoji.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')) || []).length;
            });
        }

        console.log(`投稿者ID: ${accountId}, 投稿部屋ID: ${roomId}, 絵文字カウント: ${emojiCount}`);

        if (isImageRequest) {
            console.log(`画像リクエストを受信しました。部屋ID: ${roomId}, 送信者ID: ${accountId}`);

            const imageUrl = 'https://pic.re/image';
            const tempDir = os.tmpdir();
            const tempFilePath = path.join(tempDir, 'temp_image.png');

            const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
            const writer = fs.createWriteStream(tempFilePath);
            imageResponse.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const form = new FormData();
            form.append('file', fs.createReadStream(tempFilePath));
            form.append('message', `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\n画像です。`);

            const randomIndex = Math.floor(Math.random() * CHATWORK_API_TOKENS.length);
            const randomToken = CHATWORK_API_TOKENS[randomIndex];

            const headers = {
                ...form.getHeaders(),
                'X-ChatWorkToken': randomToken
            };

            await axios.post(`https://api.chatwork.com/v2/rooms/${roomId}/files`, form, { headers });

            console.log('画像のアップロードと返信が完了しました。');
            fs.unlinkSync(tempFilePath);

            return res.status(200).send('Image sent.');
        }

        if (emojiCount >= 15) {
            const randomIndex = Math.floor(Math.random() * CHATWORK_API_TOKENS.length);
            const randomToken = CHATWORK_API_TOKENS[randomIndex];
            const headers = { 'X-ChatWorkToken': randomToken };

            const membersResponse = await axios.get(`https://api.chatwork.com/v2/rooms/${roomId}/members`, { headers });
            const members = membersResponse.data;

            const ADMIN_IDS = members.filter(member => member.role === 'admin' || BOT_ACCOUNT_IDS.includes(member.account_id)).map(member => member.account_id);

            if (ADMIN_IDS.includes(accountId)) {
                console.log(`送信者(${accountId})は管理者です。権限変更をスキップします。`);
                return res.status(200).send('Admin user, skipped.');
            }

            const currentAdmins = members.filter(m => m.role === 'admin').map(m => m.account_id);
            const currentMembers = members.filter(m => m.role === 'member').map(m => m.account_id);
            const currentReadonlys = members.filter(m => m.role === 'readonly').map(m => m.account_id);
            
            const newMembers = currentMembers.filter(id => id !== accountId);
            const newReadonlys = [...currentReadonlys, accountId];

            console.log(`条件を満たしました。アカウントID: ${accountId} の権限を「閲覧」に変更します。`);

            await axios.put(`https://api.chatwork.com/v2/rooms/${roomId}/members`, {
                members_admin_ids: currentAdmins,
                members_member_ids: newMembers,
                members_readonly_ids: newReadonlys,
            }, {
                headers: headers
            });

            console.log(`権限変更が完了しました。使用したAPIトークンは ${randomIndex + 1} 番目です。`);
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('エラーが発生しました:', error.message);
        res.status(500).send('Error');
    }
};
