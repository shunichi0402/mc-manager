const express = require('express');
const rateLimit = require('express-rate-limit');
const { 
    createUser, 
    authenticateUser, 
    getAllUsers, 
    deleteUser 
} = require('./database');
const { 
    generateToken, 
    authenticateToken, 
    requireAdmin 
} = require('./auth');

const router = express.Router();

// ログイン試行制限
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 5, // 最大5回まで
    message: {
        error: 'ログイン試行回数が上限に達しました。15分後に再試行してください。'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// ユーザー登録制限
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1時間
    max: 3, // 最大3回まで
    message: {
        error: 'ユーザー登録回数が上限に達しました。1時間後に再試行してください。'
    }
});

// ログインAPI
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                error: 'ユーザー名とパスワードは必須です' 
            });
        }

        const user = await authenticateUser(username, password);
        
        if (!user) {
            return res.status(401).json({ 
                error: 'ユーザー名またはパスワードが正しくありません' 
            });
        }

        const token = generateToken(user);
        
        res.json({
            message: 'ログインに成功しました',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('ログインエラー:', error);
        res.status(500).json({ 
            error: 'サーバーエラーが発生しました' 
        });
    }
});

// ユーザー登録API（管理者のみ）
router.post('/register', authenticateToken, requireAdmin, registerLimiter, async (req, res) => {
    try {
        const { username, password, email, role = 'user' } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                error: 'ユーザー名とパスワードは必須です' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                error: 'パスワードは6文字以上である必要があります' 
            });
        }

        if (role !== 'user' && role !== 'admin') {
            return res.status(400).json({ 
                error: '無効な権限レベルです' 
            });
        }

        const user = await createUser(username, password, email, role);
        
        res.status(201).json({
            message: 'ユーザーが正常に作成されました',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ 
                error: 'ユーザー名またはメールアドレスが既に使用されています' 
            });
        }
        
        console.error('ユーザー登録エラー:', error);
        res.status(500).json({ 
            error: 'サーバーエラーが発生しました' 
        });
    }
});

// ユーザー情報取得API
router.get('/me', authenticateToken, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role
        }
    });
});

// 全ユーザー取得API（管理者のみ）
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await getAllUsers();
        res.json({ users });
    } catch (error) {
        console.error('ユーザー一覧取得エラー:', error);
        res.status(500).json({ 
            error: 'サーバーエラーが発生しました' 
        });
    }
});

// ユーザー削除API（管理者のみ）
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (userId === req.user.id) {
            return res.status(400).json({ 
                error: '自分自身のアカウントは削除できません' 
            });
        }

        const success = await deleteUser(userId);
        
        if (success) {
            res.json({ message: 'ユーザーが削除されました' });
        } else {
            res.status(404).json({ error: 'ユーザーが見つかりません' });
        }

    } catch (error) {
        console.error('ユーザー削除エラー:', error);
        res.status(500).json({ 
            error: 'サーバーエラーが発生しました' 
        });
    }
});

// トークン検証API
router.post('/verify', authenticateToken, (req, res) => {
    res.json({ 
        valid: true, 
        user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role
        }
    });
});

module.exports = router;
