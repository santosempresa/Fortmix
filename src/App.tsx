import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { DashboardStats, Product, StockMovement, AuditLog, SaleItem } from './types';
import { Layout } from './components/Layout';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Search, Plus, Minus, Trash2, Printer, CheckCircle, AlertTriangle, TrendingUp, DollarSign, Settings, X, History, Warehouse, Edit, Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- DateRangePicker Component ---
const DateRangePicker: React.FC<{ 
  onApply: (from: string, to: string) => void,
  initialFrom?: Date,
  initialTo?: Date
}> = ({ onApply, initialFrom, initialTo }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [startDate, setStartDate] = useState<Date | null>(initialFrom || startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | null>(initialTo || endOfMonth(new Date()));
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const handleApply = () => {
    if (startDate && endDate) {
      const from = `${format(startDate, 'yyyy-MM-dd')} ${startTime}:00`;
      const to = `${format(endDate, 'yyyy-MM-dd')} ${endTime}:59`;
      onApply(from, to);
      setIsOpen(false);
    }
  };

  const toggleDate = (day: Date) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(day);
      setEndDate(null);
    } else if (day < startDate) {
      setStartDate(day);
    } else {
      setEndDate(day);
    }
  };

  return (
    <div className="relative">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-white border border-slate-200 rounded px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-slate-50 transition-colors text-slate-600 text-xs font-medium shadow-sm"
      >
        <Calendar size={14} className="text-fortmix-red" />
        <span>
          {startDate ? format(startDate, 'dd/MM/yyyy') : '--/--/----'} {startTime} 
          <span className="mx-1 text-slate-400">→</span> 
          {endDate ? format(endDate, 'dd/MM/yyyy') : '--/--/----'} {endTime}
        </span>
        <ChevronDown size={14} className="ml-1 text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-md shadow-2xl z-[200] w-[280px] overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-slate-200 rounded text-slate-500"><ChevronLeft size={14} /></button>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700">{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-slate-200 rounded text-slate-500"><ChevronRight size={14} /></button>
          </div>
          
          <div className="p-3">
            <div className="grid grid-cols-7 gap-0.5 mb-2">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                <div key={i} className="text-center text-[9px] font-bold text-slate-400 py-1">{d}</div>
              ))}
              {days.map((day, i) => {
                const isSelected = (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
                const isInRange = startDate && endDate && day > startDate && day < endDate;
                return (
                  <button
                    key={i}
                    onClick={() => toggleDate(day)}
                    className={`text-[11px] h-7 w-7 rounded flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-fortmix-red text-white font-bold' : 
                      isInRange ? 'bg-red-50 text-fortmix-red' : 
                      isSameMonth(day, currentMonth) ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100">
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1">
                  <History size={10} /> Início
                </label>
                <input 
                  type="time" 
                  value={startTime} 
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:border-fortmix-red"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1">
                  <History size={10} /> Fim
                </label>
                <input 
                  type="time" 
                  value={endTime} 
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:border-fortmix-red"
                />
              </div>
            </div>

            <button 
              onClick={handleApply}
              className="w-full mt-3 bg-fortmix-red hover:bg-red-700 text-white text-[10px] font-bold py-2 rounded flex items-center justify-center gap-2 transition-colors uppercase tracking-wider"
            >
              <CheckCircle size={12} /> Aplicar Período
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Dashboard Component ---
const Dashboard: React.FC = () => {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string, to: string } | null>(null);

  useEffect(() => {
    let url = '/api/dashboard/stats';
    if (dateRange) {
      url += `?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`;
    }
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(setStats);
  }, [token, dateRange]);

  if (!stats) return <div className="animate-pulse">Carregando indicadores...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Dashboard Operacional</h2>
        <DateRangePicker onApply={(from, to) => setDateRange({ from, to })} />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendas Hoje</span>
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-800">R$ {stats.today.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-slate-500 mt-1">{stats.today.count} transações realizadas</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Faturamento Mês</span>
            <DollarSign size={16} className="text-fortmix-red" />
          </div>
          <p className="text-2xl font-bold text-slate-800">R$ {stats.month.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-slate-500 mt-1">Acumulado mensal</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estoque Crítico</span>
            <AlertTriangle size={16} className={stats.criticalStock > 0 ? 'text-amber-500' : 'text-slate-300'} />
          </div>
          <p className="text-2xl font-bold text-slate-800">{stats.criticalStock}</p>
          <p className="text-xs text-slate-500 mt-1">Produtos abaixo do mínimo</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status Sistema</span>
            <CheckCircle size={16} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-800">Operacional</p>
          <p className="text-xs text-slate-500 mt-1">Todos os módulos ativos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-tight">Desempenho de Vendas (Últimos 7 dias)</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => format(new Date(val), 'dd/MM', { locale: ptBR })}
                />
                <YAxis 
                  tick={{ fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => `R$ ${val}`}
                />
                <Tooltip 
                  contentStyle={{ fontSize: '12px', borderRadius: '4px', border: '1px solid #e2e8f0' }}
                  formatter={(val: number) => [`R$ ${val.toFixed(2)}`, 'Vendas']}
                />
                <Bar dataKey="total" fill="#b91c1c" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="card">
          <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-tight">Alertas do Sistema</h3>
          <div className="space-y-3">
            {stats.criticalStock > 0 && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-md">
                <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-900">Estoque Baixo</p>
                  <p className="text-[11px] text-amber-700">{stats.criticalStock} itens precisam de reposição imediata.</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-md">
              <History size={18} className="text-slate-500 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">Auditoria Ativa</p>
                <p className="text-[11px] text-slate-600">Todas as operações estão sendo registradas em tempo real.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- PDV Component ---
const PDV: React.FC = () => {
  const { token } = useAuth();
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [isProcessing, setIsProcessing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const paymentMethods = ['Dinheiro', 'Cartão Débito', 'Cartão Crédito', 'PIX'];

  useEffect(() => {
    fetch('/api/products', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(setProducts);
  }, [token]);

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { id: product.id, name: product.name, price: product.price, quantity: 1 }]);
    }
    setSearch('');
  };

  const removeFromCart = (id: number) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const finalizeSale = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items: cart, payment_method: paymentMethod, total })
      });
      if (res.ok) {
        setCart([]);
        alert('Venda finalizada com sucesso!');
      }
    } catch (err) {
      alert('Erro ao processar venda');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const s = search.toLowerCase().trim();
    return p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s);
  }).slice(0, 5);

  // Auto-add product if exact code match (Scanner support)
  useEffect(() => {
    const s = search.trim();
    if (s.length >= 1) {
      const exactMatch = products.find(p => p.code === s);
      if (exactMatch) {
        addToCart(exactMatch);
      }
    }
  }, [search, products]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2: Focus Search
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // F4: Cycle Payment Methods
      if (e.key === 'F4') {
        e.preventDefault();
        setPaymentMethod(prev => {
          const currentIndex = paymentMethods.indexOf(prev);
          const nextIndex = (currentIndex + 1) % paymentMethods.length;
          return paymentMethods[nextIndex];
        });
      }
      // F10: Finalize Sale
      if (e.key === 'F10') {
        e.preventDefault();
        finalizeSale();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, paymentMethod, isProcessing]); // Dependencies for finalizeSale logic

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      <div className="lg:col-span-2 flex flex-col gap-4">
        <div className="card relative">
          <div className="flex items-center gap-3">
            <Search size={20} className="text-slate-400" />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Buscar produto ou bipar código (F2)..." 
              className="w-full bg-transparent border-none focus:ring-0 text-lg font-medium outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredProducts.length === 1) {
                  addToCart(filteredProducts[0]);
                }
              }}
              autoFocus
            />
          </div>
          {search && filteredProducts.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-lg rounded-md z-10 overflow-hidden">
              {filteredProducts.map(p => (
                <button 
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 flex justify-between items-center border-b border-slate-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{p.code} • {p.unit}</p>
                  </div>
                  <p className="text-sm font-bold text-fortmix-red">R$ {p.price.toFixed(2)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card flex-1 overflow-auto p-0 relative">
          {/* Background Logo */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-45 z-0">
            <Warehouse size={120} className="text-fortmix-red" />
            <span className="text-4xl font-black uppercase tracking-[0.2em] mt-2 text-fortmix-red">fortmix</span>
          </div>

          <table className="w-full border-collapse relative z-10">
            <thead>
              <tr>
                <th className="table-header">Item</th>
                <th className="table-header text-right">Preço</th>
                <th className="table-header text-center">Qtd</th>
                <th className="table-header text-right">Subtotal</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="table-cell font-medium">{item.name}</td>
                  <td className="table-cell text-right font-mono">R$ {item.price.toFixed(2)}</td>
                  <td className="table-cell text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-slate-200 rounded"><Minus size={14} /></button>
                      <span className="w-8 text-center font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-slate-200 rounded"><Plus size={14} /></button>
                    </div>
                  </td>
                  <td className="table-cell text-right font-bold font-mono">R$ {(item.price * item.quantity).toFixed(2)}</td>
                  <td className="table-cell text-right">
                    <button onClick={() => removeFromCart(item.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-slate-400 italic">Nenhum item adicionado à venda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="card bg-white text-slate-800 border border-slate-200">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Total da Venda</p>
          <p className="text-4xl font-bold font-mono">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>

        <div className="card space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Forma de Pagamento (F4)</label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map(method => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`px-3 py-2 rounded border text-sm font-medium transition-all ${
                    paymentMethod === method 
                      ? 'bg-fortmix-red border-fortmix-red text-white' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <button 
              onClick={finalizeSale}
              disabled={cart.length === 0 || isProcessing}
              className="w-full btn-primary flex items-center justify-center gap-2 h-12 text-lg"
            >
              {isProcessing ? 'Processando...' : <><CheckCircle size={20} /> Finalizar Venda (F10)</>}
            </button>
            <button className="w-full btn-secondary flex items-center justify-center gap-2">
              <Printer size={18} /> Imprimir Cupom
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Products Component ---
const Products: React.FC = () => {
  const { token, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    code: '', name: '', category: 'Básico', price: 0, cost_price: 0, min_stock: 5, unit: 'Unidade'
  });

  const fetchProducts = () => {
    fetch('/api/products', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(setProducts);
  };

  useEffect(fetchProducts, [token]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        code: product.code,
        name: product.name,
        category: product.category,
        price: product.price,
        cost_price: product.cost_price,
        min_stock: product.min_stock,
        unit: product.unit
      });
    } else {
      setEditingProduct(null);
      setFormData({
        code: '', name: '', category: 'Básico', price: 0, cost_price: 0, min_stock: 5, unit: 'Unidade'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
    const method = editingProduct ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData)
    });
    if (res.ok) {
      setIsModalOpen(false);
      fetchProducts();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Cadastro de Produtos</h2>
        {user?.role !== 'Vendedor' && (
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Novo Produto
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Código</th>
              <th className="table-header">Nome</th>
              <th className="table-header">Categoria</th>
              <th className="table-header text-right">Preço</th>
              <th className="table-header text-center">Estoque</th>
              <th className="table-header">Unid.</th>
              <th className="table-header text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="table-cell font-mono text-xs text-slate-500">{p.code}</td>
                <td className="table-cell font-medium">{p.name}</td>
                <td className="table-cell text-xs text-slate-500">{p.category}</td>
                <td className="table-cell text-right font-bold">R$ {p.price.toFixed(2)}</td>
                <td className="table-cell text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    p.stock_quantity <= p.min_stock ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {p.stock_quantity}
                  </span>
                </td>
                <td className="table-cell text-xs text-slate-500">{p.unit}</td>
                <td className="table-cell text-right">
                  <button 
                    onClick={() => handleOpenModal(p)}
                    className="p-1 text-slate-400 hover:text-fortmix-red transition-colors"
                    title="Editar Produto"
                  >
                    <Edit size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-md shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Código</label>
                  <input required className="input-field" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Unidade</label>
                  <select className="input-field" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})}>
                    <option>Unidade</option>
                    <option>Saco</option>
                    <option>Metro</option>
                    <option>Rolo</option>
                    <option>Kg</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nome do Produto</label>
                <input required className="input-field" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Preço Venda</label>
                  <input type="number" step="0.01" required className="input-field" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Preço Custo</label>
                  <input type="number" step="0.01" required className="input-field" value={formData.cost_price} onChange={e => setFormData({...formData, cost_price: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Alerta de Estoque Mínimo ({formData.unit})</label>
                <input type="number" required className="input-field" value={formData.min_stock} onChange={e => setFormData({...formData, min_stock: parseInt(e.target.value)})} />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Salvar Produto</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Stock Component ---
const Stock: React.FC = () => {
  const { token } = useAuth();
  const [movements, setMovements] = useState<StockMovement[]>([]);

  useEffect(() => {
    fetch('/api/stock/movements', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(setMovements);
  }, [token]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">Movimentação de Estoque</h2>
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Data/Hora</th>
              <th className="table-header">Produto</th>
              <th className="table-header">Tipo</th>
              <th className="table-header text-right">Qtd</th>
              <th className="table-header">Usuário</th>
              <th className="table-header">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {movements.map(m => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="table-cell text-xs text-slate-500">{format(new Date(m.created_at), 'dd/MM/yy HH:mm')}</td>
                <td className="table-cell font-medium">{m.product_name}</td>
                <td className="table-cell">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    m.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 
                    m.type === 'OUT' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {m.type === 'IN' ? 'ENTRADA' : m.type === 'OUT' ? 'SAÍDA' : 'AJUSTE'}
                  </span>
                </td>
                <td className="table-cell text-right font-bold">{m.quantity}</td>
                <td className="table-cell text-xs text-slate-500">{m.user_name}</td>
                <td className="table-cell text-xs text-slate-500 italic">{m.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Audit Component ---
const Audit: React.FC = () => {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string, to: string } | null>(null);

  useEffect(() => {
    let url = '/api/audit';
    if (dateRange) {
      url += `?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`;
    }
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(setLogs);
  }, [token, dateRange]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Log de Auditoria</h2>
        <DateRangePicker onApply={(from, to) => setDateRange({ from, to })} />
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Data/Hora</th>
              <th className="table-header">Usuário</th>
              <th className="table-header">Ação</th>
              <th className="table-header">Entidade</th>
              <th className="table-header">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="table-cell text-xs text-slate-500">{format(new Date(log.created_at), 'dd/MM/yy HH:mm:ss')}</td>
                <td className="table-cell font-bold text-xs">{log.user_name}</td>
                <td className="table-cell text-xs">
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                    {log.action === 'SALE' ? 'VENDA' : log.action === 'LOGIN' ? 'LOGIN' : log.action === 'CREATE' ? 'CRIAÇÃO' : log.action === 'UPDATE' ? 'ATUALIZAÇÃO' : log.action}
                  </span>
                </td>
                <td className="table-cell text-xs text-slate-500 uppercase">
                  {log.entity === 'SALES' ? 'VENDAS' : log.entity === 'AUTH' ? 'AUTENTICAÇÃO' : log.entity === 'PRODUCT' ? 'PRODUTO' : log.entity === 'USER' ? 'USUÁRIO' : log.entity}
                </td>
                <td className="table-cell text-xs text-slate-600">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Reports Component ---
const Reports: React.FC = () => {
  const { token } = useAuth();
  const [data, setData] = useState<{ sales: any[], topProducts: any[] } | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string, to: string } | null>(null);

  useEffect(() => {
    let url = '/api/reports/sales';
    if (dateRange) {
      url += `?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`;
    }
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(setData);
  }, [token, dateRange]);

  if (!data) return <div className="animate-pulse">Gerando relatórios...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Relatórios Gerenciais</h2>
        <DateRangePicker onApply={(from, to) => setDateRange({ from, to })} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-tight">Produtos Mais Vendidos (Valor)</h3>
          <div className="space-y-4">
            {data.topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.total_qty} unidades vendidas</p>
                </div>
                <p className="text-sm font-bold text-emerald-600">R$ {p.total_revenue.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-tight">Últimas Vendas Detalhadas</h3>
          <div className="overflow-auto max-h-[400px]">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Data</th>
                  <th className="table-header">Vendedor</th>
                  <th className="table-header text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="table-cell text-xs">{format(new Date(s.created_at), 'dd/MM/yy HH:mm')}</td>
                    <td className="table-cell text-xs font-medium">{s.user_name}</td>
                    <td className="table-cell text-right font-bold text-xs">R$ {s.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Users Component ---
const Users: React.FC = () => {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', name: '', role: 'Vendedor' });

  const fetchUsers = () => {
    fetch('/api/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(setUsers);
  };

  useEffect(fetchUsers, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(newUser)
    });
    if (res.ok) {
      setIsModalOpen(false);
      fetchUsers();
    }
  };

  if (currentUser?.role !== 'Dono') {
    return <div className="p-10 text-center text-slate-500">Acesso restrito ao proprietário.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Gestão de Usuários</h2>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Novo Usuário
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Nome</th>
              <th className="table-header">Login</th>
              <th className="table-header">Cargo</th>
              <th className="table-header">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="table-cell font-medium">{u.name}</td>
                <td className="table-cell font-mono text-xs">{u.username}</td>
                <td className="table-cell">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    u.role === 'Dono' ? 'bg-purple-100 text-purple-700' : 
                    u.role === 'Gerente' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="table-cell text-xs text-slate-500">{format(new Date(u.created_at), 'dd/MM/yy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-md shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Novo Usuário</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nome Completo</label>
                <input required className="input-field" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Login (Username)</label>
                <input required className="input-field" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Senha</label>
                <input required type="password" className="input-field" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cargo / Permissão</label>
                <select className="input-field" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                  <option value="Vendedor">Vendedor</option>
                  <option value="Gerente">Gerente</option>
                  <option value="Dono">Dono (Proprietário)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Criar Usuário</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const { isAuthenticated, login } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        login(data.token, data.user);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-fortmix-red rounded-lg flex items-center justify-center text-white font-bold text-2xl mb-3 shadow-lg">F</div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">FORTMIX</h1>
            <p className="text-slate-500 text-sm">Gestão Comercial Corporativa</p>
          </div>
          <div className="card">
            <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-2">Acesso ao Sistema</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Usuário</label>
                <input 
                  required 
                  className="input-field" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)} 
                  placeholder="Seu login"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Senha</label>
                <input 
                  required 
                  type="password" 
                  className="input-field" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  placeholder="••••••••"
                />
              </div>
              {error && <p className="text-xs text-fortmix-red font-bold">{error}</p>}
              <button type="submit" className="w-full btn-primary h-11 mt-2">Entrar no Sistema</button>
            </form>
          </div>
          <p className="text-center text-[10px] text-slate-400 mt-8 uppercase tracking-widest">Fortmix ERP v1.0.0 • 2024</p>
        </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <Dashboard />}
      {activeTab === 'pdv' && <PDV />}
      {activeTab === 'products' && <Products />}
      {activeTab === 'stock' && <Stock />}
      {activeTab === 'audit' && <Audit />}
      {activeTab === 'reports' && <Reports />}
      {activeTab === 'users' && <Users />}
    </Layout>
  );
}
