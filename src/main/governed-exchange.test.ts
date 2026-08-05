import { describe, expect, it } from 'vitest';
import { commitGovernedExchange, createGovernedExchangeExport, previewGovernedExchange } from './governed-exchange';

describe('governed exchange preview', () => {
  it('returns a deterministic checksum and accepts mapped valid rows', () => {
    const preview = previewGovernedExchange({ resource: 'customer', fileName: 'customers.csv', rawCsv: 'name,email\nAcme,ops@acme.test', mappings: [{ source: 'name', target: 'name', required: true }, { source: 'email', target: 'email', required: true }], uniqueTarget: 'email' });
    expect(preview.acceptedRows).toBe(1);
    expect(preview.rejectedRows).toBe(0);
    expect(preview.receiptStatus).toBe('preview');
    expect(preview.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks unknown columns, missing required fields, and duplicate keys', () => {
    const preview = previewGovernedExchange({ resource: 'customer', fileName: 'customers.csv', rawCsv: 'name,email,secret\n,ops@acme.test,x\nAcme,ops@acme.test,y', mappings: [{ source: 'name', target: 'name', required: true }, { source: 'email', target: 'email', required: true }], uniqueTarget: 'email' });
    expect(preview.receiptStatus).toBe('blocked');
    expect(preview.rejectedRows).toBe(2);
    expect(preview.exceptions.map(({ code }) => code)).toEqual(expect.arrayContaining(['unknown-column', 'missing-required', 'duplicate']));
  });

  it('commits only an unchanged, exception-free preview with an accountable actor', () => {
    const preview = previewGovernedExchange({ resource: 'customer', fileName: 'customers.csv', rawCsv: 'name,email\nAcme,ops@acme.test', mappings: [{ source: 'name', target: 'name', required: true }, { source: 'email', target: 'email', required: true }] });
    expect(commitGovernedExchange({ preview, expectedChecksum: preview.checksum, actorId: 'user-finance', committedAt: '2026-07-17T01:00:00.000Z' })).toMatchObject({ committedBy: 'user-finance', acceptedRows: 1 });
    expect(() => commitGovernedExchange({ preview, expectedChecksum: 'b'.repeat(64), actorId: 'user-finance' })).toThrow('checksum');
  });

  it('creates a deterministic scope-bound export artifact with escaped CSV and checksum evidence', () => {
    const input = { resource: 'customer', fileName: 'customers.csv', companyId: 'company-north', branchId: 'branch-mumbai', fields: ['id', 'name', 'note'], records: [{ id: 'b', name: 'Beta', note: 'Line 2' }, { id: 'a', name: 'Acme, Ltd', note: 'Line 1\nFollow-up' }], actorId: 'user-finance', generatedAt: '2026-07-18T01:00:00.000Z' };
    const first = createGovernedExchangeExport(input);
    const second = createGovernedExchangeExport({ ...input, records: [...input.records].reverse() });
    expect(first.csv).toBe('id,name,note\na,"Acme, Ltd","Line 1\nFollow-up"\nb,Beta,Line 2');
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.checksum).toBe(second.checksum);
    expect(first).toMatchObject({ companyId: 'company-north', branchId: 'branch-mumbai', rows: 2, generatedBy: 'user-finance' });
  });
});
