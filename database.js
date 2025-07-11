const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

// データベースファイルのパス
const dbPath = path.join(__dirname, 'users.db');

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('データベース接続エラー:', err.message);
    } else {
        console.log('SQLiteデータベースに接続しました');
        initializeDatabase();
    }
});

// データベースの初期化
function initializeDatabase() {
    // ユーザーテーブルの作成
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT UNIQUE,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    `, (err) => {
        if (err) {
            console.error('テーブル作成エラー:', err.message);
        } else {
            console.log('usersテーブルが準備されました');
            createDefaultAdmin();
        }
    });
}

// デフォルト管理者アカウントの作成
function createDefaultAdmin() {
    const defaultUsername = 'admin';
    const defaultPassword = 'admin123';
    const defaultEmail = 'admin@mcmanager.local';

    // 既存の管理者アカウントをチェック
    db.get('SELECT * FROM users WHERE username = ?', [defaultUsername], (err, row) => {
        if (err) {
            console.error('管理者チェックエラー:', err.message);
            return;
        }

        if (!row) {
            // パスワードをハッシュ化
            bcrypt.hash(defaultPassword, 10, (err, hashedPassword) => {
                if (err) {
                    console.error('パスワードハッシュ化エラー:', err.message);
                    return;
                }

                // デフォルト管理者を作成
                db.run(
                    'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
                    [defaultUsername, hashedPassword, defaultEmail, 'admin'],
                    function(err) {
                        if (err) {
                            console.error('デフォルト管理者作成エラー:', err.message);
                        } else {
                            console.log('デフォルト管理者アカウントが作成されました');
                            console.log('ユーザー名: admin, パスワード: admin123');
                        }
                    }
                );
            });
        }
    });
}

// ユーザー作成
function createUser(username, password, email, role = 'user') {
    return new Promise((resolve, reject) => {
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
                reject(err);
                return;
            }

            db.run(
                'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
                [username, hashedPassword, email, role],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID, username, email, role });
                    }
                }
            );
        });
    });
}

// ユーザー認証
function authenticateUser(username, password) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
            if (err) {
                reject(err);
                return;
            }

            if (!user) {
                resolve(null);
                return;
            }

            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (isMatch) {
                    // ログイン時刻を更新
                    db.run(
                        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                        [user.id]
                    );
                    resolve({
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role
                    });
                } else {
                    resolve(null);
                }
            });
        });
    });
}

// ユーザーIDでユーザー情報を取得
function getUserById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?', [id], (err, user) => {
            if (err) {
                reject(err);
            } else {
                resolve(user);
            }
        });
    });
}

// 全ユーザーを取得（管理者用）
function getAllUsers() {
    return new Promise((resolve, reject) => {
        db.all('SELECT id, username, email, role, created_at, last_login FROM users', (err, users) => {
            if (err) {
                reject(err);
            } else {
                resolve(users);
            }
        });
    });
}

// ユーザー削除
function deleteUser(id) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.changes > 0);
            }
        });
    });
}

module.exports = {
    db,
    createUser,
    authenticateUser,
    getUserById,
    getAllUsers,
    deleteUser
};
