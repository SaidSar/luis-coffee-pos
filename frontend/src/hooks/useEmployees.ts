import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { employeesService } from '../services/employeesService';
import type { EmployeeInput, EmployeeQuery, PayrollInput } from '../types/employees';

const EMP = ['employees'] as const;

export const useEmployees = (q: EmployeeQuery) =>
  useQuery({ queryKey: [...EMP, 'list', q], queryFn: () => employeesService.list(q), placeholderData: keepPreviousData });

export const useEmployee = (id: string | undefined, q: { from: string; to: string }) =>
  useQuery({ queryKey: [...EMP, 'detail', id, q.from, q.to], queryFn: () => employeesService.get(id!, q), enabled: !!id, placeholderData: keepPreviousData });

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: EMP });
};

export const useCreateEmployee = () => {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (i: EmployeeInput) => employeesService.create(i), onSettled: inv });
};
export const useUpdateEmployee = () => {
  const inv = useInvalidate();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: Partial<EmployeeInput> }) => employeesService.update(id, input), onSettled: inv });
};
export const useSetEmployeeActive = () => {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => (active ? employeesService.activate(id) : employeesService.deactivate(id)),
    onSettled: inv,
  });
};
export const useResetPassword = () => {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => employeesService.resetPassword(id), onSettled: inv });
};

// La nómina es un gasto: cambia empleados, gastos, dashboard (utilidad) y reportes
export const usePayroll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PayrollInput }) => employeesService.payroll(id, input),
    onSettled: () => {
      for (const key of ['employees', 'expenses', 'dashboard', 'reports', 'cash']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
};
