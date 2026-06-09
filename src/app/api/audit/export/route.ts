import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { listAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Download the audit log (most recent 50k entries) as a JSON file.
export const GET = withAuth(
  async () => {
    const { entries, total } = listAudit({ limit: 50000, offset: 0 });
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), total, entries }, null, 2);
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="audit-log-${Date.now()}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  },
  { role: 'admin' },
);
