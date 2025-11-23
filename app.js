// app.js - v2.0 Extended Features
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const xlsx = require('xlsx');
const app = express();
const port = 3000;

// 資料庫連線
const pool = new Pool({
  user: 'admin',
  host: 'localhost',
  database: 'SupplyEaseDB',
  password: 'SupplyEase',
  port: 5432,
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(session({
    secret: 'supplyease_secret_key',
    resave: false,
    saveUninitialized: false
}));

// ★★★ 新增這段 Middleware (開始) ★★★
app.use((req, res, next) => {
    // 把目前的網址路徑存入 locals，讓所有 EJS 檔案都能使用 'currentPath' 變數
    res.locals.currentPath = req.path;
    next();
});
// ★★★ 新增這段 Middleware (結束) ★★★

const upload = multer({ dest: 'uploads/' });

// --- Helper: 自動編號產生器 (Format: PREFIX-YYYYMMDD-Random) ---
const generateID = (prefix) => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000); // 4位隨機數
    return `${prefix}-${date}-${random}`;
};

// --- 初始化資料庫 ---
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'supplier'
            );
        `);
        // Purchase Request (PR) - PR_ID 自動產生
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_requests (
                id SERIAL PRIMARY KEY,
                pr_number VARCHAR(50) UNIQUE NOT NULL,
                item_name VARCHAR(100),
                material_code VARCHAR(50), 
                quantity INTEGER,
                budget DECIMAL(10,2),
                status VARCHAR(20) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Sourcing Request (SR) - 對應圖片與 Word 需求
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sourcing_requests (
                id SERIAL PRIMARY KEY,
                sr_number VARCHAR(50) UNIQUE NOT NULL,
                supplier_id VARCHAR(50),
                title VARCHAR(100),
                pr_reference VARCHAR(50),
                project_duration VARCHAR(50),
                material_desc VARCHAR(100),
                material_code VARCHAR(50),
                quantity INTEGER,
                price DECIMAL(10,2),
                total_price DECIMAL(10,2),
                incoterm VARCHAR(50),
                payment_term VARCHAR(50),
                delivery_date DATE,
                status VARCHAR(20) DEFAULT 'In Progress',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Purchase Order (PO) - PO_ID 自動產生
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                po_number VARCHAR(50) UNIQUE NOT NULL,
                sr_reference VARCHAR(50), -- 來自 SR ID
                supplier_name VARCHAR(100),
                material_code VARCHAR(50),
                material_name VARCHAR(100),
                quantity INTEGER,
                unit_price DECIMAL(10,2),
                total_amount DECIMAL(10,2),
                status VARCHAR(20) DEFAULT 'New',
                delivery_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Delivery Status
        await pool.query(`
            CREATE TABLE IF NOT EXISTS delivery_status (
                id SERIAL PRIMARY KEY,
                po_number VARCHAR(50),
                material_code VARCHAR(50),
                status VARCHAR(20),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Default Admin
        const adminExist = await pool.query("SELECT * FROM users WHERE username = 'admin'");
        if (adminExist.rows.length === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, 'admin')", ['admin', hash]);
        }
        console.log("DB Synced with New Schema.");
    } catch (err) {
        console.error("DB Init Error:", err);
    }
};
initDB();

// Middleware
const requireLogin = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

// --- API: 供前端 AJAX 查詢用 ---
// 根據 PR Number 抓取資料 (給 SR 用)
app.get('/api/pr/:pr_number', requireLogin, async (req, res) => {
    const result = await pool.query("SELECT * FROM purchase_requests WHERE pr_number = $1", [req.params.pr_number]);
    if (result.rows.length > 0) res.json(result.rows[0]);
    else res.status(404).json({ error: 'Not Found' });
});

// 根據 SR Number 抓取資料 (給 PO 用)
app.get('/api/sr/:sr_number', requireLogin, async (req, res) => {
    const result = await pool.query("SELECT * FROM sourcing_requests WHERE sr_number = $1", [req.params.sr_number]);
    if (result.rows.length > 0) res.json(result.rows[0]);
    else res.status(404).json({ error: 'Not Found' });
});


