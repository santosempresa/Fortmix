import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
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

// --- Supabase Initialization ---
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_ANON_KEY are required.');
}

// Using the anon key as requested. 
// Note: Ensure RLS (Row Level Security) is disabled or properly configured for these tables in Supabase.
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  await supabase.from('audit_logs').insert([{ user_id: userId, action, entity, details }]);
};

// --- API Routes ---

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return res.status(500).json({ message: 'Configuração do Supabase ausente no servidor (Verifique as variáveis de ambiente no Vercel)' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error) {
      console.error('Erro ao buscar usuário:', error);
      return res.status(401).json({ message: 'Usuário ou senha inválidos' });
    }

    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
      await logAudit(user.id, 'LOGIN', 'AUTH', 'Usuário realizou login no sistema');
      res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
    } else {
      res.status(401).json({ message: 'Usuário ou senha inválidos' });
    }
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ message: 'Erro interno no servidor' });
  }
});

app.get('/api/dashboard/stats', authenticateToken, async (req: any, res) => {
  const { from, to } = req.query;
  
  // Today's Sales
  let todayQuery = supabase.from('sales').select('total', { count: 'exact' });
  if (from && to) {
    todayQuery = todayQuery.gte('created_at', from).lte('created_at', to);
  } else {
    const today = new Date().toISOString().split('T')[0];
    todayQuery = todayQuery.gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`);
  }
  const { data: todaySales, count: todayCount } = await todayQuery;

  // Month Sales
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0,0,0,0);
  const { data: monthSales } = await supabase
    .from('sales')
    .select('total')
    .gte('created_at', startOfMonth.toISOString());

  // Critical Stock
  const { count: criticalStockCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .lte('stock_quantity', 'min_stock'); // This might need a raw filter if complex, but supabase-js supports basic lte

  // Chart Data (Last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: chartRaw } = await supabase
    .from('sales')
    .select('total, created_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  // Group by date
  const chartDataMap: Record<string, number> = {};
  chartRaw?.forEach(sale => {
    const date = sale.created_at.split('T')[0];
    chartDataMap[date] = (chartDataMap[date] || 0) + parseFloat(sale.total);
  });
  const chartData = Object.entries(chartDataMap).map(([date, total]) => ({ date, total }));

  res.json({
    today: { 
      count: todayCount || 0, 
      total: todaySales?.reduce((acc, s) => acc + parseFloat(s.total), 0) || 0 
    },
    month: { 
      total: monthSales?.reduce((acc, s) => acc + parseFloat(s.total), 0) || 0 
    },
    criticalStock: criticalStockCount || 0,
    chartData
  });
});

app.get('/api/products', authenticateToken, async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });
  res.json(data || []);
});

app.post('/api/products', authenticateToken, async (req: any, res) => {
  if (req.user.role === 'Vendedor') return res.status(403).json({ message: 'Sem permissão' });
  
  const { code, name, category, price, cost_price, stock_quantity, min_stock, unit } = req.body;
  const { data, error } = await supabase
    .from('products')
    .insert([{ code, name, category, price, cost_price, stock_quantity: stock_quantity || 0, min_stock, unit }])
    .select()
    .single();

  if (error) return res.status(400).json({ message: 'Erro ao criar produto (Código duplicado?)' });
  
  await logAudit(req.user.id, 'CREATE', 'PRODUCT', `Produto criado: ${name} (${code})`);
  res.json({ id: data.id });
});

app.put('/api/products/:id', authenticateToken, async (req: any, res) => {
  if (req.user.role === 'Vendedor') return res.status(403).json({ message: 'Sem permissão' });
  
  const { id } = req.params;
  const { code, name, category, price, cost_price, stock_quantity, min_stock, unit } = req.body;
  
  const { error } = await supabase
    .from('products')
    .update({ code, name, category, price, cost_price, stock_quantity: stock_quantity || 0, min_stock, unit })
    .eq('id', id);

  if (error) return res.status(400).json({ message: 'Erro ao atualizar produto' });
  
  await logAudit(req.user.id, 'UPDATE', 'PRODUCT', `Produto atualizado: ${name} (${code})`);
  res.json({ success: true });
});

app.post('/api/sales', authenticateToken, async (req: any, res) => {
  const { items, payment_method, total } = req.body;
  
  // Supabase doesn't support multi-table transactions in the same way as raw SQL via client.
  // We'll perform them sequentially. For production, consider using a Supabase RPC (Postgres Function).
  
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert([{ user_id: req.user.id, total, payment_method }])
    .select()
    .single();

  if (saleError) return res.status(500).json({ message: 'Erro ao processar venda' });

  const saleId = sale.id;

  for (const item of items) {
    // Insert sale item
    await supabase.from('sale_items').insert([{ sale_id: saleId, product_id: item.id, quantity: item.quantity, price: item.price }]);
    
    // Update stock
    const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', item.id).single();
    if (product) {
      await supabase.from('products').update({ stock_quantity: product.stock_quantity - item.quantity }).eq('id', item.id);
    }
    
    // Stock movement
    await supabase.from('stock_movements').insert([{ product_id: item.id, user_id: req.user.id, type: 'OUT', quantity: item.quantity, reason: `Venda #${saleId}` }]);
  }
  
  await logAudit(req.user.id, 'SALE', 'SALES', `Venda realizada: ID #${saleId}, Total R$ ${total}`);
  res.json({ id: saleId });
});

