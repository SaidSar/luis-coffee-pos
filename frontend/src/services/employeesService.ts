import api from './api';
import type { Employee, EmployeeDetail, EmployeeInput, EmployeeQuery, PayrollInput, TempPasswordResult } from '../types/employees';

export const employeesService = {
  list: (q: EmployeeQuery) =>
    api.get<{ items: Employee[] }>('/employees', {
      params: { from: q.from, to: q.to, ...(q.search ? { search: q.search } : {}), ...(q.role ? { role: q.role } : {}), ...(q.active ? { active: q.active } : {}) },
    }).then(r => r.data.items),
  get:        (id: string, q: { from: string; to: string }) => api.get<EmployeeDetail>(`/employees/${id}`, { params: q }).then(r => r.data),
  create:     (input: EmployeeInput) => api.post<TempPasswordResult>('/employees', input).then(r => r.data),
  update:     (id: string, input: Partial<EmployeeInput>) => api.patch<Employee>(`/employees/${id}`, input).then(r => r.data),
  deactivate: (id: string) => api.post<Employee>(`/employees/${id}/deactivate`).then(r => r.data),
  activate:   (id: string) => api.post<Employee>(`/employees/${id}/activate`).then(r => r.data),
  resetPassword: (id: string) => api.post<TempPasswordResult>(`/employees/${id}/reset-password`).then(r => r.data),
  payroll:    (id: string, input: PayrollInput) => api.post(`/employees/${id}/payroll`, input).then(r => r.data),
};