// --- Routes ---
app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length > 0 && await bcrypt.compare(password, result.rows[0].password)) {
        req.session.user = result.rows[0];
        return res.redirect('/');
    }
    res.redirect('/login');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// 首頁 Dashboard (更新版)
app.get('/', requireLogin, async (req, res) => {
    // 1. Spending (Total PO Amount)
    const poSum = await pool.query("SELECT SUM(total_amount) as total FROM purchase_orders");
    
    // 2. Sourcing Project Status
    const srStatus = await pool.query("SELECT status, COUNT(*) FROM sourcing_requests GROUP BY status");
    
    res.render('index', { 
        user: req.session.user,
        stats: {
            spending: poSum.rows[0].total || 0,
            sr_status: srStatus.rows
        }
    });
});

app.get('/create', requireLogin, (req, res) => res.render('create/menu', { user: req.session.user }));

// --- Create PR (Auto Generated ID) ---
app.get('/create/pr', requireLogin, (req, res) => res.render('create/pr', { user: req.session.user }));

// app.js 修改部分

// 1. Create PR (Manual) - 修改 Redirect
app.post('/create/pr', requireLogin, async (req, res) => {
    const { item_name, material_code, quantity, budget } = req.body;
    const pr_number = generateID('PR');
    await pool.query(
        'INSERT INTO purchase_requests (pr_number, item_name, material_code, quantity, budget) VALUES ($1, $2, $3, $4, $5)',
        [pr_number, item_name, material_code, quantity, budget]
    );
    // 修改：帶上 success=true 和單號
    res.redirect(`/create?success=true&msg=Purchase Request Created&id=${pr_number}`);
});

// 2. Create PR (Excel) - 修改 Redirect
app.post('/create/pr/upload', requireLogin, upload.single('excelFile'), async (req, res) => {
    try {
        const workbook = xlsx.readFile(req.file.path);
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        let count = 0;
        for (let row of data) {
            const pr_number = generateID('PR');
            await pool.query(
                'INSERT INTO purchase_requests (pr_number, item_name, material_code, quantity, budget) VALUES ($1, $2, $3, $4, $5)',
                [pr_number, row.Item, row.MaterialCode || 'N/A', row.Qty, row.Budget || 0]
            );
            count++;
        }
        // 修改：帶上匯入筆數
        res.redirect(`/create?success=true&msg=${count} PRs Imported Successfully&id=Batch`);
    } catch (e) { res.send("Error: " + e.message); }
});

// --- Create Sourcing Request (New) ---

