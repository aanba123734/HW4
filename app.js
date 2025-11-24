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

// �????庫�??�?
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

// ????????? ??��?????�? Middleware (???�?) ?????????
app.use((req, res, next) => {
    // ?????��?????網�??路�??�???? locals�?�??????? EJS �?�???��?�使??? 'currentPath' �????
    res.locals.currentPath = req.path;
    next();
});
// ????????? ??��?????�? Middleware (�????) ?????????

const upload = multer({ dest: 'uploads/' });

// --- Helper: ??��??編�????��????? (Format: PREFIX-YYYYMMDD-Random) ---
const generateID = (prefix) => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000); // 4�???��?????
    return `${prefix}-${date}-${random}`;
};

// --- ???�????�????�? ---
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
        // Purchase Request (PR) - PR_ID ??��????��??
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
        // Sourcing Request (SR) - �????????????? Word ???�?
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
        // Purchase Order (PO) - PO_ID ??��????��??
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                po_number VARCHAR(50) UNIQUE NOT NULL,
                sr_reference VARCHAR(50), -- �???? SR ID
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

// --- API: �????�? AJAX ??�詢??? ---
// ??��?? PR Number ??????�???? (�? SR ???)
app.get('/api/pr/:pr_number', requireLogin, async (req, res) => {
    const result = await pool.query("SELECT * FROM purchase_requests WHERE pr_number = $1", [req.params.pr_number]);
    if (result.rows.length > 0) res.json(result.rows[0]);
    else res.status(404).json({ error: 'Not Found' });
});

// ??��?? SR Number ??????�???? (�? PO ???)
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

// �???? Dashboard (??��?��??)
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

// app.js 修�?��?��??

// 1. Create PR (Manual) - 修�?? Redirect
app.post('/create/pr', requireLogin, async (req, res) => {
    const { item_name, material_code, quantity, budget } = req.body;
    const pr_number = generateID('PR');
    await pool.query(
        'INSERT INTO purchase_requests (pr_number, item_name, material_code, quantity, budget) VALUES ($1, $2, $3, $4, $5)',
        [pr_number, item_name, material_code, quantity, budget]
    );
    // 修�?��??帶�?? success=true ?????��??
    res.redirect(`/create?success=true&msg=Purchase Request Created&id=${pr_number}`);
});

// 2. Create PR (Excel) - 修�?? Redirect
app.post('/create/pr/upload', requireLogin, upload.single('excelFile'), async (req, res) => {
    try {
        const workbook = xlsx.readFile(req.file.path);
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        // console.log("Excel Data Read:", data);

        let count = 0;
        for (let row of data) {
            const pr_number = generateID('PR');
            await pool.query(
                'INSERT INTO purchase_requests (pr_number, item_name, material_code, quantity, budget) VALUES ($1, $2, $3, $4, $5)',
                [pr_number, row.Item, row.MaterialCode || 'N/A', row.Qty, row.Budget || 0]
            );
            count++;
        }
        // 修�?��??帶�????��?��?????
        res.redirect(`/create?success=true&msg=${count} PRs Imported Successfully&id=Batch`);
    } catch (e) { res.send("Error: " + e.message); }
});

// --- Create Sourcing Request (New) ---

// app.js - 修改 Create SR 頁面路由 (加入撈取供應商資料)

