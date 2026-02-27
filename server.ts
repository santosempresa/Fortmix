import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not defined in environment variables. Authentication will fail.');
}

// --- Supabase Integration ---
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Database Initialization (Legacy SQLite for fallback or local dev) ---
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
    cost_price REAL,
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

const logAudit = async (userId: number, action: string, entity: string, details: string) => {
  if (process.env.SUPABASE_URL) {
    await supabase.from('audit_logs').insert([{ user_id: userId, action, entity, details }]);
  } else {
    db.prepare('INSERT INTO audit_logs (user_id, action, entity, details) VALUES (?, ?, ?, ?)').run(userId, action, entity, details);
  }
};

// --- API Routes ---

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  let user: any;
  if (process.env.SUPABASE_URL) {
    const { data } = await supabase.from('users').select('*').eq('username', username).single();
    user = data;
  } else {
    user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  }

  if (user && bcrypt.compareSync(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET!, { expiresIn: '8h' });
    await logAudit(user.id, 'LOGIN', 'AUTH', 'Usuário realizou login no sistema');
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } else {
    res.status(401).json({ message: 'Usuário ou senha inválidos' });
  }
});

app.get('/api/dashboard/stats', authenticateToken, async (req: any, res) => {
  const { from, to } = req.query;
  
  if (process.env.SUPABASE_URL) {
    try {
      // Today Sales
      let todayQuery = supabase.from('sales').select('total', { count: 'exact' });
      if (from && to) {
        todayQuery = todayQuery.gte('created_at', from).lte('created_at', to);
      } else {
        const today = new Date().toISOString().split('T')[0];
        todayQuery = todayQuery.gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`);
      }
      const { count: todayCount, data: todayData } = await todayQuery;
      const todayTotal = todayData?.reduce((acc, s) => acc + s.total, 0) || 0;

      // Net Profit (Month or Period)
      let profitQuery = supabase.from('sale_items').select('quantity, price, cost_price, sales!inner(created_at)');
      if (from && to) {
        profitQuery = profitQuery.gte('sales.created_at', from).lte('sales.created_at', to);
      } else {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0,0,0,0);
        profitQuery = profitQuery.gte('sales.created_at', startOfMonth.toISOString());
      }
      const { data: profitItems } = await profitQuery;
      const netProfit = profitItems?.reduce((acc, item) => acc + (item.quantity * (item.price - (item.cost_price || 0))), 0) || 0;

      // Critical Stock
      const { count: criticalCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).lte('stock_quantity', 'min_stock');

      // Chart Data
      let chartQuery = supabase.from('sales').select('created_at, total');
      if (from && to) {
        chartQuery = chartQuery.gte('created_at', from).lte('created_at', to);
      } else {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        chartQuery = chartQuery.gte('created_at', sevenDaysAgo.toISOString());
      }
      const { data: chartRaw } = await chartQuery;
      
      const chartMap: any = {};
      chartRaw?.forEach(s => {
        const date = s.created_at.split('T')[0];
        chartMap[date] = (chartMap[date] || 0) + s.total;
      });
      const chartData = Object.entries(chartMap).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        today: { count: todayCount || 0, total: todayTotal },
        month: { total: netProfit },
        criticalStock: criticalCount || 0,
        chartData
      });
    } catch (err) {
      res.status(500).json({ message: 'Erro ao carregar estatísticas' });
    }
  } else {
    let dateFilter = "";
    let params: any[] = [];
    
    if (from && to) {
      dateFilter = "WHERE created_at BETWEEN ? AND ?";
      params = [from, to];
    } else {
      dateFilter = "WHERE date(created_at) = date('now')";
    }

    const todaySales = db.prepare(`SELECT COUNT(*) as count, SUM(total) as total FROM sales ${dateFilter}`).get(...params) as any;
    
    // Calculate Net Profit for the month (or filtered period)
    let profitFilter = "";
    let profitParams: any[] = [];
    if (from && to) {
      profitFilter = "WHERE s.created_at BETWEEN ? AND ?";
      profitParams = [from, to];
    } else {
      profitFilter = "WHERE strftime('%m', s.created_at) = strftime('%m', 'now')";
    }

    const profitData = db.prepare(`
      SELECT SUM(si.quantity * (si.price - IFNULL(si.cost_price, 0))) as net_profit 
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${profitFilter}
    `).get(...profitParams) as any;

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
      month: { total: profitData.net_profit || 0 }, // Using net_profit here
      criticalStock: criticalStock.count || 0,
      chartData
    });
  }
});

app.get('/api/products', authenticateToken, async (req, res) => {
  if (process.env.SUPABASE_URL) {
    const { data } = await supabase.from('products').select('*').order('name', { ascending: true });
    res.json(data);
  } else {
    const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
    res.json(products);
  }
});

app.post('/api/products', authenticateToken, async (req: any, res) => {
  if (req.user.role === 'Vendedor') return res.status(403).json({ message: 'Sem permissão' });
  
  const { code, name, category, price, cost_price, min_stock, unit } = req.body;
  try {
    if (process.env.SUPABASE_URL) {
      const { data, error } = await supabase.from('products').insert([{ code, name, category, price, cost_price, min_stock, unit }]).select();
      if (error) throw error;
      await logAudit(req.user.id, 'CREATE', 'PRODUCT', `Produto criado: ${name} (${code})`);
      res.json({ id: data[0].id });
    } else {
      const result = db.prepare('INSERT INTO products (code, name, category, price, cost_price, min_stock, unit) VALUES (?, ?, ?, ?, ?, ?, ?)').run(code, name, category, price, cost_price, min_stock, unit);
      await logAudit(req.user.id, 'CREATE', 'PRODUCT', `Produto criado: ${name} (${code})`);
      res.json({ id: result.lastInsertRowid });
    }
  } catch (err) {
    res.status(400).json({ message: 'Erro ao criar produto (Código duplicado?)' });
  }
});

app.put('/api/products/:id', authenticateToken, async (req: any, res) => {
  if (req.user.role === 'Vendedor') return res.status(403).json({ message: 'Sem permissão' });
  
  const { id } = req.params;
  const { code, name, category, price, cost_price, min_stock, unit } = req.body;
  try {
    if (process.env.SUPABASE_URL) {
      const { error } = await supabase.from('products').update({ code, name, category, price, cost_price, min_stock, unit }).eq('id', id);
      if (error) throw error;
      await logAudit(req.user.id, 'UPDATE', 'PRODUCT', `Produto atualizado: ${name} (${code})`);
      res.json({ success: true });
    } else {
      db.prepare('UPDATE products SET code = ?, name = ?, category = ?, price = ?, cost_price = ?, min_stock = ?, unit = ? WHERE id = ?').run(code, name, category, price, cost_price, min_stock, unit, id);
      await logAudit(req.user.id, 'UPDATE', 'PRODUCT', `Produto atualizado: ${name} (${code})`);
      res.json({ success: true });
    }
  } catch (err) {
    res.status(400).json({ message: 'Erro ao atualizar produto' });
  }
});

app.post('/api/sales', authenticateToken, async (req: any, res) => {
  const { items, payment_method, total } = req.body;
  
  if (process.env.SUPABASE_URL) {
    try {
      // Supabase doesn't support easy multi-table transactions in a single call without RPC
      // But we can do it sequentially for this ERP
      const { data: saleData, error: saleError } = await supabase.from('sales').insert([{ user_id: req.user.id, total, payment_method }]).select();
      if (saleError) throw saleError;
      const saleId = saleData[0].id;

      for (const item of items) {
        const { data: prodData } = await supabase.from('products').select('cost_price, stock_quantity').eq('id', item.id).single();
        const costPrice = prodData?.cost_price || 0;
        const newStock = (prodData?.stock_quantity || 0) - item.quantity;

        await supabase.from('sale_items').insert([{ sale_id: saleId, product_id: item.id, quantity: item.quantity, price: item.price, cost_price: costPrice }]);
        await supabase.from('products').update({ stock_quantity: newStock }).eq('id', item.id);
        await supabase.from('stock_movements').insert([{ product_id: item.id, user_id: req.user.id, type: 'OUT', quantity: item.quantity, reason: `Venda #${saleId}` }]);
      }

      await logAudit(req.user.id, 'SALE', 'SALES', `Venda realizada: ID #${saleId}, Total R$ ${total}`);
      res.json({ id: saleId });
    } catch (err) {
      res.status(500).json({ message: 'Erro ao processar venda' });
    }
  } else {
    const transaction = db.transaction(() => {
      const sale = db.prepare('INSERT INTO sales (user_id, total, payment_method) VALUES (?, ?, ?)').run(req.user.id, total, payment_method);
      const saleId = sale.lastInsertRowid;

      for (const item of items) {
        const product = db.prepare('SELECT cost_price FROM products WHERE id = ?').get(item.id) as any;
        const costPrice = product ? product.cost_price : 0;

        db.prepare('INSERT INTO sale_items (sale_id, product_id, quantity, price, cost_price) VALUES (?, ?, ?, ?, ?)').run(saleId, item.id, item.quantity, item.price, costPrice);
        db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(item.quantity, item.id);
        db.prepare('INSERT INTO stock_movements (product_id, user_id, type, quantity, reason) VALUES (?, ?, ?, ?, ?)').run(item.id, req.user.id, 'OUT', item.quantity, `Venda #${saleId}`);
      }
      
      return saleId;
    });

    try {
      const saleId = transaction();
      logAudit(req.user.id, 'SALE', 'SALES', `Venda realizada: ID #${saleId}, Total R$ ${total}`);
      res.json({ id: saleId });
    } catch (err) {
      res.status(500).json({ message: 'Erro ao processar venda' });
    }
  }
});

