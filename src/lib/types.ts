export type Value = string | number | boolean | Line[];
export type Row = {
  id: string;
  companyId: string;
  branchId: string;
  yearId: string;
  createdAt: string;
  [key: string]: Value;
};
export type Line = {
  id: string;
  productId?: string;
  accountId?: string;
  title: string;
  quantity: number;
  price: number;
  discount: number;
  tax: number;
  debit: number;
  credit: number;
};
export type Field = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'date' | 'select' | 'email' | 'textarea';
  required?: boolean;
  options?: string[];
  ref?: string;
  default?: string | number;
  min?: number;
  max?: number;
  hidden?: boolean;
};
export type Module = {
  key: string;
  title: string;
  singular: string;
  group: string;
  icon: string;
  description: string;
  fields: Field[];
  kind?: 'invoice' | 'journal';
  admin?: boolean;
  status?: string[];
  global?: boolean;
};
export type User = { id: string; name: string; email: string; role: string };
export type Database = {
  version: number;
  collections: Record<string, Row[]>;
  settings: Record<string, Record<string, string | number>>;
  sessions: Record<string, { userId: string; expires: number }>;
  audit: { id: string; message: string; user: string; date: string; companyId: string }[];
};
export type Scope = { companyId: string; branchId: string; yearId: string };
