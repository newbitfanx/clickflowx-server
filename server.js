const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();

// Замени на токен твоего бота, который ты получил от @BotFather
const token = '8091200329:AAGC1N5OIVq4T_a-CsnPy2J1XrwW4MIMEOI';
const bot = new TelegramBot(token, { polling: false });

app.use(express.json());

// Эндпоинт для получения информации о видео
app.post('/get-video-info', async (req, res) => {
    const { url, platform, userId } = req.body;

    if (!url || !userId) {
        return res.status(400).json({ success: false, error: 'Missing URL or user ID' });
    }

    exec(`yt-dlp ${url} --dump-json --no-playlist`, { encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            bot.sendMessage(userId, `Ошибка получения информации о видео: ${error.message}`);
            return res.status(500).json({ success: false, error: error.message });
        }

        try {
            const info = JSON.parse(stdout);
            let formats = info.formats
                .filter(f => f.vcodec !== 'none' && f.resolution !== 'audio only')
                .map(f => ({
                    itag: f.format_id,
                    label: f.resolution ? f.resolution.split('x')[1] + 'p' : f.format_note || 'unknown',
                    height: parseInt(f.resolution ? f.resolution.split('x')[1] : 0)
                }))
                .filter(f => f.itag && f.label !== 'unknown' && f.height > 0)
                .sort((a, b) => b.height - a.height);

            const uniqueFormats = [];
            const seenLabels = new Set();
            for (const format of formats) {
                if (!seenLabels.has(format.label)) {
                    seenLabels.add(format.label);
                    uniqueFormats.push(format);
                }
            }

            if (platform === 'youtube' && uniqueFormats.length === 0) {
                bot.sendMessage(userId, 'Не удалось найти подходящие форматы для видео');
                return res.status(404).json({ success: false, error: 'No suitable formats found' });
            }

            res.json({
                success: true,
                title: info.title || (platform === 'tiktok' ? `TikTok video #${info.id}` : 'Unknown Title'),
                author: info.uploader || info.uploader_id || 'Unknown Author',
                duration: info.duration,
                publishDate: info.upload_date,
                thumbnail: info.thumbnail,
                formats: platform === 'youtube' ? uniqueFormats : []
            });
        } catch (e) {
            bot.sendMessage(userId, `Ошибка парсинга информации о видео: ${e.message}`);
            res.status(500).json({ success: false, error: `Failed to parse video info: ${e.message}` });
        }
    });
});

// Эндпоинт для скачивания видео
app.post('/download', async (req, res) => {
    const { url, quality, format, title, platform, userId } = req.body;

    if (!url || !userId) {
        return res.status(400).json({ success: false, error: 'Missing URL or user ID' });
    }

    const outputFile = `video_${userId}_${Date.now()}.mp4`;
    const outputPath = path.join(__dirname, outputFile);

    const args = [
        url,
        platform === 'youtube' ? `-f "${quality}+bestaudio/best"` : '-f bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', outputPath,
        '--no-playlist',
        '--force-overwrites'
    ];

    bot.sendMessage(userId, 'Начинаем скачивание видео...');

    exec(`yt-dlp ${args.join(' ')}`, (error) => {
        if (error) {
            bot.sendMessage(userId, `Ошибка при скачивании: ${error.message}`);
            return res.status(500).json({ success: false, error: error.message });
        }

        bot.sendVideo(userId, outputPath, { caption: `Видео: ${title}` })
            .then(() => {
                bot.sendMessage(userId, 'Видео успешно скачано! Сохраните его на своё устройство.');
                res.json({ success: true });
                fs.unlink(outputPath, (err) => {
                    if (err) console.error(`Ошибка удаления файла: ${err}`);
                });
            })
            .catch((err) => {
                bot.sendMessage(userId, `Ошибка отправки видео: ${err.message}`);
                res.status(500).json({ success: false, error: err.message });
                fs.unlink(outputPath, (err) => {
                    if (err) console.error(`Ошибка удаления файла: ${err}`);
                });
            });
    });
});

// Настройка Webhook (опционально, если хочешь получать команды от бота)
app.get('/setWebhook', async (req, res) => {
    const webhookUrl = 'https://clickflowx-miniapp-fz89iv7sc-newbitfanxs-projects.vercel.app/';
    await bot.setWebHook(webhookUrl);
    res.send('Webhook set!');
});

app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});