app.get('/api/stock/movements', authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  
  if (process.env.SUPABASE_URL) {
    let query = supabase.from('stock_movements').select('*, products(name), users(name)').order('created_at', { ascending: false }).limit(100);
    if (from && to) {
      query = query.gte('created_at', from).lte('created_at', to);
    }
    const { data } = await query;
    const formatted = data?.map(m => ({
      ...m,
      product_name: m.products?.name,
      user_name: m.users?.name
    }));
    res.json(formatted);
  } else {
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
  }
});

app.get('/api/audit', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'Dono') return res.status(403).json({ message: 'Acesso restrito ao proprietário' });
  const { from, to } = req.query;

  if (process.env.SUPABASE_URL) {
    let query = supabase.from('audit_logs').select('*, users(name)').order('created_at', { ascending: false }).limit(200);
    if (from && to) {
      query = query.gte('created_at', from).lte('created_at', to);
    }
    const { data } = await query;
    const formatted = data?.map(al => ({
      ...al,
      user_name: al.users?.name
    }));
    res.json(formatted);
  } else {
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
  }
});

app.get('/api/users', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'Dono') return res.status(403).json({ message: 'Acesso negado' });
  
  if (process.env.SUPABASE_URL) {
    const { data } = await supabase.from('users').select('id, username, name, role, created_at').order('name', { ascending: true });
    res.json(data);
  } else {
    const users = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY name ASC').all();
    res.json(users);
  }
});

