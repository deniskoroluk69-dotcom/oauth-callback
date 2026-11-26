export function kyivDate(d: Date | number = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date(d));
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Початок дня (UTC-південь → безпечний для поясу) у секундах Unix. */
export function unix(iso: string, endOfDay = false): number {
  return Math.floor(Date.parse(`${iso}T${endOfDay ? '23:59:59' : '00:00:00'}Z`) / 1000);
}

/** Розбиває діапазон на шматки не довші за maxDays (обмеження API). */
export function chunks(from: string, to: string, maxDays: number): [string, string][] {
  const out: [string, string][] = [];
  let s = from;
  while (s <= to) {
    const e = addDays(s, maxDays - 1) < to ? addDays(s, maxDays - 1) : to;
    out.push([s, e]);
    s = addDays(e, 1);
  }
  return out;
}
