# India localization boundary

Updated: 2026-07-16

## Implemented baseline

- India business profile with INR, April-March fiscal context, optional PAN, GSTIN, and Udyam references.
- Official GST state-code selector and region-based territory fabric.
- Structural 15-character GSTIN validation plus state-code alignment.
- Priority-based territory and owner assignment with optimistic concurrency for bulk reassignment.
- INR opportunities, account/contact linking, product interests, HSN/SAC capture, and indicative GST rates.
- Commercial quotation previews with intra-state CGST/SGST or inter-state IGST arithmetic.
- Explicit quotation lifecycle and a permanent `commercial-estimate` determination marker.
- Effective-dated HSN/SAC and GST-rate reference catalog with official-source URLs, review status, overlap prevention, and immutable quotation snapshots.
- Effective-dated products, INR price books, quantity tiers, capped discounts, maker-checker quotation approval, and self-approval prevention.
- Governed quotation PDF output with revision identity, commercial-tax disclaimer, and SHA-256 generation receipt.
- Approved quotation conversion to fiscal-year sales-order numbering and service/goods fulfilment plans.
- Controlled tax-invoice drafting and independent issue, including supplier/recipient GSTIN, financial-year numbering, HSN/SAC, place of supply, payment terms, reverse-charge indicator, taxable value, CGST/SGST or IGST, and amount due.
- A distinct bill-of-supply document kind whose exempt/composition decision workflow remains deliberately closed until those tax policies are implemented.
- Immutable delivery/customer-acceptance evidence and accepted-milestone billing with duplicate-billing prevention.
- Credit/debit notes, receivable adjustments, payment allocations, unapplied cash, bank reconciliation, and balanced accounting-export evidence.
- Explicit IRP lifecycle states. Generating or issuing an Epic BOS document does not claim IRN/QR registration; authorised portal exchange remains a separate adapter boundary.
- Native invoice PDF with SHA-256 receipt plus a visually verified A4 India tax-invoice reference artifact.
- Multi-GSTIN branch-registration records and independently reviewed place-of-supply determinations, including explicit Ship-To GSTIN support for bill-to/ship-to transactions.
- State-aware stock locations, allocation-backed shipment packages, package invoicing, vehicle/transport-document capture, dispatch, delivery and returns.
- Checksum and idempotency protected IRP/e-way adapter exchanges whose success state requires an external number, acknowledgement number and timestamp.
- Dispatch gating for e-way-required movements: a dispatch-ready package, issued source invoice, approved matching place-of-supply review, frozen Part B particulars and acknowledged EBN are all distinct controls.
- Failed statutory exchanges retain error evidence and support controlled retry without claiming IRN/EBN registration.
- Inventory valuation supports FIFO, moving weighted average, and serial-level specific identification, with batch/serial custody and item-and-warehouse cost layers.
- Net realisable value review is evidence-backed and maker-checker controlled. Approval records an operational write-down/reversal boundary; it does not claim a general-ledger posting until accounting integration is connected.
- IRN/E-way cancellation, E-way closure and validity extension are separately governed operations with checksummed payload evidence, official preventive timing windows, independent submission and explicit portal acknowledgement.
- Consolidated E-way Bill manifests require two or more active, acknowledged EWBs under one GST registration and freeze vehicle/transport-document evidence before provider handoff.
- Credential-vaulted GSP/IRP adapters declare capabilities and HTTPS pull paths while raw client secrets, API keys and bearer tokens remain encrypted outside renderer state.
- Pull reconciliation records portal status as matched, drift, missing or error; it may correct the operational status only from a normalized external response and always preserves the reconciliation run.
- Signed JSON/QR/operator artifacts can be verified locally against X.509 certificates. Epic BOS persists cryptographic fingerprints and verification facts, not the raw signed content or private credentials.
- Credit exposure, aging, dunning, promise-to-pay, dispute and write-off workflows are account- and receivable-linked, version-safe and maker-checker controlled.
- TDS/TCS policies are effective-dated at the 1 April 2026 transition. Events before that date retain Income-tax Act, 1961 references; later TDS policies use section 393 table items and later TCS policies use section 394 references from the Income-tax Act, 2025.
- Withholding rates, thresholds and table items are controlled finance configuration with authority provenance. Epic BOS validates the effective policy and records accounting/compliance evidence but does not independently determine tax applicability.
- Export and SEZ supplies have a separate zero-rated review gate. LUT/Bond validity, destination/recipient data, SEZ GSTIN and authorized-operations evidence are checked before independent approval; the approved route controls tax arithmetic and the PDF endorsement.
- Bank statements enter through a bounded, checksum-protected CSV preview. Running balances, duplicates and exact amount/date/reference suggestions are validated before commit, while a different user must confirm the payment match.
- Procurement controls validate supplier GSTIN/PAN structure and state alignment, preserve GST-inclusive bid and purchase snapshots, and split input CGST/SGST or input IGST accounting handoffs using the supplier/home-state boundary. Input-tax-credit eligibility remains a finance and statutory review decision.
- Supplier invoices are only operationally accepted after a PO, goods receipt and supplier-invoice comparison. Landed cost is independently approved before capitalising open inventory cost layers.
- Treasury positions retain an evidence reference and can fall back to a committed statement closing balance; account configuration alone is not treated as cash proof. Supplier payment release records an operator-confirmed external bank reference, never bank credentials or a claim that Epic BOS transmitted a banking instruction.
- Cash forecasts are planning scenarios built from controlled operational receivables, payables and liquidity movements. Settlement evidence from the banking channel is authoritative; failed or amount-mismatched evidence remains an exception until independently resolved.
- Manufacturing records preserve an operational Indian plant-control boundary: released BOMs, material issue, batch/serial custody, quality inspection, nonconformance disposition and WIP-to-inventory cost evidence are recorded locally. Product standards, regulated quality regimes, environmental controls and statutory factory compliance require the business's approved domain policies and any applicable authority or certification evidence.
- Customer-delivery records preserve a separate operational boundary: project activation, independent time approval, SLA clocks, support ownership, service-address matching and technician completion evidence are controlled locally. Customer acceptance, regulated service certification, labour compliance and sector-specific field-service obligations require the business's approved policies and applicable external evidence.
- Workforce capacity records link active users to planned daily hours, internal cost, field eligibility, availability and task reservations. They are operational delivery controls only: they do not calculate salary, statutory deductions, PF/ESI, professional tax, labour-law applicability, attendance truth, payslips or disbursements.
- People Ledger adds a controlled payroll calculation boundary: employer registrations, effective-dated policy sources, compensation schedules, benefit enrollments, frozen runs/slips, expense reimbursement and statutory-obligation evidence. Required policies name an employer authority and finalization requires an active reviewed registration for that authority.
- Payroll calculation rates, wage ceilings, thresholds, eligibility, professional-tax applicability and tax declarations are not hard-coded as legal conclusions. They must enter as reviewed, effective-dated organization policy with source provenance, and must be independently approved before they can affect a payroll run.
- Attendance, leave, arrear/recovery adjustments and tax declarations are source-evidence workflows. Approval makes those records eligible for an organization's reviewed payroll policy; it does not independently establish biometric attendance truth, leave-law entitlement, TDS, professional-tax, PF/ESI or other statutory applicability.
- An approved adjustment can be consumed only once by its matching payroll run. Payslip delivery is a private in-app ledger or bounded adapter handoff, not a claim that an email, bank, payroll, EPFO, ESIC or tax authority accepted or processed anything.
- Provider Fabric records the business's own connector activation evidence for banking, payroll and statutory packs: encrypted credentials, a pinned pack version, independent conformance assessment, activation and source-record handoff. It does not assert certification, acceptance, settlement, filing or legal effect on behalf of any provider or government authority.
- Provider status pulls are bounded transport checks against a reviewed HTTPS origin. A normalized external pending, acknowledgement or failure response may update the local evidence ledger; provider-specific authentication, signing, submission formats, certification and operational accreditation remain implementation and provider responsibilities.
- Epic BOS records a payroll payment reference and can prepare balanced accounting handoffs; it does not claim to transmit a salary payment, EPFO/ESIC contribution, challan, return, certificate, ECR or portal filing. The chosen banking, payroll and statutory providers plus an appropriately qualified reviewer remain authoritative.
- Project billing plans, claims, recognition journals, invoice clearing, service-entitlement consumption and accounting-close periods are controlled internal operational/accounting-handoff records. They preserve source delivery evidence and segregation of duties, but do not themselves determine revenue-recognition policy under Ind AS, GST applicability, tax liability, audit opinion, statutory-book finality or return filing treatment.

