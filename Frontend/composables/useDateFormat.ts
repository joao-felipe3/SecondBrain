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

export function formatYMD(date?: string | Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  const yyyy = d.getFullYear();
  // pad month/day with leading zeros
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

export default function useDateFormat() {
  return { formatDeadline, formatDate, formatYMD };
}
