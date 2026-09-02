# Google Apps Script POS review — reuse notes

Reviewed read-only on 2026-09-02: Google Apps Script project **WOOD TRADING POS SYSTEM**.

## Reusable interaction patterns

- Customer and supplier statements with ageing buckets and payment history.
- One universal search across customers, invoices, stock serials and suppliers.
- Bulk-import preview, row-level validation, downloadable errors and immutable import history.
- Item-level return handling, sale duplication and payment-history drill-through.
- Thermal receipt and A4 invoice output choices.
- Small decision charts: sales trend, stock status, expense mix and customer ranking.
- Shipment-level profitability, adapted in Epic BOS to delivery route, rider batch or outlet cost.

## Already covered by Epic BOS

Epic BOS already implements these concepts with scoped records, INR formatting, maker/checker controls,
audit evidence, idempotency and recovery boundaries. Existing owners include the collections, customer 360,
governed import, retail returns, receipt/PDF, command-centre, finance and reporting workbenches.

## Deliberately not imported

- Wood/timber/car/cubic-foot domain fields.
- Demo users, suppliers, customers, transactions or seed credentials.
- Google Sheets as a production database.
- Plain-text passwords and external CDN dependencies.

The Apps Script project is therefore a pattern reference, not a source of production data or a replacement
for Epic BOS domain and governance code.
