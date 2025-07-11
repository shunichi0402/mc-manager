const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const pty = require('@lydell/node-pty');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Minecraftサーバーのプロセス
let minecraftServer = null;
let serverStatus = 'stopped';

// サーバーのパス設定
const serverPath = path.join(__dirname, 'server');
const jarFile = 'craftbukkit-1.21.5.jar';
const jarPath = path.join(serverPath, jarFile);

// ルートページ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// サーバー状態取得API
app.get('/api/status', (req, res) => {
    res.json({
        status: serverStatus,
        pid: minecraftServer ? minecraftServer.pid : null
    });
});

// サーバー開始API
app.post('/api/start', (req, res) => {
    if (minecraftServer) {
        return res.status(400).json({ error: 'サーバーは既に実行中です' });
    }

    // JARファイルの存在確認
    if (!fs.existsSync(jarPath)) {
        return res.status(400).json({ error: 'CraftBukkit JARファイルが見つかりません' });
    }

    try {
        const javaPath = 'C:\\Program Files\\Java\\jdk-24\\bin\\java.exe';
        minecraftServer = pty.spawn(javaPath, [
            '-Xmx2G',
            '-Xms1G',
            '-jar',
            jarFile,
            'nogui'
        ], {
            name: 'xterm-color',
            cwd: serverPath,
            env: process.env
        });

        serverStatus = 'starting';

// ANSIエスケープシーケンスを除去する関数
function stripAnsiCodes(text) {
    return text
        // 基本的なANSIエスケープシーケンス
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        // カラーコード ([33m, [97m, [m など)
        .replace(/\[\d*m/g, '')
        // カーソル制御コード ([K, [H など)
        .replace(/\[[KJHABCD]/g, '')
        // その他の制御文字
        .replace(/\x1b\[[\d;]*[^\x1b]*?[a-zA-Z]/g, '')
        // 残りの制御文字
        .replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

// ...existing code...

        minecraftServer.on('data', (data) => {
            const rawOutput = data.toString();
            const cleanOutput = stripAnsiCodes(rawOutput);
            
            console.log('MC Server stdout:', cleanOutput.trim());
            io.emit('serverLog', cleanOutput);
            
            if (cleanOutput.includes('Done') && cleanOutput.includes('For help, type "help"')) {
                console.log('Minecraftサーバーの起動が完了しました');
                serverStatus = 'running';
                io.emit('serverStatus', { status: serverStatus });
            }
        });

        minecraftServer.on('exit', (code) => {
            console.log(`Minecraftサーバーが終了しました。終了コード: ${code}`);
            minecraftServer = null;
            serverStatus = 'stopped';
            io.emit('serverStatus', { status: serverStatus });
        });

        res.json({
            message: 'サーバーを起動中です',
            pid: minecraftServer.pid
        });
    } catch (error) {
        console.error('サーバー起動エラー:', error);
        res.status(500).json({ error: 'サーバーの起動に失敗しました' });
    }
});

// サーバー停止API
app.post('/api/stop', (req, res) => {
    if (!minecraftServer) {
        return res.status(400).json({ error: 'サーバーは実行されていません' });
    }
    minecraftServer.write('stop\r');
    serverStatus = 'stopping';
    res.json({ message: 'サーバーを停止中です' });
});

// コマンド送信API
app.post('/api/command', (req, res) => {
    const { command } = req.body;
    console.log(`コマンド送信要求を受信: ${command}`);
    if (!minecraftServer) {
        console.log('エラー: Minecraftサーバーが実行されていません');
        return res.status(400).json({ error: 'サーバーは実行されていません' });
    }
    if (!command) {
        console.log('エラー: コマンドが指定されていません');
        return res.status(400).json({ error: 'コマンドが指定されていません' });
    }
    try {
        console.log(`コマンドを送信中: "${command}"`);
        minecraftServer.write(command + '\r');
        io.emit('serverLog', `> ${command}\n`);
        res.json({ message: `コマンドを送信しました: ${command}` });
    } catch (error) {
        console.error('コマンド送信エラー:', error);
        res.status(500).json({ error: 'コマンドの送信に失敗しました' });
    }
});

// デバッグ用テストAPI
app.post('/api/test', (req, res) => {
    console.log('テストAPI呼び出し');
    
    if (!minecraftServer) {
        return res.json({ 
            status: 'no_server',
            message: 'Minecraftサーバーが実行されていません' 
        });
    }
    
    const testResults = {
        status: 'running',
        pid: minecraftServer.pid,
        stdin_available: minecraftServer.stdin && !minecraftServer.stdin.destroyed,
        stdout_readable: minecraftServer.stdout && !minecraftServer.stdout.destroyed,
        stderr_readable: minecraftServer.stderr && !minecraftServer.stderr.destroyed,
        process_connected: minecraftServer.connected,
        exit_code: minecraftServer.exitCode,
        killed: minecraftServer.killed
    };
    
    console.log('テスト結果:', testResults);
    res.json(testResults);
});

// WebSocket接続の処理
io.on('connection', (socket) => {
    console.log('クライアントが接続しました');
    
    // 現在のサーバー状態を送信
    socket.emit('serverStatus', { status: serverStatus });
    
    socket.on('disconnect', () => {
        console.log('クライアントが切断しました');
    });
});

// サーバー起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Minecraft管理サーバーがポート${PORT}で起動しました`);
    console.log(`http://localhost:${PORT} でアクセスできます`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nサーバーをシャットダウンしています...');
    
    if (minecraftServer) {
        minecraftServer.stdin.write('stop\n');
        minecraftServer.on('close', () => {
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
