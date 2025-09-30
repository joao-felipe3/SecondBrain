export function formatDeadline(date?: string | Date | null): string {
  if (!date) return 'Sem deadline';
  const now = new Date();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  if (diff === 0) return 'Hoje';
  if (diff < 0) return 'ATRASADO!';
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  });
}

export function formatDate(date?: string | Date | null): string {
  if (!date) return 'Não definido';
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

export default function useDateFormat() {
  return { formatDeadline, formatDate };
}