app.post('/api/users', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'Dono') return res.status(403).json({ message: 'Acesso negado' });
  const { username, password, name, role } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    if (process.env.SUPABASE_URL) {
      const { data, error } = await supabase.from('users').insert([{ username, password: hashedPassword, name, role }]).select();
      if (error) throw error;
      await logAudit(req.user.id, 'CREATE', 'USER', `Usuário criado: ${username} (${role})`);
      res.json({ id: data[0].id });
    } else {
      const result = db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)').run(username, hashedPassword, name, role);
      await logAudit(req.user.id, 'CREATE', 'USER', `Usuário criado: ${username} (${role})`);
      res.json({ id: result.lastInsertRowid });
    }
  } catch (err) {
    res.status(400).json({ message: 'Erro ao criar usuário (Login já existe?)' });
  }
});

app.get('/api/reports/sales', authenticateToken, async (req: any, res) => {
  const { from, to } = req.query;
  
  if (process.env.SUPABASE_URL) {
    try {
      let salesQuery = supabase.from('sales').select('*, users(name)').order('created_at', { ascending: false });
      if (from && to) {
        salesQuery = salesQuery.gte('created_at', from).lte('created_at', to);
      }
      const { data: sales } = await salesQuery;
      
      const { data: items } = await supabase.from('sale_items').select('*, products(name)');
      
      const formattedSales = sales?.map(s => ({
        ...s,
        user_name: s.users?.name,
        items: items?.filter(i => i.sale_id === s.id).map(i => ({
          ...i,
          name: i.products?.name
        }))
      }));

      // Top products logic for Supabase
      // This is a bit complex in client-side JS, but let's do it
      const productStats: any = {};
      items?.forEach(item => {
        const sale = sales?.find(s => s.id === item.sale_id);
        if (sale) {
          if (!productStats[item.product_id]) {
            productStats[item.product_id] = { name: item.products?.name, total_qty: 0, total_revenue: 0 };
          }
          productStats[item.product_id].total_qty += item.quantity;
          productStats[item.product_id].total_revenue += item.quantity * item.price;
        }
      });
      const topProducts = Object.values(productStats).sort((a: any, b: any) => b.total_revenue - a.total_revenue).slice(0, 10);

      res.json({ sales: formattedSales, topProducts });
    } catch (err) {
      res.status(500).json({ message: 'Erro ao gerar relatório' });
    }
  } else {
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
    `).all(...params) as any[];
    
    const salesWithItems = sales.map(sale => {
      const items = db.prepare(`
        SELECT si.*, p.name 
        FROM sale_items si 
        JOIN products p ON si.product_id = p.id 
        WHERE si.sale_id = ?
      `).all(sale.id);
      return { ...sale, items };
    });

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

    res.json({ sales: salesWithItems, topProducts });
  }
});

// --- Vite Integration ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Fortmix ERP running on http://localhost:${PORT}`);
    });
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});

export default app;
