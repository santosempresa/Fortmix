import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fortmix-secret-key-2024';

// --- Database Initialization ---
const db = new Database('fortmix.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT CHECK(role IN ('Dono', 'Gerente', 'Vendedor')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    name TEXT,
    category TEXT,
    price REAL,
    cost_price REAL,
    stock_quantity INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 5,
    unit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    total REAL,
    payment_method TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    price REAL,
    FOREIGN KEY(sale_id) REFERENCES sales(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    user_id INTEGER,
    type TEXT CHECK(type IN ('IN', 'OUT', 'ADJ')),
    quantity INTEGER,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    entity TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Seed initial data if empty
const userCount = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)').run('admin', hashedPassword, 'Administrador', 'Dono');
  
  // Sample products
  const products = [
    ['001', 'Cimento CP-II 50kg', 'Básico', 32.90, 25.00, 100, 20, 'Saco'],
    ['002', 'Argamassa AC-I 20kg', 'Básico', 15.50, 10.00, 50, 15, 'Saco'],
    ['003', 'Tubo PVC 100mm 6m', 'Hidráulica', 89.00, 60.00, 30, 5, 'Unidade'],
    ['004', 'Fio Flexível 2.5mm 100m', 'Elétrica', 245.00, 180.00, 10, 3, 'Rolo'],
    ['005', 'Torneira Cozinha Metal', 'Acabamento', 120.00, 75.00, 15, 5, 'Unidade'],
  ];
  
  const insertProd = db.prepare('INSERT INTO products (code, name, category, price, cost_price, stock_quantity, min_stock, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  products.forEach(p => insertProd.run(...p));
}

// --- Middleware ---
app.use(cors());
app.use(express.json());

const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Acesso negado' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ message: 'Token inválido' });
    req.user = user;
    next();
  });
};

const logAudit = (userId: number, action: string, entity: string, details: string) => {
  db.prepare('INSERT INTO audit_logs (user_id, action, entity, details) VALUES (?, ?, ?, ?)').run(userId, action, entity, details);
};

// --- API Routes ---

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

  if (user && bcrypt.compareSync(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    logAudit(user.id, 'LOGIN', 'AUTH', 'Usuário realizou login no sistema');
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } else {
    res.status(401).json({ message: 'Usuário ou senha inválidos' });
  }
});

app.get('/api/dashboard/stats', authenticateToken, (req: any, res) => {
  const { from, to } = req.query;
  
  let dateFilter = "";
  let params: any[] = [];
  
  if (from && to) {
    dateFilter = "WHERE created_at BETWEEN ? AND ?";
    params = [from, to];
  } else {
    dateFilter = "WHERE date(created_at) = date('now')";
  }

  const todaySales = db.prepare(`SELECT COUNT(*) as count, SUM(total) as total FROM sales ${dateFilter}`).get(...params) as any;
  const monthSales = db.prepare("SELECT SUM(total) as total FROM sales WHERE strftime('%m', created_at) = strftime('%m', 'now')").get() as any;
  const criticalStock = db.prepare("SELECT COUNT(*) as count FROM products WHERE stock_quantity <= min_stock").get() as any;
  
  // Chart data (always last 7 days or filtered period)
  let chartQuery = "";
  let chartParams: any[] = [];
  if (from && to) {
    chartQuery = "SELECT date(created_at) as date, SUM(total) as total FROM sales WHERE created_at BETWEEN ? AND ? GROUP BY date(created_at) ORDER BY date ASC";
    chartParams = [from, to];
  } else {
    chartQuery = "SELECT date(created_at) as date, SUM(total) as total FROM sales WHERE created_at >= date('now', '-7 days') GROUP BY date(created_at) ORDER BY date ASC";
  }
  
  const chartData = db.prepare(chartQuery).all(...chartParams);

  res.json({
    today: { count: todaySales.count || 0, total: todaySales.total || 0 },
    month: { total: monthSales.total || 0 },
    criticalStock: criticalStock.count || 0,
    chartData
  });
});

app.get('/api/products', authenticateToken, (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
  res.json(products);
});

app.post('/api/products', authenticateToken, (req: any, res) => {
  if (req.user.role === 'Vendedor') return res.status(403).json({ message: 'Sem permissão' });
  
  const { code, name, category, price, cost_price, min_stock, unit } = req.body;
  try {
    const result = db.prepare('INSERT INTO products (code, name, category, price, cost_price, min_stock, unit) VALUES (?, ?, ?, ?, ?, ?, ?)').run(code, name, category, price, cost_price, min_stock, unit);
    logAudit(req.user.id, 'CREATE', 'PRODUCT', `Produto criado: ${name} (${code})`);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ message: 'Erro ao criar produto (Código duplicado?)' });
  }
});