app.get('/create/sr', requireLogin, async (req, res) => {
    // 1. 撈取 PR 資料 (給 PR Reference 下拉選單用)
    const prResult = await pool.query("SELECT * FROM purchase_requests ORDER BY created_at DESC");
    
    // 2. ★ 新增：撈取 Supplier 資料 (給 Supplier ID 下拉選單用)
    const supResult = await pool.query("SELECT * FROM suppliers ORDER BY supplier_id ASC");
    
    res.render('create/sr', { 
        user: req.session.user, 
        prs: prResult.rows,
        suppliers: supResult.rows // ★ 將供應商資料傳給前端
    });
});
// app.js - 修正後的 Create SR
app.post('/create/sr', requireLogin, async (req, res) => {
    const sr_number = generateID('SR');
    const { supplier_id, title, pr_reference, project_duration, material_desc, material_code, quantity, price, total_price, incoterm, payment_term, delivery_date, start_date, end_date } = req.body;
    
    await pool.query(
        `INSERT INTO sourcing_requests 
        (
            sr_number, supplier_id, title, pr_reference, project_duration, 
            material_desc, material_code, quantity, price, total_price, 
            incoterm, payment_term, delivery_date, 
            start_date, end_date  -- ★ 務必確認這裡有補上這兩個欄位
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, // ★ 對應到 $15
        [
            sr_number, 
            supplier_id, 
            title, 
            pr_reference, 
            project_duration, 
            material_desc, 
            material_code, 
            quantity || 0, 
            price || 0, 
            total_price || 0, 
            incoterm, 
            payment_term, 
            delivery_date || null,
            start_date || null, // $14
            end_date || null    // $15
        ]
    );
    res.redirect(`/create?success=true&msg=Sourcing Request Created&id=${sr_number}`);
});

// --- Create PO (Manual or From SR) ---
// 1. 修�?? GET /create/po (?????? SR �????給�???????��?��??)
app.get('/create/po', requireLogin, async (req, res) => {
    // ??????????????? In Progress ??? Completed ??? SR�?�?使�?��????��??
    const srResult = await pool.query("SELECT * FROM sourcing_requests ORDER BY created_at DESC");
    
    res.render('create/po', { 
        user: req.session.user,
        srs: srResult.rows // ??��?? srs 給�??�?
    });
});

// app.js - 修正後的 Create PO
app.post('/create/po', requireLogin, async (req, res) => {
    const po_number = generateID('PO');
    const { sr_reference, supplier_name, material_code, material_name, quantity, unit_price, total_amount, delivery_date, start_date, end_date } = req.body;
    
    await pool.query(
        `INSERT INTO purchase_orders 
        (
            po_number, sr_reference, supplier_name, material_code, material_name, 
            quantity, unit_price, total_amount, delivery_date,
            start_date, end_date -- ★ 務必確認這裡有補上這兩個欄位
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, // ★ 對應到 $11
        [
            po_number, 
            sr_reference || null, 
            supplier_name, 
            material_code, 
            material_name, 
            quantity || 0, 
            unit_price || 0, 
            total_amount || 0, 
            delivery_date || null,
            start_date || null, // $10
            end_date || null    // $11
        ]
    );
    
    // 同步建立物流狀態
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
// 2. ??��?? GET /status (Status ??��?��?????)
app.get('/status', requireLogin, (req, res) => {
    res.render('status/menu', { user: req.session.user });
});
// 3. ??��?? GET /status/pr-po (PR-PO ????????�詢??????)
app.get('/status/pr-po', requireLogin, async (req, res) => {
    // 修�?? app.js �? /status/pr-po ??? SQL�??????? pr.id
    let query = `
        SELECT 
            pr.id as pr_id,  -- ??? ??��?????�?�??????? ID �????端�??�?使�??
            pr.pr_number, pr.item_name, pr.status as pr_status, pr.created_at as pr_date,
            sr.sr_number, sr.status as sr_status,
            po.po_number, po.status as po_status,
            ds.status as delivery_status
        FROM purchase_requests pr
        LEFT JOIN sourcing_requests sr ON pr.pr_number = sr.pr_reference
        LEFT JOIN purchase_orders po ON sr.sr_number = po.sr_reference
        LEFT JOIN delivery_status ds ON po.po_number = ds.po_number
    `;
    
    // ???�????�?
    let params = [];
    if (req.query.search) {
        query += ` WHERE pr.pr_number ILIKE $1 OR po.po_number ILIKE $1 OR sr.sr_number ILIKE $1`;
        params.push(`%${req.query.search}%`);
    }
    
    query += ` ORDER BY pr.created_at DESC`;

    const result = await pool.query(query, params);
    res.render('status/pr_po', { user: req.session.user, data: result.rows });
});

// app.js - �s�W Delivery View ����

// GET: View Delivery Details (�s�W)
app.get('/status/delivery/:id', requireLogin, async (req, res) => {
    const id = req.params.id;
    
    // �������y���A�A�����p PO ����H�����h��T (�����ӡB�ɶ�)
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

// app.js (??��????��??)

// 1. GET: ??��?�編輯�????? (Edit Page)
app.get('/status/delivery/:id/edit', requireLogin, async (req, res) => {
    const id = req.params.id;
    const result = await pool.query("SELECT * FROM delivery_status WHERE id = $1", [id]);
    
    if (result.rows.length > 0) {
        res.render('status/edit', { user: req.session.user, delivery: result.rows[0] });
    } else {
        res.send("Status Record Not Found");
    }
});

// 2. PUT: ??��?��????? (Update Logic)
app.put('/status/delivery/:id', requireLogin, async (req, res) => {
    const id = req.params.id;
    const { status } = req.body;
    
    // ??��?��??????????????
    await pool.query(
        "UPDATE delivery_status SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [status, id]
    );
    
    // 跳�????????表並顯示??????�????
    res.redirect('/status/delivery?success=true&msg=Status Updated Successfully');
});

// 3. DELETE: ??��?��????? (Delete Logic)
app.delete('/status/delivery/:id', requireLogin, async (req, res) => {
    const id = req.params.id;
    
    await pool.query("DELETE FROM delivery_status WHERE id = $1", [id]);
    
    res.redirect('/status/delivery?success=true&msg=Record Deleted');
});

// app.js

// 1. GET: View Details (��Ū�Ա���)
app.get('/status/pr-po/:id', requireLogin, async (req, res) => {
    // �o�� Query �ݭn���X�Ҧ����A�]�t start_date, end_date, price, budget ��
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
        // �P�_�O�_�� "Edit" �ШD (�]�� Edit �� View ���|�ܹ��A�o�O�@��²�檺�Ϥ��覡�A�ΧA�O���즳�� /edit ����)
        // �o�̧ڭ̪��� render view ����
        res.render('status/pr_po_view', { user: req.session.user, data: result.rows[0] });
    } else {
        res.send("Record not found");
    }
});

// --- ���쥻�� /status/pr-po/:id/edit �ô������o�q ---

// 2. GET: �i�J PR-PO �s�譶�� (��s�� - �]�t������)
app.get('/status/pr-po/:id/edit', requireLogin, async (req, res) => {
    const prId = req.params.id;
    
    // ��s SQL: �h���X sr_start, sr_end, po_start, po_end
    const query = `
        SELECT 
            pr.id as pr_id, pr.pr_number, pr.status as pr_status,
            sr.sr_number, sr.status as sr_status,
            sr.start_date as sr_start, sr.end_date as sr_end, -- �s�W
            po.po_number, po.status as po_status,
            po.start_date as po_start, po.end_date as po_end  -- �s�W
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

// --- ���쥻�� app.put('/status/pr-po/:id') �ô������o�q ---

// 3. PUT: �P�ɧ�s PR, SR, PO �����A�P��� (��s��)
app.put('/status/pr-po/:id', requireLogin, async (req, res) => {
    const prId = req.params.id;
    // �����s�����G�]�t���A�P���
    const { pr_status, sr_status, sr_number, po_status, po_number, sr_start, sr_end, po_start, po_end } = req.body;
    
    try {
        // 1. ��s PR ���A
        await pool.query("UPDATE purchase_requests SET status = $1 WHERE id = $2", [pr_status, prId]);
        
        // 2. �p�G�� SR�A��s SR ���A�P���
        if (sr_number) {
            await pool.query(
                "UPDATE sourcing_requests SET status=$1, start_date=$2, end_date=$3 WHERE sr_number=$4", 
                [sr_status, sr_start || null, sr_end || null, sr_number]
            );
        }
        
        // 3. �p�G�� PO�A��s PO ���A�P���
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

// 3. DELETE: ??��?? PR (??��??�?�????�????)
app.delete('/status/pr-po/:id', requireLogin, async (req, res) => {
    const prId = req.params.id;
    
    // ??��?? PR ??��?��???????��???????? LEFT JOIN PR�?PR �?失�????��??�?�?
    // (??��??�? ERP 中�?��?��???????��?�謹???檢�?��??�?�?業練�????�???��?�以???)
    await pool.query("DELETE FROM purchase_requests WHERE id = $1", [prId]);
    
    res.redirect('/status/pr-po?success=true&msg=Purchase Request Deleted');
});

app.get('/supplier', requireLogin, (req, res) => res.render('supplier/index', { user: req.session.user }));
app.get('/suppliers', requireLogin, async (req, res) => {
     // 簡�?��??�??????????�? (??��?????庫�?? suppliers 表�?��?????)
     res.send("Supplier List Placeholder");
});

// app.js - Supplier Routes 擴充

// 1. Supplier Menu (原本的選單頁面)
// app.js - 修改 Supplier 入口路由

// 1. Supplier Menu -> 改為直接跳轉到 Info 列表頁
app.get('/supplier', requireLogin, (req, res) => {
    // 原本是: res.render('supplier/index', ...);
    // 修改為: 直接轉址到 /supplier/info
    res.redirect('/supplier/info');
});

// 2. GET: Supplier Information (唯讀列表 Mode)
// app.js - 修改 Supplier Info 路由 (支援搜尋與篩選)

app.get('/supplier/info', requireLogin, async (req, res) => {
    // 1. 基礎 SQL 指令 (使用 WHERE 1=1 方便後續串接 AND)
    let query = "SELECT * FROM suppliers WHERE 1=1";
    let params = [];
    let paramIndex = 1;

    // 2. 處理關鍵字搜尋 (Keyword Search)
    if (req.query.search) {
        // ILIKE 代表不分大小寫搜尋，支援 ID, Name, Phone, Email
        query += ` AND (supplier_id ILIKE $${paramIndex} OR supplier_name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
        params.push(`%${req.query.search}%`);
        paramIndex++;
    }

    // 3. 處理狀態下拉選單 (Status Dropdown)
    if (req.query.status && req.query.status !== 'All') {
        query += ` AND status = $${paramIndex}`;
        params.push(req.query.status);
        paramIndex++;
    }

    query += " ORDER BY supplier_id ASC";

    const result = await pool.query(query, params);

    // 4. 回傳資料給前端 (包含搜尋條件，讓輸入框能保留原本的字)
    res.render('supplier/info', { 
        user: req.session.user, 
        suppliers: result.rows,
        searchQuery: req.query.search || '',  // 保留搜尋文字
        searchStatus: req.query.status || 'All' // 保留下拉選單選項
    });
});

// 3. GET: Add Supplier Page (新增頁面)
app.get('/supplier/add', requireLogin, (req, res) => {
    // 傳入空物件代表是新增模式
    res.render('supplier/form', { user: req.session.user, supplier: null });
});

// 4. POST: Create Supplier (處理新增)
app.post('/supplier/add', requireLogin, async (req, res) => {
    const { supplier_name, phone, email, status } = req.body;
    const supplier_id = generateID('SUP'); // 使用之前的 generateID 函式
    
    await pool.query(
        "INSERT INTO suppliers (supplier_id, supplier_name, phone, email, status) VALUES ($1, $2, $3, $4, $5)",
        [supplier_id, supplier_name, phone, email, status]
    );
    
    res.redirect('/supplier/info?success=true&msg=Supplier Added Successfully');
});

// 5. GET: Edit Supplier Page (編輯頁面)
app.get('/supplier/edit/:id', requireLogin, async (req, res) => {
    const result = await pool.query("SELECT * FROM suppliers WHERE id = $1", [req.params.id]);
    if (result.rows.length > 0) {
        // 傳入 supplier 物件代表是編輯模式
        res.render('supplier/form', { user: req.session.user, supplier: result.rows[0] });
    } else {
        res.redirect('/supplier/info');
    }
});

// 6. POST: Update Supplier (處理更新)
app.post('/supplier/edit/:id', requireLogin, async (req, res) => {
    const { supplier_name, phone, email, status } = req.body;
    
    await pool.query(
        "UPDATE suppliers SET supplier_name=$1, phone=$2, email=$3, status=$4 WHERE id=$5",
        [supplier_name, phone, email, status, req.params.id]
    );
    
    res.redirect('/supplier/info?success=true&msg=Supplier Updated Successfully');
});

// app.js - 新增 Supplier Delete 路由

// 7. DELETE: Remove Supplier (刪除供應商)
app.delete('/supplier/delete/:id', requireLogin, async (req, res) => {
    const id = req.params.id;
    
    try {
        // 執行刪除指令
        await pool.query("DELETE FROM suppliers WHERE id = $1", [id]);
        res.redirect('/supplier/info?success=true&msg=Supplier Deleted Successfully');
    } catch (err) {
        // 若該供應商已被其他表單引用(Foreign Key)，可能會報錯，這邊做簡單處理
        console.error(err);
        res.send("Error: Could not delete supplier. It might be referenced in other records.");
    }
});

// app.js - Profile Routes (�ק睊)

// 1. GET: Read Profile (�˵��ӤH��� - �w�]����)
app.get('/profile', requireLogin, (req, res) => {
    res.render('profile', { user: req.session.user });
});

// 2. GET: Edit Profile (�i�J�ק�e��)
app.get('/profile/edit', requireLogin, (req, res) => {
    res.render('profile_edit', { user: req.session.user });
});

// 3. POST: Save Changes (�x�s�ø���^�˵�����)
app.post('/profile', requireLogin, async (req, res) => {
    const { fullname, phone, email } = req.body;
    const userId = req.session.user.id;
    
    // ��s��Ʈw
    await pool.query(
        "UPDATE users SET fullname=$1, phone=$2, email=$3 WHERE id=$4",
        [fullname, phone, email, userId]
    );
    
    // ��s session �����ϥΪ̸�ơA�T�O������̷ܳs��T
    const updatedUser = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
    req.session.user = updatedUser.rows[0];
    
    // �� �ק�o�̡G���\�����^ Read Profile (/profile)�A�ña�W���\�T��
    res.redirect('/profile?success=true&msg=Profile Updated Successfully');
});

app.listen(port, () => console.log(`http://localhost:${port}`));