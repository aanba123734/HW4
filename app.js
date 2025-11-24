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

// 鞈????摨恍??蝺?
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

// ????????? ??啣?????畾? Middleware (???憪?) ?????????
app.use((req, res, next) => {
    // ?????桀?????蝬脣??頝臬??摮???? locals嚗?霈??????? EJS 瑼?獢???質?賭蝙??? 'currentPath' 霈????
    res.locals.currentPath = req.path;
    next();
});
// ????????? ??啣?????畾? Middleware (蝯????) ?????????

const upload = multer({ dest: 'uploads/' });

// --- Helper: ??芸??蝺刻????Ｙ????? (Format: PREFIX-YYYYMMDD-Random) ---
const generateID = (prefix) => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000); // 4雿???冽?????
    return `${prefix}-${date}-${random}`;
};

// --- ???憪????鞈????摨? ---
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
        // Purchase Request (PR) - PR_ID ??芸????Ｙ??
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
        // Sourcing Request (SR) - 撠????????????? Word ???瘙?
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
        // Purchase Order (PO) - PO_ID ??芸????Ｙ??
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                po_number VARCHAR(50) UNIQUE NOT NULL,
                sr_reference VARCHAR(50), -- 靘???? SR ID
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

// --- API: 靘????蝡? AJAX ??亥岷??? ---
// ??寞?? PR Number ??????鞈???? (蝯? SR ???)
app.get('/api/pr/:pr_number', requireLogin, async (req, res) => {
    const result = await pool.query("SELECT * FROM purchase_requests WHERE pr_number = $1", [req.params.pr_number]);
    if (result.rows.length > 0) res.json(result.rows[0]);
    else res.status(404).json({ error: 'Not Found' });
});

// ??寞?? SR Number ??????鞈???? (蝯? PO ???)
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

// 擐???? Dashboard (??湔?啁??)
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

// app.js 靽格?寥?典??

// 1. Create PR (Manual) - 靽格?? Redirect
app.post('/create/pr', requireLogin, async (req, res) => {
    const { item_name, material_code, quantity, budget } = req.body;
    const pr_number = generateID('PR');
    await pool.query(
        'INSERT INTO purchase_requests (pr_number, item_name, material_code, quantity, budget) VALUES ($1, $2, $3, $4, $5)',
        [pr_number, item_name, material_code, quantity, budget]
    );
    // 靽格?對??撣嗡?? success=true ?????株??
    res.redirect(`/create?success=true&msg=Purchase Request Created&id=${pr_number}`);
});

// 2. Create PR (Excel) - 靽格?? Redirect
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
        // 靽格?對??撣嗡????臬?亦?????
        res.redirect(`/create?success=true&msg=${count} PRs Imported Successfully&id=Batch`);
    } catch (e) { res.send("Error: " + e.message); }
});

// --- Create Sourcing Request (New) ---

