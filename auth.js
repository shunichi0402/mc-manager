const jwt = require('jsonwebtoken');
const { getUserById } = require('./database');

// JWT秘密鍵（本番環境では環境変数から読み込むべき）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = '24h';

// JWTトークンを生成
function generateToken(user) {
    return jwt.sign(
        { 
            id: user.id, 
            username: user.username, 
            role: user.role 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// JWTトークンを検証
function verifyToken(token) {
    return new Promise((resolve, reject) => {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                reject(err);
            } else {
                resolve(decoded);
            }
        });
    });
}

// 認証ミドルウェア
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'アクセストークンが必要です' });
    }

    verifyToken(token)
        .then(async (decoded) => {
            try {
                const user = await getUserById(decoded.id);
                if (!user) {
                    return res.status(401).json({ error: '無効なトークンです' });
                }
                req.user = user;
                next();
            } catch (error) {
                return res.status(500).json({ error: 'ユーザー情報の取得に失敗しました' });
            }
        })
        .catch((err) => {
            return res.status(403).json({ error: '無効なトークンです' });
        });
}

// 管理者権限チェックミドルウェア
function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: '管理者権限が必要です' });
    }
}

// オプショナル認証ミドルウェア（トークンがあれば認証、なくても通す）
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    verifyToken(token)
        .then(async (decoded) => {
            try {
                const user = await getUserById(decoded.id);
                req.user = user;
                next();
            } catch (error) {
                req.user = null;
                next();
            }
        })
        .catch(() => {
            req.user = null;
            next();
        });
}

module.exports = {
    generateToken,
    verifyToken,
    authenticateToken,
    requireAdmin,
    optionalAuth,
    JWT_SECRET
};
