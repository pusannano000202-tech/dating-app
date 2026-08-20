import { readMobileConfig } from '../config/runtime';
import pnuDepartmentCatalog from '../data/pnu-departments.json';

export type MobileDepartment = {
  name: string;
  college: string;
};

export async function getDepartmentCatalog(
  schoolId: string,
  signal?: AbortSignal,
): Promise<MobileDepartment[]> {
  const runtime = readMobileConfig();
  try {
    const response = await fetch(
      `${runtime.apiOrigin}/university-departments/${encodeURIComponent(schoolId)}.json`,
      { signal, cache: 'no-store' },
    );
    if (!response.ok) throw new Error('department_catalog_unavailable');
    return parseDepartmentCatalog(await response.json(), schoolId);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (schoolId === 'pnu') return parseDepartmentCatalog(pnuDepartmentCatalog, schoolId);
    throw error;
  }
}

function parseDepartmentCatalog(payload: unknown, schoolId: string): MobileDepartment[] {
  if (!isRecord(payload) || payload.schoolId !== schoolId || !Array.isArray(payload.departments)) {
    throw new Error('department_catalog_invalid');
  }
  if (payload.departments.length > 500) throw new Error('department_catalog_invalid');

  const departments = payload.departments.flatMap((item): MobileDepartment[] => {
    if (!isRecord(item)) return [];
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const college = typeof item.college === 'string' ? item.college.trim() : '';
    const status = typeof item.status === 'string' ? item.status : '';
    if (!name || !college || name.length > 300 || status === '폐지') return [];
    return [{ name, college }];
  });
  if (departments.length === 0) throw new Error('department_catalog_invalid');
  return departments;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