// app.js - 靽格?? /create/sr ??? GET 頝舐??
app.get('/create/sr', requireLogin, async (req, res) => {
    // ???????????? PR 鞈????嚗??????啁???????????
    const prResult = await pool.query("SELECT * FROM purchase_requests ORDER BY created_at DESC");
    
    // 撠? prs 鞈??????喟策???蝡?
    res.render('create/sr', { 
        user: req.session.user, 
        prs: prResult.rows 
    });
});
// app.js - 靽格迤 SR 撱箇??頝舐?? (??????蝛箏?澆??憿?)
app.post('/create/sr', requireLogin, async (req, res) => {
    const sr_number = generateID('SR');
    const { supplier_id, title, pr_reference, project_duration, material_desc, material_code, quantity, price, total_price, incoterm, payment_term, delivery_date, start_date, end_date } = req.body;
    
    await pool.query(
        `INSERT INTO sourcing_requests 
        (sr_number, supplier_id, title, pr_reference, project_duration, material_desc, material_code, quantity, price, total_price, incoterm, payment_term, delivery_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
            sr_number, 
            supplier_id, 
            title, 
            pr_reference, 
            project_duration, 
            material_desc, 
            material_code, 
            // ??? 靽格迤???暺?嚗?憒????甈?雿???舐征摮?銝莎??撠梯????? 0 ??? null
            quantity || 0, 
            price || 0, 
            total_price || 0, 
            incoterm, 
            payment_term, 
            delivery_date || null, // ??交??憒??????舐征摮?銝脖??閬?頧? null
            start_date || null, 
            end_date || null
        ]
    );
    res.redirect(`/create?success=true&msg=Sourcing Request Created&id=${sr_number}`);
});

// --- Create PO (Manual or From SR) ---
// 1. 靽格?? GET /create/po (?????? SR 鞈????蝯虫???????詨?桃??)
app.get('/create/po', requireLogin, async (req, res) => {
    // ??????????????? In Progress ??? Completed ??? SR嚗?霈?雿輻?刻????豢??
    const srResult = await pool.query("SELECT * FROM sourcing_requests ORDER BY created_at DESC");
    
    res.render('create/po', { 
        user: req.session.user,
        srs: srResult.rows // ??喲?? srs 蝯血??蝡?
    });
});

// 4. Create PO - 靽格?? Redirect
// app.js - 靽格迤 PO 撱箇??頝舐?? (??????蝛箏?澆??憿?)
app.post('/create/po', requireLogin, async (req, res) => {
    const po_number = generateID('PO');
    const { sr_reference, supplier_name, material_code, material_name, quantity, unit_price, total_amount, delivery_date, start_date, end_date } = req.body;
    
    await pool.query(
        `INSERT INTO purchase_orders 
        (po_number, sr_reference, supplier_name, material_code, material_name, quantity, unit_price, total_amount, delivery_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
            po_number, 
            sr_reference || null, 
            supplier_name, 
            material_code, 
            material_name, 
            // ??? 靽格迤???暺?嚗?????????詨??蝛箏??
            quantity || 0, 
            unit_price || 0, 
            total_amount || 0, 
            delivery_date || null,
            start_date || null, 
            end_date || null
        ]
    );
    
    // 撱箇??撠?????????拇????????
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
// 2. ??啣?? GET /status (Status ??詨?桅?????)
app.get('/status', requireLogin, (req, res) => {
    res.render('status/menu', { user: req.session.user });
});
// 3. ??啣?? GET /status/pr-po (PR-PO ????????亥岷??????)
app.get('/status/pr-po', requireLogin, async (req, res) => {
    // 靽格?? app.js 銝? /status/pr-po ??? SQL嚗??????? pr.id
    let query = `
        SELECT 
            pr.id as pr_id,  -- ??? ??啣?????銵?嚗??????? ID 靘????蝡舫??蝯?雿輻??
            pr.pr_number, pr.item_name, pr.status as pr_status, pr.created_at as pr_date,
            sr.sr_number, sr.status as sr_status,
            po.po_number, po.status as po_status,
            ds.status as delivery_status
        FROM purchase_requests pr
        LEFT JOIN sourcing_requests sr ON pr.pr_number = sr.pr_reference
        LEFT JOIN purchase_orders po ON sr.sr_number = po.sr_reference
        LEFT JOIN delivery_status ds ON po.po_number = ds.po_number
    `;
    
    // ???撠????頛?
    let params = [];
    if (req.query.search) {
        query += ` WHERE pr.pr_number ILIKE $1 OR po.po_number ILIKE $1 OR sr.sr_number ILIKE $1`;
        params.push(`%${req.query.search}%`);
    }
    
    query += ` ORDER BY pr.created_at DESC`;

    const result = await pool.query(query, params);
    res.render('status/pr_po', { user: req.session.user, data: result.rows });
});

// app.js - 新增 Delivery View 路由

// GET: View Delivery Details (新增)
app.get('/status/delivery/:id', requireLogin, async (req, res) => {
    const id = req.params.id;
    
    // 撈取物流狀態，並關聯 PO 表格以獲取更多資訊 (供應商、時間)
    const query = `
        SELECT 
            ds.*,
            po.supplier_name, po.quantity, po.total_amount,
            po.start_date, po.end_date
        FROM delivery_status ds
        LEFT JOIN purchase_orders po ON ds.po_number = po.po_number
        WHERE ds.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length > 0) {
        res.render('status/delivery_view', { user: req.session.user, data: result.rows[0] });
    } else {
        res.send("Delivery Record Not Found");
    }
});

// app.js (??啣????典??)

// 1. GET: ??脣?亦楊頛舫????? (Edit Page)
app.get('/status/delivery/:id/edit', requireLogin, async (req, res) => {
    const id = req.params.id;
    const result = await pool.query("SELECT * FROM delivery_status WHERE id = $1", [id]);
    
    if (result.rows.length > 0) {
        res.render('status/edit', { user: req.session.user, delivery: result.rows[0] });
    } else {
        res.send("Status Record Not Found");
    }
});

// 2. PUT: ??湔?啁????? (Update Logic)
app.put('/status/delivery/:id', requireLogin, async (req, res) => {
    const id = req.params.id;
    const { status } = req.body;
    
    // ??湔?啁??????????????
    await pool.query(
        "UPDATE delivery_status SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [status, id]
    );
    
    // 頝唾????????銵其蒂憿舐內??????閮????
    res.redirect('/status/delivery?success=true&msg=Status Updated Successfully');
});

// 3. DELETE: ??芷?斤????? (Delete Logic)
app.delete('/status/delivery/:id', requireLogin, async (req, res) => {
    const id = req.params.id;
    
    await pool.query("DELETE FROM delivery_status WHERE id = $1", [id]);
    
    res.redirect('/status/delivery?success=true&msg=Record Deleted');
});

// app.js

// 1. GET: View Details (唯讀詳情頁)
app.get('/status/pr-po/:id', requireLogin, async (req, res) => {
    // 這個 Query 需要撈出所有欄位，包含 start_date, end_date, price, budget 等
    const query = `
        SELECT 
            pr.id as pr_id, pr.pr_number, pr.item_name, pr.material_code, pr.quantity, pr.budget, pr.status as pr_status,
            sr.sr_number, sr.supplier_id, sr.title, sr.price, sr.status as sr_status, 
            sr.start_date as sr_start, sr.end_date as sr_end,
            po.po_number, po.supplier_name, po.total_amount, po.status as po_status,
            po.start_date as po_start, po.end_date as po_end
        FROM purchase_requests pr
        LEFT JOIN sourcing_requests sr ON pr.pr_number = sr.pr_reference
        LEFT JOIN purchase_orders po ON sr.sr_number = po.sr_reference
        WHERE pr.id = $1
    `;
    
    const result = await pool.query(query, [req.params.id]);
    
    if (result.rows.length > 0) {
        // 判斷是否為 "Edit" 請求 (因為 Edit 跟 View 路徑很像，這是一種簡單的區分方式，或你保持原有的 /edit 路由)
        // 這裡我們直接 render view 頁面
        res.render('status/pr_po_view', { user: req.session.user, data: result.rows[0] });
    } else {
        res.send("Record not found");
    }
});

// --- 找到原本的 /status/pr-po/:id/edit 並替換成這段 ---

// 2. GET: 進入 PR-PO 編輯頁面 (更新版 - 包含日期欄位)
app.get('/status/pr-po/:id/edit', requireLogin, async (req, res) => {
    const prId = req.params.id;
    
    // 更新 SQL: 多撈出 sr_start, sr_end, po_start, po_end
    const query = `
        SELECT 
            pr.id as pr_id, pr.pr_number, pr.status as pr_status,
            sr.sr_number, sr.status as sr_status,
            sr.start_date as sr_start, sr.end_date as sr_end, -- 新增
            po.po_number, po.status as po_status,
            po.start_date as po_start, po.end_date as po_end  -- 新增
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

// --- 找到原本的 app.put('/status/pr-po/:id') 並替換成這段 ---

// 3. PUT: 同時更新 PR, SR, PO 的狀態與日期 (更新版)
app.put('/status/pr-po/:id', requireLogin, async (req, res) => {
    const prId = req.params.id;
    // 接收新的欄位：包含狀態與日期
    const { pr_status, sr_status, sr_number, po_status, po_number, sr_start, sr_end, po_start, po_end } = req.body;
    
    try {
        // 1. 更新 PR 狀態
        await pool.query("UPDATE purchase_requests SET status = $1 WHERE id = $2", [pr_status, prId]);
        
        // 2. 如果有 SR，更新 SR 狀態與日期
        if (sr_number) {
            await pool.query(
                "UPDATE sourcing_requests SET status=$1, start_date=$2, end_date=$3 WHERE sr_number=$4", 
                [sr_status, sr_start || null, sr_end || null, sr_number]
            );
        }
        
        // 3. 如果有 PO，更新 PO 狀態與日期
        if (po_number) {
            await pool.query(
                "UPDATE purchase_orders SET status=$1, start_date=$2, end_date=$3 WHERE po_number=$4", 
                [po_status, po_start || null, po_end || null, po_number]
            );
        }
        
        res.redirect('/status/pr-po?success=true&msg=Process Status & Dates Updated');
    } catch (err) {
        res.send("Update Error: " + err.message);
    }
});

// 3. DELETE: ??芷?? PR (??湔??瘚?蝔????皞????)
app.delete('/status/pr-po/:id', requireLogin, async (req, res) => {
    const prId = req.params.id;
    
    // ??芷?? PR ??喳?荔???????箄???????? LEFT JOIN PR嚗?PR 瘨?憭勗????游??瘨?憭?
    // (??函??撖? ERP 銝剖?航?賣???????游?渲牲???瑼Ｘ?伐??雿?雿?璆剔毀蝧????璅???臬?臭誑???)
    await pool.query("DELETE FROM purchase_requests WHERE id = $1", [prId]);
    
    res.redirect('/status/pr-po?success=true&msg=Purchase Request Deleted');
});

app.get('/supplier', requireLogin, (req, res) => res.render('supplier/index', { user: req.session.user }));
app.get('/suppliers', requireLogin, async (req, res) => {
     // 蝪∪?桃??靘??????????銵? (??亥?????摨急?? suppliers 銵典?航?????)
     res.send("Supplier List Placeholder");
});

// app.js - Profile Routes (修改版)

// 1. GET: Read Profile (檢視個人資料 - 預設頁面)
app.get('/profile', requireLogin, (req, res) => {
    res.render('profile', { user: req.session.user });
});

// 2. GET: Edit Profile (進入修改畫面)
app.get('/profile/edit', requireLogin, (req, res) => {
    res.render('profile_edit', { user: req.session.user });
});

// 3. POST: Save Changes (儲存並跳轉回檢視頁面)
app.post('/profile', requireLogin, async (req, res) => {
    const { fullname, phone, email } = req.body;
    const userId = req.session.user.id;
    
    // 更新資料庫
    await pool.query(
        "UPDATE users SET fullname=$1, phone=$2, email=$3 WHERE id=$4",
        [fullname, phone, email, userId]
    );
    
    // 更新 session 中的使用者資料，確保頁面顯示最新資訊
    const updatedUser = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    req.session.user = updatedUser.rows[0];
    
    // ★ 修改這裡：成功後跳轉回 Read Profile (/profile)，並帶上成功訊息
    res.redirect('/profile?success=true&msg=Profile Updated Successfully');
});

app.listen(port, () => console.log(`http://localhost:${port}`));