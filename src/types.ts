export interface User {
  id: number;
  username: string;
  name: string;
  role: 'Dono' | 'Gerente' | 'Vendedor' | 'Estoquista';
}

export interface Product {
  id: number;
  code: string;
  name: string;
  category: string;
  price: number;
  cost_price: number;
  stock_quantity: number;
  min_stock: number;
  unit: string;
  updated_at: string;
}

export interface SaleItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

export interface DashboardStats {
  today: { total: number; count: number };
  month: { total: number };
  criticalStock: number;
  chartData: { date: string; total: number }[];
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name: string;
  user_id: number;
  user_name: string;
  type: 'IN' | 'OUT' | 'ADJUST';
  quantity: number;
  reason: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  entity: string;
  entity_id: number;
  details: string;
  device: string;
  created_at: string;
}
