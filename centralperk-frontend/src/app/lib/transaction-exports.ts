import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../utils/supabase/client';
import { getRoleFromSession } from '../auth/auth';
import { loadPointsLedgerViaApi } from './api';
import { findMemberProfileByEmail } from './member-service-api';

export type ExportTransactionRow = {
  transaction_date: string;
  transaction_type: string;
  points: number;
  amount_spent: number | null;
  reason: string | null;
  member_id?: number | null;
};

function transactionNote(row: { reason?: string | null; description?: string | null }) {
  return row.reason ?? row.description ?? null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

async function getCustomerMemberId() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userEmail = authData.user?.email;
  if (!userEmail) {
    throw new Error('No logged-in user email found for customer export.');
  }

  const member = await findMemberProfileByEmail(userEmail);
  if (!member) {
    throw new Error('No loyalty member profile found for this customer account.');
  }

  return {
    id: Number(member.id ?? member.memberId ?? member.member_id) || null,
    externalMemberId: Number(member.member_id ?? member.memberId ?? member.id) || null,
  };
}

export async function fetchTransactionsForExport(): Promise<ExportTransactionRow[]> {
  const role = await getRoleFromSession();
  const ledger = await loadPointsLedgerViaApi(5000);
  let rows = ledger.transactions || [];

  if (role === 'customer') {
    const member = await getCustomerMemberId();
    const ids = new Set([member.id, member.externalMemberId].filter((value) => value !== null).map(String));
    if (ids.size === 0) {
      throw new Error('Unable to resolve member ID for customer export.');
    }
    rows = rows.filter((row) => ids.has(String(row.member_id)));
  }

  return rows.map((row) => ({
    transaction_date: String(row.transaction_date),
    transaction_type: String(row.transaction_type),
    points: Number(row.points || 0),
    amount_spent: Number((row as any).amount_spent ?? 0) || null,
    reason: transactionNote(row),
    member_id: Number(row.member_id) || null,
  }));
}

function csvEscape(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function exportToCSV(data: ExportTransactionRow[], filename: string) {
  const headers = ['Transaction Date', 'Transaction Type', 'Points', 'Amount Spent', 'Reason'];
  const rows = data.map((row) => [
    formatDate(row.transaction_date),
    row.transaction_type,
    row.points,
    row.amount_spent ?? '',
    row.reason ?? '',
  ]);

  const csv = [headers, ...rows].map((line) => line.map(csvEscape).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToPDF(data: ExportTransactionRow[], filename: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Transaction Report', 40, 40);

  autoTable(doc, {
    startY: 60,
    head: [['Transaction Date', 'Transaction Type', 'Points', 'Amount Spent', 'Reason']],
    body: data.map((row) => [
      formatDate(row.transaction_date),
      row.transaction_type,
      row.points,
      row.amount_spent ?? '-',
      row.reason ?? '-',
    ]),
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [26, 43, 71], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  doc.save(`${filename}.pdf`);
}