app.put('/api/products/:id', authenticateToken, (req: any, res) => {
  if (req.user.role === 'Vendedor') return res.status(403).json({ message: 'Sem permissão' });
  
  const { id } = req.params;
  const { code, name, category, price, cost_price, min_stock, unit } = req.body;
  try {
    db.prepare('UPDATE products SET code = ?, name = ?, category = ?, price = ?, cost_price = ?, min_stock = ?, unit = ? WHERE id = ?').run(code, name, category, price, cost_price, min_stock, unit, id);
    logAudit(req.user.id, 'UPDATE', 'PRODUCT', `Produto atualizado: ${name} (${code})`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: 'Erro ao atualizar produto' });
  }
});

app.post('/api/sales', authenticateToken, (req: any, res) => {
  const { items, payment_method, total } = req.body;
  
  const transaction = db.transaction(() => {
    const sale = db.prepare('INSERT INTO sales (user_id, total, payment_method) VALUES (?, ?, ?)').run(req.user.id, total, payment_method);
    const saleId = sale.lastInsertRowid;

    for (const item of items) {
      db.prepare('INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)').run(saleId, item.id, item.quantity, item.price);
      db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(item.quantity, item.id);
      db.prepare('INSERT INTO stock_movements (product_id, user_id, type, quantity, reason) VALUES (?, ?, ?, ?, ?)').run(item.id, req.user.id, 'OUT', item.quantity, `Venda #${saleId}`);
    }
    
    logAudit(req.user.id, 'SALE', 'SALES', `Venda realizada: ID #${saleId}, Total R$ ${total}`);
    return saleId;
  });

  try {
    const saleId = transaction();
    res.json({ id: saleId });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao processar venda' });
  }
});

app.get('/api/stock/movements', authenticateToken, (req, res) => {
  const { from, to } = req.query;
  let query = `
    SELECT sm.*, p.name as product_name, u.name as user_name 
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    JOIN users u ON sm.user_id = u.id
  `;
  let params: any[] = [];
  if (from && to) {
    query += " WHERE sm.created_at BETWEEN ? AND ?";
    params = [from, to];
  }
  query += " ORDER BY sm.created_at DESC LIMIT 100";
  
  const movements = db.prepare(query).all(...params);
  res.json(movements);
});

app.get('/api/audit', authenticateToken, (req: any, res) => {
  if (req.user.role !== 'Dono') return res.status(403).json({ message: 'Acesso restrito ao proprietário' });
  const { from, to } = req.query;
  let query = `
    SELECT al.*, u.name as user_name 
    FROM audit_logs al
    JOIN users u ON al.user_id = u.id
  `;
  let params: any[] = [];
  if (from && to) {
    query += " WHERE al.created_at BETWEEN ? AND ?";
    params = [from, to];
  }
  query += " ORDER BY al.created_at DESC LIMIT 200";
  
  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

app.get('/api/users', authenticateToken, (req: any, res) => {
  if (req.user.role !== 'Dono') return res.status(403).json({ message: 'Acesso negado' });
  const users = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY name ASC').all();
  res.json(users);
});

app.post('/api/users', authenticateToken, (req: any, res) => {
  if (req.user.role !== 'Dono') return res.status(403).json({ message: 'Acesso negado' });
  const { username, password, name, role } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)').run(username, hashedPassword, name, role);
    logAudit(req.user.id, 'CREATE', 'USER', `Usuário criado: ${username} (${role})`);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ message: 'Erro ao criar usuário (Login já existe?)' });
  }
});

app.get('/api/reports/sales', authenticateToken, (req: any, res) => {
  const { from, to } = req.query;
  let dateFilter = "";
  let params: any[] = [];
  if (from && to) {
    dateFilter = "WHERE s.created_at BETWEEN ? AND ?";
    params = [from, to];
  }

  const sales = db.prepare(`
    SELECT s.*, u.name as user_name 
    FROM sales s
    JOIN users u ON s.user_id = u.id
    ${dateFilter}
    ORDER BY s.created_at DESC
  `).all(...params);
  
  let topProductsQuery = `
    SELECT p.name, SUM(si.quantity) as total_qty, SUM(si.quantity * si.price) as total_revenue
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    JOIN sales s ON si.sale_id = s.id
  `;
  if (from && to) {
    topProductsQuery += " WHERE s.created_at BETWEEN ? AND ?";
  }
  topProductsQuery += " GROUP BY p.id ORDER BY total_revenue DESC LIMIT 10";

  const topProducts = db.prepare(topProductsQuery).all(...params);

  res.json({ sales, topProducts });
});

// --- Vite Integration ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fortmix ERP running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
