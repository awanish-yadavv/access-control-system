'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import moment from 'moment';

interface InvoiceDetail {
  id: string;
  code: string;
  customer_id: string;
  customer_name: string | null;
  customer_email: string;
  subscription_id: string | null;
  amount: number;
  gst_rate: number | null;
  gst_amount: number | null;
  description: string | null;
  notes: string | null;
  status: 'unpaid' | 'paid' | 'void';
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  // tenant info
  tenant_name: string;
  tenant_gst_enabled: boolean;
  tenant_gst_type: 'igst' | 'cgst_sgst';
  tenant_gstin: string | null;
  tenant_gst_legal_name: string | null;
  tenant_gst_pan: string | null;
  tenant_gst_rate: number;
  tenant_gst_address: string | null;
  tenant_gst_state: string | null;
  tenant_gst_state_code: string | null;
}

const PrintInvoicePage = () => {
  const { tenant: tenantId, id: invId } = useParams<{ tenant: string; id: string }>();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    apiGet<InvoiceDetail>(`/tenants/${tenantId}/customer-invoices/${invId}`)
      .then(res => setInvoice(res.data))
      .catch(() => setError('Failed to load invoice'));
  }, [tenantId, invId]);

  useEffect(() => {
    if (!invoice) return;
    const timer = setTimeout(() => { window.print(); }, 600);
    return () => clearTimeout(timer);
  }, [invoice]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-destructive font-mono text-sm">{error}</p>
    </div>
  );

  if (!invoice) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground font-mono text-sm">Loading invoice…</p>
    </div>
  );

  const isPaid      = invoice.status === 'paid';
  const hasGst      = invoice.tenant_gst_enabled && invoice.gst_amount != null && invoice.gst_rate != null;
  const isIgst      = invoice.tenant_gst_type === 'igst';
  const baseAmt     = Number(invoice.amount);
  const gstAmt      = Number(invoice.gst_amount ?? 0);
  const totalAmt    = baseAmt + gstAmt;
  const gstRate     = hasGst ? Number(invoice.gst_rate) : 0;
  const halfRate    = gstRate / 2;
  const cgst        = hasGst && !isIgst ? Math.round(gstAmt * 50) / 100 : 0;
  const sgst        = hasGst && !isIgst ? gstAmt - cgst : 0;

  return (
    <>
      {/* Screen toolbar — hidden on print */}
      <div className="print:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border px-6 py-3 flex items-center justify-between">
        <Link href={`/${tenantId}/invoices`} className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Invoices
        </Link>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-[10px] uppercase px-2.5 py-0.5 rounded-full border ${
            isPaid ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {invoice.status}
          </span>
          <button
            onClick={() => window.print()}
            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md font-mono text-[11px] tracking-[0.08em] uppercase hover:opacity-90 transition-opacity"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Page wrapper — adds top padding on screen for toolbar */}
      <div className="print:pt-0 pt-14 bg-gray-100 min-h-screen print:bg-white flex justify-center py-8 print:py-0">

        {/* A4 invoice sheet */}
        <div className="relative w-[210mm] min-h-[297mm] bg-white print:shadow-none shadow-2xl p-[14mm] text-gray-800 overflow-hidden">

          {/* Watermark */}
          {isPaid && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" style={{ zIndex: 0 }}>
              <span className="text-[100px] font-black text-green-500 opacity-[0.06] rotate-[-35deg] tracking-widest uppercase">PAID</span>
            </div>
          )}
          {invoice.status === 'void' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" style={{ zIndex: 0 }}>
              <span className="text-[100px] font-black text-gray-400 opacity-[0.06] rotate-[-35deg] tracking-widest uppercase">VOID</span>
            </div>
          )}

          <div className="relative z-10">
            {/* Header row */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-800">
              {/* Tenant info — left */}
              <div className="max-w-[55%]">
                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-tight">
                  {invoice.tenant_gst_legal_name || invoice.tenant_name}
                </h1>
                {invoice.tenant_gstin && (
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5">GSTIN: {invoice.tenant_gstin}</p>
                )}
                {invoice.tenant_gst_pan && (
                  <p className="font-mono text-[10px] text-gray-500">PAN: {invoice.tenant_gst_pan}</p>
                )}
                {invoice.tenant_gst_address && (
                  <p className="text-[11px] text-gray-600 mt-1 leading-snug whitespace-pre-line">{invoice.tenant_gst_address}</p>
                )}
                {(invoice.tenant_gst_state || invoice.tenant_gst_state_code) && (
                  <p className="text-[11px] text-gray-600">
                    {invoice.tenant_gst_state}{invoice.tenant_gst_state_code ? ` (${invoice.tenant_gst_state_code})` : ''}
                  </p>
                )}
              </div>

              {/* Invoice meta — right */}
              <div className="text-right">
                <div className="inline-block bg-gray-900 text-white px-4 py-1 rounded font-mono text-[11px] tracking-[0.14em] uppercase mb-3">
                  {hasGst ? (isIgst ? 'Tax Invoice (IGST)' : 'Tax Invoice') : 'Invoice'}
                </div>
                <table className="text-[11px] ml-auto">
                  <tbody>
                    <tr>
                      <td className="text-gray-500 pr-4 pb-1">Invoice #</td>
                      <td className="font-mono font-bold text-gray-900">{invoice.code}</td>
                    </tr>
                    <tr>
                      <td className="text-gray-500 pr-4 pb-1">Date</td>
                      <td className="font-mono text-gray-800">{moment(invoice.created_at).format('MMM D, YYYY')}</td>
                    </tr>
                    {invoice.due_date && (
                      <tr>
                        <td className="text-gray-500 pr-4">Due Date</td>
                        <td className="font-mono text-gray-800">{moment(invoice.due_date).format('MMM D, YYYY')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bill To */}
            <div className="mb-8">
              <p className="text-[9px] font-mono tracking-[0.18em] uppercase text-gray-400 mb-1.5">Bill To</p>
              <p className="font-bold text-gray-900 text-[13px]">{invoice.customer_name || invoice.customer_email}</p>
              {invoice.customer_name && (
                <p className="text-[12px] text-gray-500">{invoice.customer_email}</p>
              )}
            </div>

            {/* Line item table */}
            <table className="w-full mb-8 text-[12px]">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="text-left px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase rounded-l">Description</th>
                  <th className="text-right px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase">Base Amount</th>
                  {hasGst && (
                    <>
                      <th className="text-right px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase">{isIgst ? 'IGST %' : 'GST %'}</th>
                      <th className="text-right px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase">{isIgst ? 'IGST Amt' : 'GST Amt'}</th>
                    </>
                  )}
                  <th className="text-right px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase rounded-r">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="px-3 py-3 text-gray-800">
                    <p className="font-medium">{invoice.description || 'Service'}</p>
                    {invoice.notes && (
                      <p className="text-[11px] text-gray-500 mt-0.5">{invoice.notes}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">₹{baseAmt.toFixed(2)}</td>
                  {hasGst && (
                    <>
                      <td className="px-3 py-3 text-right font-mono">{Number(invoice.gst_rate)}%</td>
                      <td className="px-3 py-3 text-right font-mono">₹{gstAmt.toFixed(2)}</td>
                    </>
                  )}
                  <td className="px-3 py-3 text-right font-mono font-bold">₹{(hasGst ? baseAmt + gstAmt : baseAmt).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            {/* Tax summary + totals */}
            <div className="flex justify-end mb-10">
              <table className="text-[12px] min-w-[260px]">
                <tbody>
                  <tr>
                    <td className="text-gray-500 py-1 pr-8">Subtotal</td>
                    <td className="text-right font-mono text-gray-800">₹{baseAmt.toFixed(2)}</td>
                  </tr>
                  {hasGst && isIgst && (
                    <tr>
                      <td className="text-gray-500 py-1 pr-8">IGST @ {gstRate.toFixed(1)}%</td>
                      <td className="text-right font-mono text-gray-800">₹{gstAmt.toFixed(2)}</td>
                    </tr>
                  )}
                  {hasGst && !isIgst && (
                    <>
                      <tr>
                        <td className="text-gray-500 py-1 pr-8">CGST @ {halfRate.toFixed(1)}%</td>
                        <td className="text-right font-mono text-gray-800">₹{cgst.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="text-gray-500 py-1 pr-8">SGST @ {halfRate.toFixed(1)}%</td>
                        <td className="text-right font-mono text-gray-800">₹{sgst.toFixed(2)}</td>
                      </tr>
                    </>
                  )}
                  <tr className="border-t-2 border-gray-900">
                    <td className="font-bold text-gray-900 py-2 pr-8 text-[13px]">Total Payable</td>
                    <td className="text-right font-mono font-bold text-gray-900 text-[15px]">₹{totalAmt.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Status footer */}
            <div className="border-t border-gray-200 pt-6 flex items-center justify-between">
              <div>
                {isPaid ? (
                  <div>
                    <span className="inline-block bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded font-mono text-[11px] uppercase tracking-[0.1em] font-bold">
                      PAID
                    </span>
                    {invoice.paid_at && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        Payment received on {moment(invoice.paid_at).format('MMM D, YYYY [at] HH:mm')}
                      </p>
                    )}
                  </div>
                ) : invoice.status === 'void' ? (
                  <span className="inline-block bg-gray-100 text-gray-500 border border-gray-200 px-3 py-1 rounded font-mono text-[11px] uppercase tracking-[0.1em]">VOID</span>
                ) : (
                  <div>
                    <span className="inline-block bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded font-mono text-[11px] uppercase tracking-[0.1em] font-bold">
                      UNPAID
                    </span>
                    {invoice.due_date && (
                      <p className="text-[11px] text-red-500 mt-1">
                        Due {moment(invoice.due_date).format('MMM D, YYYY')}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <p className="font-mono text-[9px] text-gray-400 tracking-[0.08em]">
                Generated {moment().format('MMM D, YYYY')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PrintInvoicePage;