## Deliberate compliance boundary

Epic BOS does not describe a quotation preview as a tax invoice, e-invoice, return, or legal tax determination. GST registration, classification, place of supply, exemptions, reverse charge, cess, rate selection, and invoice obligations can depend on facts outside CRM. Those decisions require current rules, portal validation, and appropriate professional review.

An Epic BOS issued invoice is an internal controlled business document. When e-invoicing applies, successful IRP acknowledgement, IRN, signed QR code, cancellation, and portal reconciliation must come from an authorised IRP adapter. A PDF export alone never advances that external status.

The current GSTIN check validates structure and state alignment; it does not claim portal registration status. Udyam is stored as an external reference and must be verified on the official portal.

## Authoritative references used

- GST state master codes: https://sandbox.einvoice5.gst.gov.in/MasterCodes
- GST portal guidance confirming GSTIN as a 15-character identifier: https://tutorial.gst.gov.in/userguide/refund/Refund_of_ITC_paid_on_Exports_of_Goods_and_Services.htm
- GST e-Invoice system boundary for registered B2B invoices: https://einvoice1.gst.gov.in/
- Official Udyam registration and verification portal: https://udyamregistration.gov.in/
- GST Portal HSN/SAC search guidance and its explicit non-binding disclaimer: https://tutorial.gst.gov.in/userguide/taxpayersdashboard/Search_HSN_SAC_Tax_Rates_manual.htm
- GST Portal HSN/SAC search facility: https://services.gst.gov.in/services/searchhsnsac
- GSTN advisory on current HSN validation and downloadable HSN/SAC lists: https://tutorial.gst.gov.in/downloads/news/updated_advisory_on_hsn_validation_21.01.25.pdf
- CBIC tax-invoice rules and required particulars: https://cbic-gst.gov.in/gst-invoice-rules.html
- CBIC GST tax-invoice guidance: https://cbic-gst.gov.in/pdf/e-version-gst-fliers/tax-invoice-efliers.pdf
- GST Portal GSTR-1 guidance for credit/debit-note reporting: https://tutorial.gst.gov.in/contextualhelp/Einv/GSTR_1.htm
- GSTN authorised IRP boundary and supported invoice/credit-note/debit-note document types: https://einvoice6.gst.gov.in/content/irp-for-e-invoicing/
- CBIC accounts and records rules: https://cbic-gst.gov.in/accnt-record-rules.html
- Official GSTN E-Way Bill API portal and current 2026 enhancements: https://docs.ewaybillgst.gov.in/apidocs/
- Official E-Way Bill API interface flow, including EBN and Part B acknowledgement handling: https://docs.ewaybillgst.gov.in/apidocs/interfacing-examples.html
- Official E-Way Bill cancellation API and 24-hour generator boundary: https://docs.ewaybillgst.gov.in/apidocs/version1.03/cancel-eway-bill.html
- Official E-Way Bill validity-extension API, timing window and transport evidence: https://docs.ewaybillgst.gov.in/apidocs/version1.03/extend-validity.html
- Official consolidated E-Way Bill API: https://docs.ewaybillgst.gov.in/apidocs/version1.01/consolidated-eway-bill.html
- Official 2026 E-Way Bill closure API: https://docs.ewaybillgst.gov.in/apidocs/version1.03/closure-eway-bill.html
- Official IRP cancellation guidance: https://einvoice6.gst.gov.in/content/kb/cancelling-e-invoice/
- Official IRP core API overview: https://einvoice6.gst.gov.in/content/kb/overview-of-core-apis/
- Official IRP signed JSON and QR verification tools: https://einvoice6.gst.gov.in/content/kb/tools/
- Official E-Way Bill user manual for invoice/bill/challan and transporter/vehicle prerequisites: https://docs.ewaybillgst.gov.in/Documents/usermanual_ewb.pdf
- CBIC inter-State invoice place-of-supply instruction: https://cbic-gst.gov.in/pdf/circular-cgst-90.pdf
- Official IGST place-of-supply provisions: https://cbic-gst.gov.in/hindi/IGST-bill-e.html
- Ministry of Corporate Affairs Ind AS 2, Inventories: https://www.mca.gov.in/Ministry/pdf/IndAS2_2020_10112020.pdf
- ICAI Accounting Standard (AS) 2 access page: https://indasaccess.icai.org/Volume-III/AS/asb.html?a=105
- ICAI Guidance Note on Audit of Inventories: https://www.icai.org/post/guidance-note-on-audit-of-inventories
- Income Tax Department tax-payment FAQ for the 1 April 2026 Income-tax Act transition, TDS section 393 tables and TCS section 394: https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tax-payments-faq?mobile-app=1
- Income Tax Department TDS compliance FAQ for ERP/payroll numbering transition and debit/receipt timing: https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/%20tds%20compliance-faq
- EPFO Electronic Challan-cum-Return compliance guidance: https://www.epfindia.gov.in/site_docs/PDFs/Circulars/Y2025-2026/ComplianceLetter_08102025.pdf
- ESIC contribution-rate information: https://web.esic.gov.in/attachments/publicationfile/a0fcbe626df989f95a7ac47891c6c247.pdf
- Ministry of Labour employer/LIN information: https://www.labour.gov.in/offerings/initiative/details/employer-YTM4ETMtQWa
- CBIC IGST Act section 16 zero-rated export and SEZ supply boundary: https://cbic-gst.gov.in/hindi/IGST-bill-e.html
- CBIC tax-invoice rules for export endorsements and destination particulars: https://cbic-gst.gov.in/gst-invoice-rules.html
- CBIC sector FAQ for supplies to SEZ and authorized-operations evidence: https://cbic-gst.gov.in/hindi/sectoral-faq.html?ld=SDINSOADirect

## Next localization controls

1. Composition and reverse-charge accounting, deeper withholding returns/certificate reconciliation, and customs/shipping-bill adapter depth.
2. Provider-specific IRP/GSP authentication and submission packs, certification fixtures and production conformance monitoring.
3. Indian language, number-to-words, UPI mandate depth, and document-template localization.
