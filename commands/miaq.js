const axios = require("axios");
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const { sendReplyMessage, chatworkApi } = require("../config");

// メッセージリンクから情報を抽出する関数
const extractInfoFromLink = (link) => {
    // リンクからID、名前、メッセージ本文、アイコンURLを抽出する正規表現
    const idRegex = /ID(\d+)/;
    const nameRegex = /name=([^&]+)/;
    const contentRegex = /content=([^&]+)/;
    const iconRegex = /icon=([^&]+)/;

    const idMatch = link.match(idRegex);
    const nameMatch = link.match(nameRegex);
    const contentMatch = link.match(contentRegex);
    const iconMatch = link.match(iconRegex);

    return {
        id: idMatch ? idMatch[1] : null,
        name: nameMatch ? decodeURIComponent(nameMatch[1]) : null,
        content: contentMatch ? decodeURIComponent(contentMatch[1]) : null,
        icon: iconMatch ? decodeURIComponent(iconMatch[1]) : null,
    };
};

module.exports = async function handleMiaqCommand(roomId, messageId, accountId, link) {
    let filePath;
    try {
        const extractedInfo = extractInfoFromLink(link);
        const { id, name, content, icon } = extractedInfo;

        if (!id || !name || !content || !icon) {
            await sendReplyMessage(roomId, 'メッセージリンクの形式が正しくありません。ID、名前、メッセージ内容、アイコンURLがすべて含まれているか確認してください。', { accountId, messageId });
            return;
        }

        // 画像生成URLを構築
        const imageUrl = `https://miq-yol8.onrender.com/?id=ID${id}&name=${encodeURIComponent(name)}&content=${encodeURIComponent(content)}&icon=${encodeURIComponent(icon)}&type=color`;

        // 画像を取得
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data, 'binary');

        // 一時ファイルとして保存
        const fileName = `temp_image_${Date.now()}.png`;
        filePath = path.join(__dirname, '..', fileName);
        await fs.writeFile(filePath, imageBuffer);

        // Chatworkに画像を送信
        const form = new FormData();
        form.append('file', imageBuffer, {
            filename: fileName,
            contentType: 'image/png',
        });
        form.append('message', `[To:${accountId}] メッセージリンクから画像を生成しました。`);

        await chatworkApi.post(`/rooms/${roomId}/files`, form, {
            headers: {
                ...form.getHeaders(),
                'X-ChatWorkToken': chatworkApi.defaults.headers['X-ChatWorkToken']
            },
        });

        // 成功メッセージを送信
        await sendReplyMessage(roomId, '画像の送信が完了しました。', { accountId, messageId });
    } catch (error) {
        console.error('MIAQコマンド実行エラー:', error.response ? error.response.data : error.message);
        await sendReplyMessage(roomId, '画像の生成または送信中にエラーが発生しました。', { accountId, messageId });
    } finally {
        // 保存した画像を削除
        if (filePath) {
            try {
                await fs.unlink(filePath);
                console.log(`一時ファイル ${filePath} を削除しました。`);
            } catch (unlinkError) {
                console.error(`一時ファイルの削除中にエラーが発生しました: ${unlinkError.message}`);
            }
        }
    }
};
