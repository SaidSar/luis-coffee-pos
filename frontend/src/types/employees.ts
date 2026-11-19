import type { Role } from './index';

export type EmployeeRole = Extract<Role, 'ADMIN' | 'CASHIER' | 'WAITER'>;

export interface EmployeeStats {
  ordersTaken: number; tickets: number; sales: number; averageTicket: number;
  deliveries: number; payroll: number; shiftsClosed: number;
}

// Respuestas de /api/employees (nunca traen hash ni tokenVersion)
export interface Employee {
  id: string; name: string; email: string; role: Role; createdAt: string;
  active: boolean; mustChangePassword: boolean; lastLoginAt: string | null;
  stats?: EmployeeStats;
}

export interface EmployeeDetail extends Employee {
  payroll: { id: string; amount: number; date: string; notes: string | null; paidFromCash: boolean; registeredBy: { id: string; name: string } }[];
}

export interface EmployeeQuery { from: string; to: string; search?: string; role?: EmployeeRole; active?: 'true' | 'false' }
export interface EmployeeInput { name: string; email: string; role: EmployeeRole }
export interface PayrollInput { amount: string; date: string; notes?: string; paidFromCash: boolean }

// La contraseña temporal solo vive en memoria del componente que la muestra (nunca en storage ni URL)
export interface TempPasswordResult { employee: Employee; temporaryPassword: string }