// app.js - 修改 /create/sr 的 GET 路由
app.get('/create/sr', requireLogin, async (req, res) => {
    // 撈取所有 PR 資料，最新的排前面
    const prResult = await pool.query("SELECT * FROM purchase_requests ORDER BY created_at DESC");
    
    // 將 prs 資料傳給前端
    res.render('create/sr', { 
        user: req.session.user, 
        prs: prResult.rows 
    });
});
// app.js - 修正 SR 建立路由 (處理空值問題)
app.post('/create/sr', requireLogin, async (req, res) => {
    const sr_number = generateID('SR');
    const { supplier_id, title, pr_reference, project_duration, material_desc, material_code, quantity, price, total_price, incoterm, payment_term, delivery_date } = req.body;
    
    await pool.query(
        `INSERT INTO sourcing_requests 
        (sr_number, supplier_id, title, pr_reference, project_duration, material_desc, material_code, quantity, price, total_price, incoterm, payment_term, delivery_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
            sr_number, 
            supplier_id, 
            title, 
            pr_reference, 
            project_duration, 
            material_desc, 
            material_code, 
            // ★ 修正重點：如果欄位是空字串，就轉為 0 或 null
            quantity || 0, 
            price || 0, 
            total_price || 0, 
            incoterm, 
            payment_term, 
            delivery_date || null // 日期如果是空字串也要轉 null
        ]
    );
    res.redirect(`/create?success=true&msg=Sourcing Request Created&id=${sr_number}`);
});

// --- Create PO (Manual or From SR) ---
// 1. 修改 GET /create/po (撈取 SR 資料給下拉選單用)
app.get('/create/po', requireLogin, async (req, res) => {
    // 撈取狀態為 In Progress 或 Completed 的 SR，讓使用者選擇
    const srResult = await pool.query("SELECT * FROM sourcing_requests ORDER BY created_at DESC");
    
    res.render('create/po', { 
        user: req.session.user,
        srs: srResult.rows // 傳遞 srs 給前端
    });
});

// 4. Create PO - 修改 Redirect
// app.js - 修正 PO 建立路由 (處理空值問題)
app.post('/create/po', requireLogin, async (req, res) => {
    const po_number = generateID('PO');
    const { sr_reference, supplier_name, material_code, material_name, quantity, unit_price, total_amount, delivery_date } = req.body;
    
    await pool.query(
        `INSERT INTO purchase_orders 
        (po_number, sr_reference, supplier_name, material_code, material_name, quantity, unit_price, total_amount, delivery_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            po_number, 
            sr_reference || null, 
            supplier_name, 
            material_code, 
            material_name, 
            // ★ 修正重點：處理數字空值
            quantity || 0, 
            unit_price || 0, 
            total_amount || 0, 
            delivery_date || null
        ]
    );
    
    // 建立對應的物流狀態
    await pool.query('INSERT INTO delivery_status (po_number, material_code, status) VALUES ($1, $2, $3)', [po_number, material_code, 'Processing']);
    
    res.redirect(`/create?success=true&msg=Purchase Order Created&id=${po_number}`);
});

// Status & Supplier Routes
app.get('/status/delivery', requireLogin, async (req, res) => {
    let query = "SELECT * FROM delivery_status";
    if (req.query.search) query += ` WHERE po_number LIKE '%${req.query.search}%'`;
    const result = await pool.query(query);
    res.render('status/delivery', { user: req.session.user, deliveries: result.rows });
});
// 2. 新增 GET /status (Status 選單頁面)
app.get('/status', requireLogin, (req, res) => {
    res.render('status/menu', { user: req.session.user });
});
// 3. 新增 GET /status/pr-po (PR-PO 狀態查詢功能)
app.get('/status/pr-po', requireLogin, async (req, res) => {
    // 修改 app.js 中 /status/pr-po 的 SQL，加入 pr.id
    let query = `
        SELECT 
            pr.id as pr_id,  -- ★ 新增這行：取出 ID 供前端連結使用
            pr.pr_number, pr.item_name, pr.status as pr_status, pr.created_at as pr_date,
            sr.sr_number, sr.status as sr_status,
            po.po_number, po.status as po_status,
            ds.status as delivery_status
        FROM purchase_requests pr
        LEFT JOIN sourcing_requests sr ON pr.pr_number = sr.pr_reference
        LEFT JOIN purchase_orders po ON sr.sr_number = po.sr_reference
        LEFT JOIN delivery_status ds ON po.po_number = ds.po_number
    `;
    
    // 搜尋邏輯
    let params = [];
    if (req.query.search) {
        query += ` WHERE pr.pr_number ILIKE $1 OR po.po_number ILIKE $1 OR sr.sr_number ILIKE $1`;
        params.push(`%${req.query.search}%`);
    }
    
    query += ` ORDER BY pr.created_at DESC`;

    const result = await pool.query(query, params);
    res.render('status/pr_po', { user: req.session.user, data: result.rows });
});

// app.js (新增部分)

// 1. GET: 進入編輯頁面 (Edit Page)
app.get('/status/delivery/:id/edit', requireLogin, async (req, res) => {
    const id = req.params.id;
    const result = await pool.query("SELECT * FROM delivery_status WHERE id = $1", [id]);
    
    if (result.rows.length > 0) {
        res.render('status/edit', { user: req.session.user, delivery: result.rows[0] });
    } else {
        res.send("Status Record Not Found");
    }
});

