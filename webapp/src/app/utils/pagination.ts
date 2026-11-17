export interface Page<T> {
  records: T[];
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  start: number;
  end: number;
}

/** Paginate the already authorized/filtered records without mutating their order or identities. */
export function paginate<T>(records: readonly T[], requestedPage = 1, pageSize = 10): Page<T> {
  const size = [10, 25, 50].includes(Number(pageSize)) ? Number(pageSize) : 10;
  const total = records.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(requestedPage)) || 1));
  const offset = (page - 1) * size;
  return {
    records: records.slice(offset, offset + size),
    page,
    pages,
    pageSize: size,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(total, offset + size),
  };
}

export function pageButtons(current: number, total: number): (number | '…')[] {
  const values =
    total <= 7
      ? Array.from({ length: total }, (_, index) => index + 1)
      : [1, current - 1, current, current + 1, total].filter((page) => page >= 1 && page <= total);
  const pages = [...new Set(values)].sort((a, b) => a - b);
  const result: (number | '…')[] = [];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index]!;
    if (index && page - pages[index - 1]! > 1) result.push('…');
    result.push(page);
  }
  return result;
}