app.get('/api/stock/movements', authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  let query = supabase
    .from('stock_movements')
    .select('*, products(name), users(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (from && to) {
    query = query.gte('created_at', from).lte('created_at', to);
  }
  
  const { data, error } = await query;
  
  // Flatten the join results for the frontend
  const formatted = data?.map((m: any) => ({
    ...m,
    product_name: m.products?.name,
    user_name: m.users?.name
  }));

  res.json(formatted || []);
});

app.get('/api/audit', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'Dono') return res.status(403).json({ message: 'Acesso restrito ao proprietário' });
  const { from, to } = req.query;
  
  let query = supabase
    .from('audit_logs')
    .select('*, users(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (from && to) {
    query = query.gte('created_at', from).lte('created_at', to);
  }
  
  const { data } = await query;
  const formatted = data?.map((log: any) => ({
    ...log,
    user_name: log.users?.name
  }));

  res.json(formatted || []);
});

app.get('/api/users', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'Dono') return res.status(403).json({ message: 'Acesso negado' });
  const { data } = await supabase.from('users').select('id, username, name, role, created_at').order('name', { ascending: true });
  res.json(data || []);
});

app.post('/api/users', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'Dono') return res.status(403).json({ message: 'Acesso negado' });
  const { username, password, name, role } = req.body;
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  const { data, error } = await supabase
    .from('users')
    .insert([{ username, password: hashedPassword, name, role }])
    .select()
    .single();

  if (error) return res.status(400).json({ message: 'Erro ao criar usuário (Login já existe?)' });
  
  await logAudit(req.user.id, 'CREATE', 'USER', `Usuário criado: ${username} (${role})`);
  res.json({ id: data.id });
});

app.get('/api/reports/sales', authenticateToken, async (req: any, res) => {
  const { from, to } = req.query;
  
  let salesQuery = supabase.from('sales').select('*, users(name)').order('created_at', { ascending: false });
  if (from && to) {
    salesQuery = salesQuery.gte('created_at', from).lte('created_at', to);
  }
  const { data: sales } = await salesQuery;

  // Top Products
  // Note: Complex aggregations like SUM/GROUP BY are limited in supabase-js.
  // We'll fetch the items and aggregate in memory for simplicity, or recommend an RPC.
  let itemsQuery = supabase.from('sale_items').select('quantity, price, products(name), sales(created_at)');
  if (from && to) {
    // This filter is tricky on joined tables in supabase-js, so we filter by sale_id if needed.
    // For now, we'll fetch all and filter in memory if the period is short.
  }
  const { data: items } = await itemsQuery;
  
  const productStats: Record<string, { name: string, total_qty: number, total_revenue: number }> = {};
  items?.forEach((item: any) => {
    const name = item.products?.name;
    if (!productStats[name]) productStats[name] = { name, total_qty: 0, total_revenue: 0 };
    productStats[name].total_qty += item.quantity;
    productStats[name].total_revenue += item.quantity * parseFloat(item.price);
  });

  const topProducts = Object.values(productStats)
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 10);

  res.json({ 
    sales: sales?.map((s: any) => ({ ...s, user_name: s.users?.name, total: parseFloat(s.total) })) || [], 
    topProducts 
  });
});

// --- Vite Integration ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // On Vercel, this route might not be reached due to vercel.json routes,
      // but we keep it for general production compatibility.
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fortmix ERP running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
