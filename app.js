const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const app = express();
const port = 3000;

// 1. 資料庫連線
const pool = new Pool({
  user: 'admin',
  host: 'localhost',
  database: 'SupplyEaseDB',
  password: 'SupplyEase',
  port: 5432, // 若之前改過 5433 請自行調整
});

// 2. Middleware 設定
app.set('view engine', 'ejs');
app.use(express.static('public')); // 靜態檔案 (CSS, JS, Excel Template)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(session({
    secret: 'supplyease_secret_key',
    resave: false,
    saveUninitialized: false
}));

// 檔案上傳設定 (Multer)
const upload = multer({ dest: 'uploads/' });

// 3. 自動初始化資料庫 (擴充版)
const initDB = async () => {
    try {
        // 使用者表 (權限: admin, supplier)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'supplier',
                company_name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // 採購申請 (PR) - 擴充欄位
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_requests (
                id SERIAL PRIMARY KEY,
                pr_number VARCHAR(50) UNIQUE NOT NULL,
                item_name VARCHAR(100),
                quantity INTEGER,
                budget DECIMAL(10,2),
                status VARCHAR(20) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // 採購訂單 (PO)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                po_number VARCHAR(50) UNIQUE NOT NULL,
                supplier_name VARCHAR(100),
                total_amount DECIMAL(10,2),
                status VARCHAR(20) DEFAULT 'New',
                delivery_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // 物流狀態 (Delivery)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS delivery_status (
                id SERIAL PRIMARY KEY,
                po_number VARCHAR(50),
                material_code VARCHAR(50),
                status VARCHAR(20), -- On Track, Late, Delivered
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 預設建立一個管理員帳號 (admin / admin123)
        const adminExist = await pool.query("SELECT * FROM users WHERE username = 'admin'");
        if (adminExist.rows.length === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, 'admin')", ['admin', hash]);
            console.log("Default Admin Created (admin/admin123)");
        }
        
        console.log("Database Tables Synced.");
    } catch (err) {
        console.error("DB Init Error:", err);
    }
};
initDB();

// 4. 權限驗證 Middleware
const requireLogin = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/');
    next();
};

// --- Routes ---

// 登入/註冊
app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length > 0) {
        const user = result.rows[0];
        if (await bcrypt.compare(password, user.password)) {
            req.session.user = user;
            return res.redirect('/');
        }
    }
    res.send('<script>alert("Login Failed"); window.location.href="/login"</script>');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.post('/signup', async (req, res) => {
    const { username, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    try {
        await pool.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', [username, hash, role || 'supplier']);
        res.redirect('/login');
    } catch (err) {
        res.send("Username already exists.");
    }
});

// 首頁 (Dashboard)
app.get('/', requireLogin, async (req, res) => {
    // 撈取數據給圖表用
    const prCount = await pool.query("SELECT status, COUNT(*) FROM purchase_requests GROUP BY status");
    const poSum = await pool.query("SELECT SUM(total_amount) as total FROM purchase_orders");
    
    res.render('index', { 
        user: req.session.user,
        stats: {
            pr: prCount.rows,
            totalSpend: poSum.rows[0].total || 0
        }
    });
});

// --- Create Section (PR & PO) ---
app.get('/create', requireLogin, (req, res) => res.render('create/menu', { user: req.session.user }));

// Create PR Page
app.get('/create/pr', requireLogin, (req, res) => res.render('create/pr', { user: req.session.user }));

// Create PR Submit (Manual)
app.post('/create/pr', requireLogin, async (req, res) => {
    const { pr_number, item_name, quantity, budget } = req.body;
    await pool.query(
        'INSERT INTO purchase_requests (pr_number, item_name, quantity, budget) VALUES ($1, $2, $3, $4)',
        [pr_number, item_name, quantity, budget]
    );
    res.redirect('/create');
});

// Excel Import for PR
app.post('/create/pr/upload', requireLogin, upload.single('excelFile'), async (req, res) => {
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
        // 假設 Excel欄位: PR_No, Item, Qty, Budget
        for (let row of data) {
            await pool.query(
                'INSERT INTO purchase_requests (pr_number, item_name, quantity, budget) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                [row.PR_No, row.Item, row.Qty, row.Budget]
            );
        }
        res.redirect('/create');
    } catch (e) {
        console.log(e);
        res.send("Excel Error: " + e.message);
    }
});

// Create PO Page
app.get('/create/po', requireLogin, (req, res) => res.render('create/po', { user: req.session.user }));
app.post('/create/po', requireLogin, async (req, res) => {
    const { po_number, supplier_name, total_amount, delivery_date } = req.body;
    await pool.query(
        'INSERT INTO purchase_orders (po_number, supplier_name, total_amount, delivery_date) VALUES ($1, $2, $3, $4)',
        [po_number, supplier_name, total_amount, delivery_date]
    );
    res.redirect('/create');
});

// --- Status Section (Logistics) ---
app.get('/status/delivery', requireLogin, async (req, res) => {
    let query = "SELECT * FROM delivery_status";
    let params = [];
    
    // 搜尋功能
    if (req.query.search) {
        query += " WHERE material_code LIKE $1 OR po_number LIKE $1";
        params.push(`%${req.query.search}%`);
    }
    
    const result = await pool.query(query, params);
    res.render('status/delivery', { user: req.session.user, deliveries: result.rows });
});

// --- Supplier Section ---
app.get('/supplier', requireLogin, (req, res) => {
    // 供應商只能看供應商頁面
    res.render('supplier/index', { user: req.session.user });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});