// 2. PUT: 更新狀態 (Update Logic)
app.put('/status/delivery/:id', requireLogin, async (req, res) => {
    const id = req.params.id;
    const { status } = req.body;
    
    // 更新狀態與時間
    await pool.query(
        "UPDATE delivery_status SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [status, id]
    );
    
    // 跳轉回列表並顯示成功訊息
    res.redirect('/status/delivery?success=true&msg=Status Updated Successfully');
});

// 3. DELETE: 刪除狀態 (Delete Logic)
app.delete('/status/delivery/:id', requireLogin, async (req, res) => {
    const id = req.params.id;
    
    await pool.query("DELETE FROM delivery_status WHERE id = $1", [id]);
    
    res.redirect('/status/delivery?success=true&msg=Record Deleted');
});

// app.js (新增 PR-PO 編輯/刪除功能)

// 1. GET: 進入 PR-PO 編輯頁面
app.get('/status/pr-po/:id/edit', requireLogin, async (req, res) => {
    const prId = req.params.id;
    
    // 使用與列表頁相同的 JOIN 邏輯，但只鎖定單一 PR ID
    const query = `
        SELECT 
            pr.id as pr_id, pr.pr_number, pr.status as pr_status,
            sr.sr_number, sr.status as sr_status,
            po.po_number, po.status as po_status
        FROM purchase_requests pr
        LEFT JOIN sourcing_requests sr ON pr.pr_number = sr.pr_reference
        LEFT JOIN purchase_orders po ON sr.sr_number = po.sr_reference
        WHERE pr.id = $1
    `;
    
    const result = await pool.query(query, [prId]);
    
    if (result.rows.length > 0) {
        res.render('status/pr_po_edit', { user: req.session.user, data: result.rows[0] });
    } else {
        res.send("Record not found");
    }
});

// 2. PUT: 同時更新 PR, SR, PO 的狀態
app.put('/status/pr-po/:id', requireLogin, async (req, res) => {
    const prId = req.params.id;
    const { pr_status, sr_status, sr_number, po_status, po_number } = req.body;
    
    try {
        // 1. 更新 PR 狀態
        await pool.query("UPDATE purchase_requests SET status = $1 WHERE id = $2", [pr_status, prId]);
        
        // 2. 如果有 SR，更新 SR 狀態
        if (sr_number) {
            await pool.query("UPDATE sourcing_requests SET status = $1 WHERE sr_number = $2", [sr_status, sr_number]);
        }
        
        // 3. 如果有 PO，更新 PO 狀態
        if (po_number) {
            await pool.query("UPDATE purchase_orders SET status = $1 WHERE po_number = $2", [po_status, po_number]);
        }
        
        res.redirect('/status/pr-po?success=true&msg=Process Status Updated');
    } catch (err) {
        res.send("Update Error: " + err.message);
    }
});

// 3. DELETE: 刪除 PR (整條流程的源頭)
app.delete('/status/pr-po/:id', requireLogin, async (req, res) => {
    const prId = req.params.id;
    
    // 刪除 PR 即可，因為視圖是 LEFT JOIN PR，PR 消失則整列消失
    // (在真實 ERP 中可能會做更嚴謹的檢查，但作業練習這樣是可以的)
    await pool.query("DELETE FROM purchase_requests WHERE id = $1", [prId]);
    
    res.redirect('/status/pr-po?success=true&msg=Purchase Request Deleted');
});

app.get('/supplier', requireLogin, (req, res) => res.render('supplier/index', { user: req.session.user }));
app.get('/suppliers', requireLogin, async (req, res) => {
     // 簡單的供應商列表 (若資料庫有 suppliers 表可讀取)
     res.send("Supplier List Placeholder");
});

app.listen(port, () => console.log(`http://localhost:${port}`));