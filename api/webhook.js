const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Vercelの環境変数からAPIトークンを取得
const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;

let BOT_ACCOUNT_ID = null;

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
        const headers = { 'X-ChatWorkToken': CHATWORK_API_TOKEN };
        const meResponse = await axios.get('https://api.chatwork.com/v2/me', { headers });
        BOT_ACCOUNT_ID = meResponse.data.account_id;
        console.log(`BotアカウントID: ${BOT_ACCOUNT_ID}`);
    } catch (error) {
        console.error('Botのセットアップ中にエラーが発生しました:', error.message);
        if (error.response) {
            console.error('APIレスポンスエラー:', `ステータスコード: ${error.response.status}, エラーメッセージ: ${JSON.stringify(error.response.data)}`);
        }
        throw new Error('Bot setup failed.');
    }
}

// サーバーレス関数のハンドラ
module.exports = async (req, res) => {
    // リクエストごとにBot IDが設定されているか確認し、設定されていなければセットアップ
    if (!BOT_ACCOUNT_ID) {
        await setupBot();
    }

    try {
        const { body, account_id: accountId, room_id: roomId, message_id: messageId, type } = req.body.webhook_event;

        // デバッグログを追加
        console.log(`Webhook受信: 投稿者ID: ${accountId}, 投稿部屋ID: ${roomId}, メッセージ本文: "${body}"`);

        if (type !== 'message_created') {
            return res.status(200).send('Event skipped');
        }

        if (accountId == BOT_ACCOUNT_ID) {
            console.log("送信者はBot自身です。処理をスキップします。");
            return res.status(200).send("Bot's own message, skipped.");
        }

        let isActionTaken = false;
        const headers = { 'X-ChatWorkToken': CHATWORK_API_TOKEN };

        // --- 「test」コマンドの処理 ---
        if (body.includes('test')) {
            console.log(`「test」リクエストを受信しました。`);
            try {
                const now = new Date();
                const replyMessage = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\n現在の時刻は ${now.toLocaleString('ja-JP')} です。`;
                await axios.post(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, { body: replyMessage }, { headers });
                console.log('時刻の返信が完了しました。');
                isActionTaken = true;
            } catch (error) {
                console.error('時刻返信中にエラーが発生しました:', error.message);
                if (error.response) {
                    console.error('APIレスポンスエラー:', `ステータスコード: ${error.response.status}, エラーメッセージ: ${JSON.stringify(error.response.data)}`);
                }
            }
        }

        // --- 「画像送ってみて」コマンドの処理 ---
        if (body.includes('画像送ってみて')) {
            console.log(`画像リクエストを受信しました。`);
            try {
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
                const fileHeaders = { ...form.getHeaders(), 'X-ChatWorkToken': CHATWORK_API_TOKEN };
                await axios.post(`https://api.chatwork.com/v2/rooms/${roomId}/files`, form, { headers: fileHeaders });
                console.log('画像のアップロードと返信が完了しました。');
                fs.unlinkSync(tempFilePath);
                isActionTaken = true;
            } catch (error) {
                console.error('画像送信中にエラーが発生しました:', error.message);
                if (error.response) {
                    console.error('APIレスポンスエラー:', `ステータスコード: ${error.response.status}, エラーメッセージ: ${JSON.stringify(error.response.data)}`);
                }
            }
        }

        const emojiCount = EMOJIS_TO_COUNT.reduce((count, emoji) => count + (body.match(new RegExp(emoji.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')) || []).length, 0);

        // --- 絵文字スパムチェックの処理 ---
        if (emojiCount >= 15) {
            console.log(`投稿者ID: ${accountId}, 投稿部屋ID: ${roomId}, 絵文字カウント: ${emojiCount}`);
            try {
                const membersResponse = await axios.get(`https://api.chatwork.com/v2/rooms/${roomId}/members`, { headers });
                const members = membersResponse.data;
                const ADMIN_IDS = members.filter(member => member.role === 'admin' || member.account_id == BOT_ACCOUNT_ID).map(member => member.account_id);

                if (ADMIN_IDS.includes(accountId)) {
                    console.log(`送信者(${accountId})は管理者です。権限変更をスキップします。`);
                    isActionTaken = true;
                } else {
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
                    console.log(`権限変更が完了しました。`);
                    isActionTaken = true;
                }
            } catch (error) {
                console.error('権限変更中にエラーが発生しました:', error.message);
                if (error.response) {
                    console.error('APIレスポンスエラー:', `ステータスコード: ${error.response.status}, エラーメッセージ: ${JSON.stringify(error.response.data)}`);
                }
            }
        }
        
        // --- どのコマンドにも該当しない場合に返信するロジック ---
        if (!isActionTaken) {
            console.log('どのコマンドにも該当しませんでした。デフォルトの返信を送信します。');
            const replyMessage = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\nご用件がわかりませんでした。「test」と投稿すると現在の時刻を返信します。「画像送ってみて」と投稿すると画像を送信します。`;
            try {
                await axios.post(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, { body: replyMessage }, { headers });
            } catch (error) {
                console.error('デフォルトメッセージ送信中にエラーが発生しました:', error.message);
                if (error.response) {
                    console.error('APIレスポンスエラー:', `ステータスコード: ${error.response.status}, エラーメッセージ: ${JSON.stringify(error.response.data)}`);
                }
            }
        }
        
        res.status(200).send('OK');

    } catch (error) {
        console.error('予期せぬエラーが発生しました:', error.message);
        res.status(500).send('Error');
    }
};
